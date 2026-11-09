import re
import unicodedata
from app.services.facility_preferences import requested_facilities
from app.models import AgentAnalysis, PlaceStop, PlannedRouteOption, RouteNeeds, RouteRequest, CURRENT_LOCATION_WORDS


def _loop_walk_minutes(req: RouteRequest) -> int | None:
    if req.loop_minutes is not None:
        return req.loop_minutes
    text = unicodedata.normalize("NFKC", req.prompt)
    # 「東京駅まで30分散歩」など明確な別目的地指定がある場合は周回散歩とみなさない
    has_explicit_dest = bool(re.search(r"[^\s]+(?:まで|へ行く|に行きたい)", text) and
                            not re.search(r"戻る|戻って|周回|一周|ループ|発着|現在地", text))
    if has_explicit_dest:
        return None

    loop_words = r"周回|ループ|一周|おまかせ|戻って|戻る|散歩|散策|ウォーキング|歩き|歩く|歩こう|歩いて|loop|circuit|环线|一圈|回到|walk|stroll"
    active_loop = bool(req.origin and req.origin == req.destination and req.previous_user_prompt
                       and re.search(loop_words, req.previous_user_prompt, re.IGNORECASE))
    if active_loop:
        if re.search(r"\d+\s*(?:分|時間|minutes?|min|hours?|小时|分钟)", text, re.IGNORECASE):
            text += " 周回"
        else:
            text = unicodedata.normalize("NFKC", req.previous_user_prompt) + " " + text
    if not re.search(loop_words, text, re.IGNORECASE):
        return None
    matches = list(re.finditer(r"(?:(\d+)\s*(?:時間|hours?|小时)(?:\s*(\d+)\s*(?:分|minutes?|min|分钟))?|(\d+)\s*(?:分|minutes?|min|分钟))", text, re.IGNORECASE))
    if not matches:
        return None
    match = matches[-1]
    return int(match.group(1) or 0)*60 + int(match.group(2) or match.group(3) or 0)


def _loop_origin(req: RouteRequest) -> str:
    text = unicodedata.normalize("NFKC", req.prompt)
    match = re.search(r"(?:^|[。\n])\s*([^、。\n]+?)(?:から|発で|発の)", text)
    return match.group(1).strip() if match else (req.origin or "現在地")


def _apply_loop_request(req: RouteRequest, analysis: AgentAnalysis) -> AgentAnalysis:
    minutes = _loop_walk_minutes(req)
    analysis.loop_minutes = None  # Only the user request can enable loop routing.
    if minutes is not None and 5 <= minutes <= 240:
        analysis.loop_minutes = minutes
        orig = _loop_origin(req)
        analysis.origin_query = orig
        analysis.destination_query = orig
    return analysis


def _apply_waypoint_request(req: RouteRequest, analysis: AgentAnalysis) -> AgentAnalysis:
    """Replace stops for UI edits; preserve planner additions for natural-language refinements."""
    if not req.waypoints_explicit and not req.waypoints:
        return analysis
    stops = []
    for index, name in enumerate(req.waypoints):
        if not name.strip():
            continue
        point = req.waypoint_locations[index] if index < len(req.waypoint_locations) else None
        stops.append(PlaceStop(name=name.strip(), lat=point.lat if point else 0,
                               lng=point.lng if point else 0, reason="指定経由地", tags=["経由地"], purpose="user_stop"))
        stops[-1]._coordinates_confirmed = point is not None
    road_refinement = bool(req.waypoints and re.search(r"歩道|広い|大通り|道幅|街灯|坂|日陰|sidewalk|wide|lighting|slope", req.prompt, re.IGNORECASE)
                           and not re.search(r"海|川沿い|公園|景観|景色|観光|緑", f"{req.previous_user_prompt or chr(32)} {req.prompt}") and not _requested_roads(req.prompt))
    for plan in analysis.planned_routes:
        if road_refinement and not req.waypoints_explicit:
            # A road-condition refinement does not authorize extra unnamed shops or attractions.
            plan.suggested_stops = [s for s in plan.suggested_stops if s.name in req.waypoints or s.name in req.prompt]
        if req.waypoints_explicit:
            plan.suggested_stops = [stop.model_copy(deep=True) for stop in stops]
        else:
            # Keep new experience anchors. Confirmed UI pins override matching model coordinates.
            required = {stop.name.casefold(): stop for stop in stops}
            merged = []
            for stop in plan.suggested_stops:
                confirmed = required.pop(stop.name.strip().casefold(), None)
                merged.append(confirmed.model_copy(deep=True) if confirmed else stop)
            missing = [stop.model_copy(deep=True) for stop in required.values()]
            plan.suggested_stops = missing + merged
    analysis.needs.stops = any(plan.suggested_stops for plan in analysis.planned_routes)
    return analysis


