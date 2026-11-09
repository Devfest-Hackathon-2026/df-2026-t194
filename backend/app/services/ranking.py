import logging
import math
import re
from app.services.facility_preferences import requested_facilities, verified_facility

from app.models import EnvironmentContext, RouteCandidate, RouteNeeds, RouteRequest
from app.services.slope_options import slope_comparison_requested, select_slope_options, materially_improves
from app.services.constraints import strict_slope_limit, slope_verified_below, slope_constraint_message
from app.services.embeddinggemma import score_route_options
from app.services.intent import _requested_visual_target, _wants_experience_route, _loop_walk_minutes, _requested_roads, _road_usage_confirmed


def _ground_route_description(route: RouteCandidate) -> None:
    """Describe computed stops and API guidance, never the planner's unverified story."""
    stops = [stop.name for stop in route.waypoints[1:-1]]
    route.title = f"{stops[0]}経由の徒歩ルート" if stops else "目的地へ向かう徒歩ルート"
    parts = [f"約{round(route.metrics.duration_seconds / 60)}分・{route.metrics.distance_meters / 1000:.1f}km。"]
    if stops:
        parts.append("指定経路の経由地点: " + " → ".join(stops) + "。")
    route.concept = " ".join(parts)
    route.tags = ["実道路の徒歩経路"]
    route.safety_note = None
    route.fatigue_note = None
    route.seasonal_weather_note = None


def _distance_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    mean_lat = math.radians((lat1 + lat2) / 2)
    dx = (lng2 - lng1) * 111_320 * math.cos(mean_lat)
    dy = (lat2 - lat1) * 110_540
    return math.hypot(dx, dy)


def _route_self_overlap_percent(route: RouteCandidate) -> float:
    """Measure opposite-direction revisits at local resolution, including short spurs and U-turns."""
    # 1. ナビゲーション指示内のUターン判定
    has_u_turn_instruction = any(
        re.search(r"Uターン|U-turn|転回|後ろに戻る|引き返す|掉头|調頭|逆走|戻って", inst, re.IGNORECASE)
        for inst in route.metrics.navigation_instructions
    )

    path = route.metrics.path
    if len(path) < 3:
        return 35.0 if has_u_turn_instruction else 0.0
    origin = path[0]
    cosine = math.cos(math.radians(origin.lat))
    grid = {}
    total = repeated = travelled = 0.0
    for a, b in zip(path, path[1:]):
        ax, ay = (a.lng-origin.lng)*111320*cosine, (a.lat-origin.lat)*110540
        bx, by = (b.lng-origin.lng)*111320*cosine, (b.lat-origin.lat)*110540
        length = math.hypot(bx-ax, by-ay)
        if length < 0.01:
            continue
        ux, uy = (bx-ax)/length, (by-ay)/length
        count = max(1, math.ceil(length/8))
        for i in range(count):
            step = length/count
            fraction = (i+0.5)/count
            x, y = ax+(bx-ax)*fraction, ay+(by-ay)*fraction
            key = (math.floor(x/10), math.floor(y/10))
            match = False
            # 道路幅（最大約28m、大通りの両側歩道を含む）での逆方向進行（Uターン引き返し）を検出
            # 迂回路（別の通り）は通常35m以上離れているため誤検出しない
            for dx in range(-3, 4):
                for dy in range(-3, 4):
                    for px, py, vx, vy, distance in grid.get((key[0]+dx, key[1]+dy), []):
                        if travelled-distance >= 12 and ux*vx+uy*vy < -0.4 and math.hypot(x-px, y-py) <= 28.0:
                            match = True
                            break
                    if match:
                        break
                if match:
                    break
            if match:
                repeated += step
            total += step
            grid.setdefault(key, []).append((x,y,ux,uy,travelled))
            travelled += step

    calc_percent = round(repeated/total*100, 1) if total >= 50 else 0.0
    if has_u_turn_instruction:
        return max(35.0, calc_percent)
    return calc_percent