def _limit_road_anchors(req: RouteRequest, analysis: AgentAnalysis) -> AgentAnalysis:
    """Road routing does not authorize unrelated attractions or unlimited anchors."""
    text = unicodedata.normalize("NFKC", f"{req.previous_user_prompt or ''} {req.prompt}")
    roads = _requested_roads(text)
    road_preference = bool(re.search(r"大通り|幹線道路|道幅|広い道|広い通り|主要道路|歩道|街灯|明るい道|坂|足.{0,5}痛|日陰|wide road|main road|sidewalk|slope|shade", text, re.IGNORECASE))
    if (not roads and not road_preference) or req.reroute_only or req.waypoints_explicit:
        return analysis
    required = {name.strip() for name in req.waypoints}
    other_experience = bool(requested_facilities(text)) or bool(re.search(r"海|川沿い|景色|景観|公園|観光|カフェ|喫茶|トイレ|休憩|商店街|花|木陰", text))
    for plan in analysis.planned_routes:
        plan._requested_road_names = roads
        kept, anchor_count = [], 0
        for stop in plan.suggested_stops:
            named_by_user = stop.name in required or stop.name in text
            if named_by_user:
                kept.append(stop)
            elif roads and stop.purpose == "road_anchor":
                if anchor_count < 2 * len(roads):
                    kept.append(stop)
                    anchor_count += 1
            elif other_experience:
                kept.append(stop)
            # A road-only request does not authorize generated shops/attractions.
        plan.suggested_stops = kept
    analysis.needs.stops = any(plan.suggested_stops for plan in analysis.planned_routes)
    return analysis


def _requested_roads(text: str) -> list[str]:
    text = unicodedata.normalize("NFKC", text or "")
    return list(dict.fromkeys(re.findall(r"(?:国道|県道|都道|府道|道道)\s*\d+\s*号(?:線)?", text)))


def _road_usage_confirmed(road: str, instructions: list[str]) -> bool:
    def canonical(value: str) -> str:
        return re.sub(r"\s|号線", lambda m: "号" if m.group() == "号線" else "", unicodedata.normalize("NFKC", value))
    target = canonical(road)
    for instruction in instructions:
        # A sign, crossing or direction towards a road does not establish walking along it.
        for clause in re.split(r"[\n。]", instruction):
            text = canonical(clause)
            if target in text and not re.search(r"向か|横断|渡る|標識|方面|toward|cross|sign", text, re.IGNORECASE):
                if re.search(re.escape(target) + r"(?:に入|を(?:進|歩|通)|沿い|に沿|を北|を南|を東|を西)", text):
                    return True
    return False


def _gate_needs_to_prompt(req: RouteRequest, needs: RouteNeeds) -> RouteNeeds:
    """Prevent generic planner suggestions from triggering paid APIs."""
    text = f"{req.previous_user_prompt or ''} {req.prompt} {req.custom_system_prompt or ''} {', '.join(req.avoid_spots)}".lower()
    patterns = {
        "elevation": r"坂|階段|高低差|勾配|足.{0,5}(痛|疲|負担)|フラット|平坦|バリアフリー|車椅子|ベビーカー|hill|slope|flat|wheelchair",
        "pollen": r"花粉|花粉症|アレルギー|pollen|allerg",
        "air_quality": r"空気|排気|大気|喘息|air quality|pollution|smog",
        "shade": r"日陰|日差し|日射|涼し|暑|木陰|shade|sunlight|sunny|cooler",
        "street_view": r"街灯|明る|暗い|夜道|道幅|道が広|広い道|広め|幅の広|大通り|幹線道路|広い通り|主要道路|歩道|見通し|人通り|舗装|路面|でこぼこ|凸凹|段差|障害物|通りやす|歩きやす|車椅子|ベビーカー|海沿い|海岸|海辺|海を見|海が見え|川沿い|川辺|水辺|山並み|景色|景観|眺め|眺望|wide road|wide path|street light|well lit|lighting|visibility|scenic view|boulevard|main road|pavement|surface|obstacle|wheelchair",
        "stops": r"カフェ|喫茶|コーヒー|トイレ|お手洗い|休憩|寄り道|立ち寄|店に|海沿い|海岸|海辺|海を見|川沿い|川辺|商店街|市場|港|公園|景色|景観|眺め|眺望|観光|周回|ループ|一周|散歩コース|おまかせ|未開拓|歩いたこと|知らない道|新しい道|別の道|restaurant|cafe|restroom|toilet|stop by|waterfront|riverside|scenic|sightseeing|loop|circuit|unwalked|new route",
    }
    # Fail closed: Gemini can over-read generic safety suggestions as user intent.
    # Only explicit cues in the user's own text authorize optional paid API calls.
    values = {name: bool(re.search(pattern, text)) for name, pattern in patterns.items()}
    if _requested_roads(text) or req.avoid_spots or requested_facilities(text):
        values["stops"] = True
    return RouteNeeds(**values, priorities=needs.priorities)