def _build_route_profile_for_decision(route: RouteCandidate, elevation_measured: bool = False) -> str:
    """Use verified attributes only; generated marketing copy must not decide route quality."""
    m = route.metrics
    inter_stops = route.waypoints[1:-1] if len(route.waypoints) > 2 else []
    stop_descs = []
    for w in inter_stops:
        open_str = "営業中" if w.open_now is True else ("営業時間外" if w.open_now is False else "")
        tags_str = "・".join(w.place_types) if w.place_verified else "施設情報未確認"
        stop_descs.append(f"{w.name}({tags_str}{'/' + open_str if open_str else ''})")
    stops_summary = f"経由地: {', '.join(stop_descs)}" if stop_descs else "経由地なし（直行）"
    shade_summary = f"、日陰率{route.solar_shade_percent:.0f}%" if route.solar_shade_percent is not None else ""
    air_summary = f"、経路中央付近AQI {m.air_quality_index}" if m.air_quality_index is not None else ""
    pollen_summary = f"、経路中央付近花粉指数 {m.pollen_index}" if m.pollen_index is not None else ""
    visual_summary = f"、道路状況: {' / '.join(route.street_view_assessment[:2])}" if route.street_view_assessment else ""
    if m.elevation_gain_meters > 0 or m.elevation_loss_meters > 0:
        elevation = (
            f"累積上り{m.elevation_gain_meters:.0f}m・累積下り{m.elevation_loss_meters:.0f}m、"
            f"観測した最大勾配 上り{m.max_sampled_uphill_grade_percent:.1f}%/下り{m.max_sampled_downhill_grade_percent:.1f}%"
        )
    elif elevation_measured:
        elevation = "累積上り0m（平坦）"
    else:
        elevation = "標高未計測"
    warnings = " / ".join(m.warnings) if m.warnings else "客観的警告なし"
    return (
        f"実測距離{m.distance_meters}m。実測所要時間{m.duration_seconds // 60}分。{elevation}。"
        f"経路APIの案内: {chr(32).join(m.navigation_instructions)}。"
        f"同一路線の再通過推定{m.self_overlap_percent or 0:.0f}%。{stops_summary}{shade_summary}{air_summary}{pollen_summary}{visual_summary}。{warnings}。"
    )


def _waypoint_route_fraction(route: RouteCandidate, waypoint_index: int) -> float | None:
    """Approximate where a routed waypoint falls along the computed path (0=start, 1=end)."""
    path = route.metrics.path
    waypoint = route.waypoints[waypoint_index]
    if len(path) < 2 or not waypoint.lat or not waypoint.lng:
        return None
    nearest_index = min(range(len(path)), key=lambda index: _distance_m(
        path[index].lat, path[index].lng, waypoint.lat, waypoint.lng
    ))
    lengths = [_distance_m(a.lat, a.lng, b.lat, b.lng) for a, b in zip(path, path[1:])]
    total = sum(lengths)
    return sum(lengths[:nearest_index]) / total if total > 0 else None


def _experience_waypoint_indices(route: RouteCandidate, target: str) -> list[tuple[int, float]]:
    """Find intermediate waypoints that explicitly describe the requested experience."""
    patterns = {
        "海": r"海|海岸|海辺|海浜|港|ビーチ|砂浜|waterfront|coast|shore|beach|ocean|sea",
        "川": r"川|河川|河岸|水辺|river|riverside|riverfront",
        "山": r"山|山並み|展望|mountain|viewpoint",
    }
    pattern = patterns.get(target)
    if not pattern:
        return []
    matches: list[tuple[int, float]] = []
    for index, waypoint in enumerate(route.waypoints[1:-1], start=1):
        description = waypoint.name if waypoint.place_verified else ""
        fraction = _waypoint_route_fraction(route, index)
        if fraction is not None and re.search(pattern, description, re.IGNORECASE):
            matches.append((index, fraction))
    return matches


def _evaluate_with_embeddinggemma_similarity(
    routes: list[RouteCandidate], req: RouteRequest, env: EnvironmentContext, elevation_measured: bool = False,
    priorities: list[str] | None = None,
) -> tuple[dict[str, float], str, float]:
    """Rank route descriptions by EmbeddingGemma 2 semantic similarity to the user's preference."""
    if not routes:
        return {}, "", 0.0
    user_parts = []
    if req.previous_user_prompt:
        user_parts.append(f"維持する前回の希望: {req.previous_user_prompt.strip()}")
    user_parts.append(f"今回の追加希望: {req.prompt.strip()}")
    if priorities:
        user_parts.append(f"希望の優先順位（左ほど重要）: {' > '.join(priorities)}")
    if req.custom_system_prompt:
        user_parts.append(f"重視する方針: {req.custom_system_prompt.strip()}")
    if req.avoid_spots:
        user_parts.append(f"回避したいNG条件: {', '.join(req.avoid_spots)}")
    if env.precipitation_mm > 0:
        user_parts.append(f"現在の天候: {env.weather_condition}（降水量 {env.precipitation_mm}mm）")
    user_desire_text = " / ".join(user_parts)
    route_criteria = {r.route_id: _build_route_profile_for_decision(r, elevation_measured) for r in routes}
    try:
        return score_route_options(user_desire_text, route_criteria)
    except Exception as exc:
        logging.getLogger("uvicorn.error").warning("EmbeddingGemma 2 route similarity unavailable: %s", type(exc).__name__)
        return {}, "", 0.0