def _wants_experience_route(prompt: str) -> bool:
    """Whether the user wants to walk through a kind of place, not merely reach the endpoint."""
    return bool(_requested_roads(prompt)) or bool(re.search(
        r"海沿い|海岸|海辺|海を見|海が見え|川沿い|川辺|水辺|港|商店街|市場|景色|景観|眺め|眺望|街歩き|散歩|観光|周回|ループ|一周|おまかせ|waterfront|riverside|scenic|sightseeing|loop|circuit",
        prompt or "", re.IGNORECASE,
    ))


def _requested_visual_target(prompt: str) -> str | None:
    text = prompt or ""
    for pattern, target in (
        (r"海沿い|海岸|海辺|海を見|海が見え|waterfront|ocean|sea", "海"),
        (r"川沿い|川辺|川を見|川が見え|riverside|river", "川"),
        (r"山並み|山を見|山が見え|mountain view", "山"),
    ):
        if re.search(pattern, text, re.IGNORECASE):
            return target
    return None


def _simple_route_analysis(req: RouteRequest) -> AgentAnalysis | None:
    """Skip Gemini for a plain A-to-B request with no supplemental preferences."""
    if req.reroute_only and req.origin_location and req.destination_location:
        stops = [PlaceStop(name=name, lat=point.lat, lng=point.lng, reason="位置を指定した経由地", tags=["経由地"], purpose="user_stop")
                 for name, point in zip(req.waypoints, req.waypoint_locations)]
        for stop in stops:
            stop._coordinates_confirmed = True
        return AgentAnalysis(summary="移動したピンを反映して徒歩ルートを再計算しました。",
            origin_query=req.origin or "出発地", destination_query=req.destination or "目的地",
            inferred_factors=[], planned_routes=[PlannedRouteOption(route_id="route_edited",
                title="ピンの位置を反映したルート", concept="指定した位置と順序を通る徒歩ルート", tags=["ピン移動反映"], suggested_stops=stops)],
            needs=RouteNeeds(stops=bool(stops)))
    # 周回・ループ散歩の場合はGeminiによる魅力的な経由地選定が必要なためスキップしない
    is_loop = bool(re.search(r"周回|ループ|一周|おまかせ.*分|分.*おまかせ|戻る.*散歩|circuit|loop|散歩|散策|ウォーキング|walk", req.prompt, re.IGNORECASE))
    if _loop_walk_minutes(req) and req.origin and not req.waypoints and not req.reroute_only:
        minutes = _loop_walk_minutes(req)
        origin = _loop_origin(req)
        plans = [PlannedRouteOption(route_id=f"loop_{i + 1}", title=f"周回散歩案{i + 1}",
            concept="指定時間に近い実道路の徒歩周回", tags=["周回"], suggested_stops=[])
            for i in range(min(req.route_count, 4))]
        return AgentAnalysis(loop_minutes=minutes, summary=f"{origin}発着・約{minutes}分の周回散歩を探索します。",
            needs=_gate_needs_to_prompt(req, RouteNeeds()),
            origin_query=origin, destination_query=origin, inferred_factors=[], planned_routes=plans)
    if is_loop:
        return None

    # 経由地の抽出（req.waypoints またはプロンプト内の「〇〇」を経由して）
    raw_waypoints = list(req.waypoints)
    if not raw_waypoints and not req.waypoints_explicit:
        found_brackets = re.findall(r"「([^」]+)」", req.prompt)
        dest_candidate = (req.destination or "").strip()
        raw_waypoints = [w.strip() for w in found_brackets if w.strip() and w.strip() != dest_candidate]

    stops_list: list[PlaceStop] = []
    for idx, wp_name in enumerate(raw_waypoints):
        wp_loc = req.waypoint_locations[idx] if idx < len(req.waypoint_locations) else None
        stops_list.append(
            PlaceStop(
                name=wp_name,
                lat=wp_loc.lat if wp_loc else 0.0,
                lng=wp_loc.lng if wp_loc else 0.0,
                reason="指定経由地",
                tags=["経由地"], purpose="user_stop",
            )
        )

    for index, stop in enumerate(stops_list):
        stop._coordinates_confirmed = index < len(req.waypoint_locations) and req.waypoint_locations[index] is not None

    # ユーザーがプロンプトで特定の希望（坂道回避、雨よけ、大通り、夜道、カフェ等）やNGスポット、反復プロンプトを入力している場合は、Geminiによる要望最適化エージェントを駆動
    empty_needs = _gate_needs_to_prompt(req, RouteNeeds())
    prompt_text = req.prompt.strip()
    dest_name = (req.destination or "").strip()
    # プロンプトが目的地名単体（または「〜へ」「〜まで」の単純目的地）以外であれば、何らかの要望や変更指示が含まれている
    is_plain_dest_only = (
        not prompt_text
        or prompt_text == dest_name
        or re.sub(r'(?:まで|へ|に行きたい|に向かう|を目指す|歩きたい|行きたい)$', '', prompt_text).strip() == dest_name
    )

    has_specific_preferences = (
        bool(requested_facilities(prompt_text)) or
        any(v for k, v in empty_needs.model_dump().items() if k != "stops" and v)
        or bool(req.avoid_spots)
        or bool(req.custom_system_prompt)
        or bool(req.previous_route_summary)
        or bool(req.previous_user_prompt)
        or not is_plain_dest_only
        or bool(re.search(r"雨|濡れ|傘|屋根|地下|坂|階段|フラット|平坦|大通り|幹線|明る|安全|夜道|カフェ|喫茶|コーヒー|休憩|トイレ|景色|景観|眺め|商店街|回避|変更|変えて|別|もっと|寄り道|通っ|経由|おすすめ", prompt_text))
    )
    if has_specific_preferences:
        return None

    # ピン指し・施設選択で目的地座標が直接指定されており、かつ定型のA-to-Bリクエストの場合は、Geminiによる勝手な目的地書き換えを防ぎ高速直行
    if req.destination_location and not is_loop:
        origin = (req.origin or "現在地").strip()
        destination = (req.destination or "指定した地点").strip()
        via_summary = f"（{', '.join(raw_waypoints)}経由）" if raw_waypoints else ""
        plans = [
            PlannedRouteOption(route_id="route_default", title=f"{destination}への最適ルート{via_summary}", concept=f"{destination}へ向かう確実な徒歩ルート", tags=["指定地点直行"] + (["経由地あり"] if raw_waypoints else []), suggested_stops=stops_list),
            PlannedRouteOption(route_id="route_alt_1", title=f"{destination}への代替ルート1{via_summary}", concept="別道路を経由する代替ルート", tags=["代替ルート"] + (["経由地あり"] if raw_waypoints else []), suggested_stops=stops_list),
            PlannedRouteOption(route_id="route_alt_2", title=f"{destination}への代替ルート2{via_summary}", concept="大通りを中心とする代替ルート", tags=["大通り優先"] + (["経由地あり"] if raw_waypoints else []), suggested_stops=stops_list),
        ][:req.route_count]
        return AgentAnalysis(
            summary=f"{origin}から{via_summary}「{destination}」への徒歩ルートを作成しました。",
            origin_query=origin,
            destination_query=destination,
            inferred_factors=[],
            planned_routes=plans,
            needs=RouteNeeds(stops=bool(stops_list)),
        )

    empty_needs = _gate_needs_to_prompt(req, RouteNeeds())
    # 経由地のみの指定の場合は Gemini を呼ばずにそのまま直行探索へ回す
    has_other_needs = any(v for k, v in empty_needs.model_dump().items() if k != "stops" and v)
    if has_other_needs or req.avoid_spots or req.custom_system_prompt or req.previous_route_summary:
        return None

    prompt = req.prompt.strip()
    match = re.search(r"([^、。\s]+?)から\s*([^、。\s]+?)(?:まで|へ|に行きたい|に向かう|を目指す|歩きたい|行きたい|$)", prompt)
    origin = match.group(1) if match else (req.origin or "").strip()
    destination = match.group(2) if match else (req.destination or "").strip()
    if not origin or not destination or (origin in CURRENT_LOCATION_WORDS and not req.current_location):
        return None
    residual = prompt.replace(origin, "", 1).replace(destination, "", 1)
    residual = re.sub(r"から|より|まで|へ|に行きたい|に向かう|を目指す|歩きたい|行きたい|に行く|行く|まで歩く", "", residual)
    if residual.strip(" \t\r\n。、,.!?！？」『』"):
        return None
    plans = [
        PlannedRouteOption(route_id="route_default", title="標準の徒歩ルート", concept="Routes APIの推奨徒歩経路", tags=["標準"], suggested_stops=[]),
        PlannedRouteOption(route_id="route_alt_1", title="代替徒歩ルート", concept="Routes APIが算出した別経路", tags=["代替"], suggested_stops=[]),
        PlannedRouteOption(route_id="route_alt_2", title="もう一つの代替ルート", concept="Routes APIが算出した別経路", tags=["代替"], suggested_stops=[]),
    ][:req.route_count]
    return AgentAnalysis(
        summary="出発地と目的地を確認し、徒歩ルートを検索しました。",
        origin_query=origin,
        destination_query=destination,
        inferred_factors=[],
        planned_routes=plans,
        needs=empty_needs,
    )