def _rank_routes(
    routes: list[RouteCandidate],
    req: RouteRequest,
    env: EnvironmentContext,
    needs: RouteNeeds | None = None,
) -> list[RouteCandidate]:
    """Rank API-computed routes using EmbeddingGemma 2 270M text similarity + measurable API factors."""
    routes = [route for route in routes if route.metrics.distance_meters >= 20 and route.metrics.duration_seconds > 0]
    if not routes:
        return []
    q = (req.prompt or "").lower()
    custom_sys = (req.custom_system_prompt or "").lower()
    combined_q = f"{req.previous_user_prompt or ''} {q} {custom_sys}"

    grade_limit = strict_slope_limit(req)
    if grade_limit is not None:
        measured = any(len(route.metrics.elevation_profile_meters) >= 2 for route in routes)
        grades = [max(route.metrics.max_sampled_uphill_grade_percent, route.metrics.max_sampled_downhill_grade_percent)
                  for route in routes if len(route.metrics.elevation_profile_meters) >= 2
                  and math.isfinite(route.metrics.max_sampled_uphill_grade_percent) and math.isfinite(route.metrics.max_sampled_downhill_grade_percent)]
        closest_grade = min(grades) if grades else None
        routes = [route for route in routes if slope_verified_below(route, grade_limit)]
        if not routes:
            from app.services.maps import RouteSearchError
            raise RouteSearchError(slope_constraint_message(req.language, grade_limit, measured=measured, closest_grade=closest_grade))

    requested_roads = _requested_roads(combined_q)
    if re.search(r"(?:国道|県道|都道|府道|道道).*?(?:避け|通らな|使わな)", q):
        requested_roads = []  # Avoidance must not be interpreted as a request to use the road.

    prefers_flat = bool(needs and needs.elevation) or any(
        x in combined_q for x in ("坂", "階段", "足が痛", "足が疲", "疲れ", "flat", "hill", "バリアフリー", "車椅子", "ベビーカー")
    )
    is_fitness = any(x in combined_q for x in ("フィットネス", "早歩き", "カロリー", "運動", "fitness"))
    prefers_shelter = any(x in combined_q for x in ("雨", "濡れ", "屋根", "地下", "rain", "shelter")) or env.precipitation_mm > 0
    prefers_supermarket = "supermarket" in requested_facilities(combined_q)
    prefers_cafe = any(x in combined_q for x in ("カフェ", "喫茶", "コーヒー", "cafe"))
    prefers_toilet = any(x in combined_q for x in ("トイレ", "お手洗い", "restroom", "toilet", "洗手间", "wc"))
    prefers_experience_route = _wants_experience_route(combined_q)
    prefers_speed = bool(re.search(r"急いで|早く着|できるだけ早|最短で行|時間を短く|fastest|quick", combined_q))
    prefers_safe = any(x in combined_q for x in ("明る", "安全", "安心", "夜道", "治安", "大通り", "幹線道路", "広い通り", "主要道路", "wide", "safe"))
    requested_visual_target = _requested_visual_target(combined_q)
    maximize_requested_feature = bool(
        requested_visual_target and re.search(r"できる限り|できるだけ長く|最大限|最も長く|maximize|as long as possible", combined_q, re.IGNORECASE)
    )
    prefers_wide = bool(re.search(r"道幅|道が広|広い道|広め|幅の広|大通り|幹線道路|広い通り|主要道路|wide road|wide path|boulevard|main road", combined_q))
    prefers_lighting = bool(re.search(r"街灯|照明|明る|暗い|夜道|灯り|street light|lighting|well lit", combined_q))
    prefers_sidewalk = bool(re.search(r"歩道|歩行者専用|sidewalk|pedestrian path", combined_q))
    prefers_visibility = bool(re.search(r"見通し|視界|visibility", combined_q))
    prefers_surface = bool(re.search(r"舗装|路面|でこぼこ|凸凹|段差|歩きやす|歩きにく|surface|pavement", combined_q))
    prefers_unobstructed = bool(re.search(r"障害物|通りやす|歩行空間|ベビーカー|車椅子|obstacle|accessible", combined_q))
    prefers_shade = bool(needs and needs.shade) or any(x in combined_q for x in ("日陰", "日差し", "涼し", "暑", "shade", "sun"))

    for route in routes:
        _ground_route_description(route)
        route.metrics.self_overlap_percent = _route_self_overlap_percent(route)

    # EmbeddingGemma 2 の同一ベクトル空間で、希望文と実測ルート記述の意味類似度を比較。
    if routes:
        route_probs, best_route_id, decision_ms = _evaluate_with_embeddinggemma_similarity(
            routes, req, env, elevation_measured=bool(needs and needs.elevation),
            priorities=needs.priorities if needs else None,
        )
    else:
        route_probs, best_route_id, decision_ms = {}, "", 0.0
    max_prob = max(route_probs.values(), default=0.0)

    loop_minutes = _loop_walk_minutes(req)
    baseline = min((r.metrics.duration_seconds for r in routes), default=0)
    air_values = [r.metrics.air_quality_index for r in routes]
    pollen_values = [r.metrics.pollen_index for r in routes]
    air_comparable = len(routes) > 1 and all(v is not None for v in air_values) and len(set(air_values)) > 1
    pollen_comparable = len(routes) > 1 and all(v is not None for v in pollen_values) and len(set(pollen_values)) > 1
    raw_scores = {}
    for route in routes:
        m = route.metrics
        score = 70.0
        reasons: list[str] = []
        m.unverified_preferences = []
        if grade_limit is not None:
            reasons.append(f"必須の坂回避: 標高サンプルで上り・下りとも勾配{grade_limit:g}%未満を確認。サンプル間の短い坂や階段は未確認です")
        if loop_minutes:
            time_error = abs(m.duration_seconds - loop_minutes * 60) / (loop_minutes * 60)
            score += 6.0 - min(36.0, time_error * 45.0)
            reasons.append(f"周回の目標{loop_minutes}分 / 実道路の徒歩時間{round(m.duration_seconds / 60)}分を比較")
        if not route_probs:
            reasons.append("EmbeddingGemma 2を利用できず、ルート意味類似度の比較なし（数値・ルール評価のみ）")

        if m.self_overlap_percent >= 1.0:
            # ユーザーの明確な要望: 同じ道を戻るなら時間と距離が伸びるほうが良い
            retrace_penalty = 200.0 if m.self_overlap_percent >= 3.0 else 100.0
            score -= retrace_penalty
            m.warnings.append(f"通ってきた道路をUターンして戻る区間を検出（重複約{m.self_overlap_percent:.0f}%）。迂回ルートを優先推奨")
            reasons.append(
                f"通ってきた道をUターンして戻る区間（約{m.self_overlap_percent:.0f}%）があるため大幅減点（時間・距離が伸びても迂回して戻るルートを最優先）"
            )

        # 0. EmbeddingGemma 2 relative semantic similarity
        if route.route_id in route_probs and max_prob > 0:
            prob = route_probs[route.route_id]
            m.decision_match_prob = round(prob, 4)
            m.decision_latency_ms = round(decision_ms, 1)
            uniform = 1.0 / max(len(routes), 1)
            decision_delta = max(-4.0, min(4.0, (prob - uniform) * 18.0))
            score += decision_delta
            if route.route_id == best_route_id:
                reasons.append(f"🧠 EmbeddingGemma 2: 候補間の相対評価が最高（{prob * 100:.1f}% / {decision_ms:.0f}ms）")
            else:
                reasons.append(f"🧠 EmbeddingGemma 2: 候補間の相対評価 {prob * 100:.1f}%（{decision_ms:.0f}ms）")

        # 1. 回避条件
        if req.avoid_spots:
            all_text = " ".join([route.title, route.concept] + route.tags + m.navigation_instructions + [w.name + " " + " ".join(w.tags) for w in route.waypoints]).lower()
            hit_spots = [spot for spot in req.avoid_spots if spot.lower() in all_text]
            if hit_spots:
                score -= min(35.0, len(hit_spots) * 20.0)
                reasons.append(f"回避指定エリア・条件（{', '.join(hit_spots)}）を含む可能性があるため減点")
            else:
                score += 10.0
                reasons.append("経路情報に回避対象の記載はありませんが、全条件を満たす保証ではありません")

        # 2. 高低差・坂道評価
        if is_fitness:
            ascent_reward = min(m.elevation_gain_meters * 0.08, 6.0)
            grade_reward = min(m.max_sampled_uphill_grade_percent * 0.1, 1.5)
            score += ascent_reward + grade_reward
            reasons.append(f"運動向けの上り量 {m.elevation_gain_meters:.0f}m・観測最大上り勾配 {m.max_sampled_uphill_grade_percent:.1f}% を反映")
        elif prefers_flat:
            vertical_load = m.elevation_gain_meters + 0.65 * m.elevation_loss_meters
            vertical_penalty = min(vertical_load * 0.35, 32.0)
            steepest_sampled_grade = max(m.max_sampled_uphill_grade_percent, m.max_sampled_downhill_grade_percent)
            grade_penalty = min(max(0.0, steepest_sampled_grade - 5.0) * 0.8, 12.0)
            score -= vertical_penalty + grade_penalty
            reasons.append(
                f"坂負荷を反映: 上り{m.elevation_gain_meters:.0f}m・下り{m.elevation_loss_meters:.0f}m、"
                f"標高サンプルの最大勾配 上り{m.max_sampled_uphill_grade_percent:.1f}%/下り{m.max_sampled_downhill_grade_percent:.1f}%"
            )
            reasons.append("標高から坂を推定。階段の有無はこのデータでは判定していません")

        # Facility attributes must come from Places, never from generated names or tags.
        if prefers_toilet:
            toilets = [w for w in route.waypoints[1:-1] if w.place_verified and w.restroom is True]
            usable = [w for w in toilets if w.open_now is not False]
            if usable:
                score += 20.0
                reasons.append(f"Placesでトイレ設備を確認した施設を経由: {usable[0].name}（利用条件・清潔さは未確認）")
            else:
                score -= 15.0
                m.unverified_preferences.append("toilet")
                reasons.append("利用できるトイレ設備をAPIで確認できた経由地がありません")
        if prefers_shelter:
            m.unverified_preferences.append("rain_shelter")
            reasons.append("連続した雨よけ・地下道の経路検索は未対応です。この希望は採点していません")
        if prefers_cafe:
            cafes = [w for w in route.waypoints[1:-1] if w.place_verified and any(t in w.place_types for t in ("cafe", "coffee_shop"))]
            if any(w.open_now is True for w in cafes):
                score += 18.0
                reasons.append("Placesで現在営業中を確認したカフェを経由（到着時の営業は未確認）")
            elif any(w.open_now is None for w in cafes):
                score += 8.0
                reasons.append("Placesでカフェを確認。営業状況は未確認です")
            elif cafes:
                score -= 12.0
                m.unverified_preferences.append("cafe_closed")
                reasons.append("経由カフェは現在営業時間外です")
            else:
                score -= 10.0
                m.unverified_preferences.append("cafe")
                reasons.append("カフェとAPIで確認できた経由地がありません")

        if prefers_supermarket:
            stores = [w for w in route.waypoints[1:-1] if verified_facility(w, 'supermarket')]
            if any(w.open_now is True for w in stores):
                score += 18.0
                reasons.append("Placesでスーパー種別・現在営業中を確認した店舗を経由（到着時の営業は未確認）")
            elif any(w.open_now is None for w in stores):
                score += 8.0
                reasons.append("Placesでスーパーを確認した店舗を経由（営業状況は未確認）")
            else:
                score -= 15.0
                m.unverified_preferences.append('supermarket')
                reasons.append("スーパーの経由を確認できないか、確認した店舗が現在営業時間外です。この希望は未達です")

        if prefers_experience_route:
            experiential_stops = route.waypoints[1:-1]
            if experiential_stops:
                score += min(14.0, 7.0 * len(experiential_stops))
                stop_names = "、".join(stop.name for stop in experiential_stops)
                reasons.append(f"希望された散歩体験を経由地点で経路化: {stop_names}")
            else:
                score -= 8.0
                reasons.append("沿線・景観の希望を経由地点にできていないため減点")

        if requested_visual_target:
            visible_samples = [
                o for o in route.street_view_observations
                if o.requested_feature_visibility == "visible" and o.confidence >= 0.35
            ]
            observed_samples = [
                o for o in route.street_view_observations
                if o.requested_feature_visibility in {"visible", "not_visible"} and o.confidence >= 0.35
            ]
            route.metrics.feature_visibility_percent = (
                round(len(visible_samples) * 100 / len(observed_samples), 1) if observed_samples else None
            )
            if visible_samples:
                reasons.append(f"Street Viewの代表地点{len(visible_samples)}箇所で{requested_visual_target}を確認（その地点の撮影画像時点のみ）")
            if observed_samples:
                reasons.append(f"希望対象の画像内視認率 {route.metrics.feature_visibility_percent:.0f}%（判定できた代表画像のみ）")

            target_stops = _experience_waypoint_indices(route, requested_visual_target)
            asks_for_main_road = bool(re.search(r"大通り|幹線道路|広い通り|主要道路|boulevard|main road", combined_q, re.IGNORECASE))
            road_pattern = r"大通り|幹線道路|広い通り|主要道路|幹線|広い歩道|boulevard|main road"
            road_stops = [
                (index, fraction)
                for index, waypoint in enumerate(route.waypoints[1:-1], start=1)
                if (fraction := _waypoint_route_fraction(route, index)) is not None
                if re.search(road_pattern, " ".join([waypoint.name, waypoint.reason, *waypoint.tags]), re.IGNORECASE)
            ]
            if target_stops:
                if len(target_stops) >= 2:
                    span = max(fraction for _, fraction in target_stops) - min(fraction for _, fraction in target_stops)
                    route.metrics.experience_span_percent = round(span * 100, 1)
                    span_cap = 18.0 if maximize_requested_feature else 12.0
                    # Endpoint spacing does not measure coastal walking length.
                    score += min(4.0, span * 4.0) if len(visible_samples) >= 2 else 0.0
                    preference_label = "希望"
                    reasons.append(f"{preference_label}の{requested_visual_target}沿い地点を{len(target_stops)}箇所、経路上に分散（地点間の経路比約{span:.0%}。連続した沿岸区間の保証ではありません）")
                else:
                    route.metrics.experience_span_percent = 0.0 if target_stops else None
                    fraction = target_stops[0][1]
                    if maximize_requested_feature:
                        score -= 8.0
                        reasons.append(f"{requested_visual_target}沿いの経由地点が1箇所だけで、区間の長さを最大化できた根拠がありません")
                    elif fraction >= 0.72:
                        score -= 12.0
                        reasons.append(f"{requested_visual_target}沿いの希望地点がゴール直前の1箇所に偏るため減点")
                    else:
                        score += 3.0
                        reasons.append(f"{requested_visual_target}沿いの希望地点を経由（1箇所のみ。沿線を歩く区間は未確認）")
            elif prefers_experience_route:
                score -= 6.0
                reasons.append(f"{requested_visual_target}沿いと確認できる経由地点がなく、景観希望の実現性を確認できません")

            if maximize_requested_feature:
                m.unverified_preferences.append("continuous_scenery")
                reasons.append("景観が続く区間の長さは計測できず、最大化は未対応です。代表画像の景観を比較しています")

            if asks_for_main_road:
                if road_stops:
                    reasons.append(
                        f"経由地の説明に大通り・幹線道路の記載が{len(road_stops)}箇所ありますが、道路種別そのものは未確認です"
                    )
                elif any(o.road_width != "unknown" for o in route.street_view_observations):
                    reasons.append("Street Viewで歩行空間の幅は観察しましたが、道路が大通り・幹線道路かは未確認です")
                else:
                    reasons.append("大通り・幹線道路かどうかを確認できるデータがなく、道路種別は未評価です")
                if target_stops and road_stops:
                    road_end = max(fraction for _, fraction in road_stops if fraction is not None)
                    target_start = min(fraction for _, fraction in target_stops)
                    if road_end < target_start and target_start - road_end >= 0.08:
                        score += 4.0
                        reasons.append("大通り区間の後に海沿い区間へ移る順序を確認")
                    elif road_end >= target_start:
                        score -= 6.0
                        reasons.append("大通りと海沿いの希望地点が重なるか順序が曖昧なため減点")

        # Sidewalks are a default walking preference, based only on available images.
        # Missing / out-of-frame evidence is neutral, never proof of no sidewalk.
        sidewalk_samples = [obs for obs in route.street_view_observations
                            if obs.sidewalk == "visible" and obs.confidence >= 0.35]
        if sidewalk_samples:
            support = sum(obs.confidence for obs in sidewalk_samples) / 3.0
            score += (36.0 if prefers_sidewalk else 28.0) * support
            reasons.append(f"歩道を代表画像{len(sidewalk_samples)}/3地点で視認できたため優先（撮影時点・経路全体の連続性は未確認）")
            if len(sidewalk_samples) < 2:
                reasons.append("歩道の確認は1地点のみで根拠が限定的なため、小さな加点にとどめています")
        else:
            reasons.append("歩道を確認できる画像の根拠がなく、歩道の有無は未評価")

        if prefers_lighting:
            lights = [obs for obs in route.street_view_observations
                      if obs.street_lighting == "visible" and obs.confidence >= 0.35]
            if lights:
                score += 48.0 * sum(obs.confidence for obs in lights) / 3.0
                reasons.append(f"同じ道路の街灯を進行方向の代表画像{len(lights)}/3地点で視認できたため優先（撮影時点。現在の点灯・連続性は未確認）")
            else:
                reasons.append("進行方向の画像で街灯を確認できませんでした。街灯が存在しないという判定ではなく、希望への適合は未確認です")

        # 6. Street View visual evidence, limited to the requested dimensions.
        wants_visual_evidence = prefers_wide or prefers_safe or requested_visual_target or prefers_surface or prefers_unobstructed or prefers_sidewalk
        if wants_visual_evidence:
            requested_dimensions = []
            if prefers_wide:
                requested_dimensions.append(("道幅", "road_width", {"wide": 1.0, "normal": 0.0, "narrow": -1.0}))
            if not prefers_lighting and (prefers_safe and not any((prefers_wide, prefers_sidewalk, prefers_visibility))):
                requested_dimensions.append(("街灯", "street_lighting", {"visible": 1.0, "not_visible": 0.0}))
            # Sidewalk evidence has its own weight above and is not diluted by other dimensions.
            if prefers_visibility or (prefers_safe and not any((prefers_wide, prefers_sidewalk, prefers_visibility))):
                requested_dimensions.append(("見通し", "visibility", {"good": 1.0, "average": 0.0, "poor": -1.0}))
            if prefers_surface:
                requested_dimensions.append(("路面状態", "surface_condition", {"smooth": 1.0, "uneven": -0.5, "damaged": -1.0}))
            if prefers_unobstructed:
                requested_dimensions.append(("歩行経路の障害物", "path_obstruction", {"clear": 1.0, "obstructed": -1.0}))
            if requested_visual_target:
                requested_dimensions.append((f"{requested_visual_target}の見え方", "requested_feature_visibility", {"visible": 1.0, "not_visible": -0.25}))

            dimension_scores: list[float] = []
            dimension_coverage: list[float] = []
            for label, field_name, value_map in requested_dimensions:
                evidence = [
                    (getattr(obs, field_name), obs.confidence) for obs in route.street_view_observations
                    if getattr(obs, field_name) in value_map and obs.confidence >= 0.35
                ]
                if evidence:
                    weighted_score = sum(value_map[value] * confidence for value, confidence in evidence) / sum(conf for _, conf in evidence)
                    dimension_scores.append(weighted_score)
                    dimension_coverage.append(len(evidence) / max(len(route.street_view_observations), 1))
                    dimension_weight = 18.0 if maximize_requested_feature and field_name == "requested_feature_visibility" else 12.0
                    score += weighted_score * (dimension_weight / max(len(requested_dimensions), 1))
                    if field_name == "road_width":
                        counts = {value: sum(v == value for v, _ in evidence) for value in ("wide", "normal", "narrow")}
                        reasons.append(f"代表画像の道幅: 広い{counts['wide']}・普通{counts['normal']}・狭い{counts['narrow']}地点（歩行空間の見た目・撮影時点）")
                    else:
                        reasons.append(f"Street Viewの{label}: {len(evidence)}/{len(route.street_view_observations)}地点で観察できた証拠を反映（撮影時点）")
                else:
                    # Missing evidence is neutral in route_score, but must not vanish from the reported match score.
                    dimension_scores.append(0.0)
                    dimension_coverage.append(0.0)
                    reasons.append(f"Street Viewの{label}: 根拠を取得できず未評価")
            if requested_dimensions:
                route.metrics.visual_match_coverage_percent = round(sum(dimension_coverage) / len(requested_dimensions) * 100, 1)
                route.metrics.visual_match_score = (
                    round(max(0.0, min(100.0, (sum(dimension_scores) / len(requested_dimensions) + 1) * 50)), 1)
                    if any(dimension_coverage) else None
                )
            else:
                route.metrics.visual_match_score = None
                route.metrics.visual_match_coverage_percent = None
            if route.street_view_observations:
                reasons.append("画像内で確認できない対象は不在と断定せず、代表地点の画像で確認できた証拠だけを採点。路面・障害物は撮影時点の局所観察で、区間全体や現在の状態を保証しません")
            elif route.street_view_assessment:
                reasons.append("Street Viewの構造化評価を取得できず、道幅・街灯は採点対象外")
            else:
                reasons.append("Street View画像の評価なし。道幅・街灯・見通しは未評価")

        # Visual canopy is potential cover, not current shade. Solar is not part of live ranking.
        if prefers_shade:
            cover = [o for o in route.street_view_observations if o.overhead_cover != "unknown" and o.confidence >= 0.35]
            if cover:
                supported = sum({"open": 0.0, "partial": 0.5, "covered": 1.0}[o.overhead_cover] * o.confidence for o in cover) / 3.0
                score += 12.0 * supported
                reasons.append(f"進行方向の代表画像{len(cover)}/3地点で上空の覆いを比較（日陰のなりやすさの参考。現在の日陰は未確認）")
            else:
                reasons.append("日陰の参考になる上空の覆いを確認できず、採点していません")
            m.unverified_preferences.append("current_shade")
        # Universal AQI uses 0=poor, 100=excellent. Compare only complete, differing observations.
        if needs and needs.air_quality:
            if air_comparable:
                score += (m.air_quality_index - min(air_values)) / (max(air_values) - min(air_values)) * 10.0
                reasons.append(f"経路中央付近のUniversal AQI {m.air_quality_index} を比較（高いほど良好、経路全体は未確認）")
            else:
                m.unverified_preferences.append("air_quality")
                reasons.append(f"経路中央付近のUniversal AQI {m.air_quality_index}。候補差がないかデータ不足のため順位には未反映")
        if needs and needs.pollen:
            if pollen_comparable:
                score += (max(pollen_values) - m.pollen_index) / (max(pollen_values) - min(pollen_values)) * 10.0
                reasons.append(f"経路中央付近の花粉指数 {m.pollen_index} を比較（低いほど少ない、経路全体は未確認）")
            else:
                m.unverified_preferences.append("pollen")
                reasons.append("花粉指数の候補差がないかデータ不足のため順位には未反映")
        if prefers_unobstructed or "階段" in combined_q or "段差" in combined_q:
            m.unverified_preferences.append("continuous_accessibility")

        # 9. 所要時間ペナルティ
        if not loop_minutes and baseline and m.duration_seconds > baseline and (not prefers_experience_route or prefers_speed):
            score -= min((m.duration_seconds - baseline) / max(baseline, 1) * 20, 15)
            reasons.append(f"所要時間 {m.duration_seconds // 60}分を比較に反映")

        for road in requested_roads:
            if _road_usage_confirmed(road, m.navigation_instructions):
                reasons.append(f"{road}への進入・通行を経路APIの案内で確認（連続通行距離は未計測）")
            else:
                score -= 20
                reasons.append(f"{road}に沿う通行を経路APIの案内で確認できません。この指定を満たす案としては未確認です")

        raw_scores[id(route)] = score
        m.route_score = round(max(0.0, min(100.0, score)), 1)
        m.score_reasons = reasons
        # Show why this route fits the request, rather than turn-by-turn instructions.
        evidence_reasons = [reason for reason in reasons
                            if not any(word in reason for word in ("EmbeddingGemma", "画像内で確認できない対象", "Street Viewの構造化"))]
        sidewalk_reason = next((reason for reason in evidence_reasons if reason.startswith("歩道")), None)
        other_reasons = [reason for reason in evidence_reasons if reason != sidewalk_reason]
        limited_sidewalk = next((reason for reason in other_reasons if reason.startswith("歩道の確認は")), None)
        selected_others = ([limited_sidewalk] if limited_sidewalk else []) + [r for r in other_reasons if r != limited_sidewalk]
        explanation = ([sidewalk_reason] if sidewalk_reason else []) + selected_others[:2]
        extra_minutes = round((m.duration_seconds - baseline) / 60) if baseline else 0
        if extra_minutes > 0:
            explanation.append(f"今回の最短候補より約{extra_minutes}分多く歩きます")
        route.concept = "。".join(explanation) if explanation else "取得できた経路情報で候補を比較しました。希望への適合を確認する情報は不足しています。"

    # 「同じ道を戻るなら時間と距離が伸びるほうが良い」
    # Uターン・ピストン重複（self_overlap_percent >= 1.0）のない迂回ルートを無条件で最上位に優先
    def facility_fit(route):
        stops=route.waypoints[1:-1]
        cafe=any(s.place_verified and s.open_now is not False and any(t in s.place_types for t in ('cafe','coffee_shop')) for s in stops)
        toilet=any(s.place_verified and s.restroom is True and s.open_now is not False for s in stops)
        return int(prefers_cafe and cafe)+int(prefers_toilet and toilet)+int(prefers_supermarket and any(verified_facility(s,"supermarket") and s.open_now is not False for s in stops))
    ranked = sorted(routes, key=lambda r: (
        facility_fit(r),
        (r.metrics.self_overlap_percent or 0.0) < 1.0,
        sum(_road_usage_confirmed(road, r.metrics.navigation_instructions) for road in requested_roads),
        raw_scores[id(r)]), reverse=True)
    from app.services.maps import _route_overlap_fraction
    unique = []
    for route in ranked:
        def duplicate(prior):
            a, b = route.metrics, prior.metrics
            ratio = min(a.distance_meters, b.distance_meters) / max(a.distance_meters, b.distance_meters, 1)
            if ratio < 0.85:
                return False
            if a.encoded_polyline and a.encoded_polyline == b.encoded_polyline:
                return True
            if slope_comparison_requested(req) and a.elevation_profile_meters and b.elevation_profile_meters:
                difference=abs(max(a.max_sampled_uphill_grade_percent,a.max_sampled_downhill_grade_percent)-max(b.max_sampled_uphill_grade_percent,b.max_sampled_downhill_grade_percent))
                distance_difference=abs(a.distance_meters-b.distance_meters)
                meaningful=materially_improves(route,prior) or materially_improves(prior,route)
                if difference>=2 or (meaningful and distance_difference>=max(20,min(a.distance_meters,b.distance_meters)*0.01)):
                    return False
            if a.path and b.path:
                return _route_overlap_fraction(a, b, threshold_m=12) >= 0.9
            return bool(a.encoded_polyline and a.encoded_polyline == b.encoded_polyline)
        if not any(duplicate(prior) for prior in unique):
            unique.append(route)
    if slope_comparison_requested(req) and grade_limit is None and not _loop_walk_minutes(req):
        return select_slope_options(unique,req.language)[:req.route_count]
    return unique
