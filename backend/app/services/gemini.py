import asyncio
import logging
import os
import re

from app.models import (
    AgentAnalysis,
    ContextFactor,
    EnvironmentContext,
    LatLng,
    PlaceStop,
    PlannedRouteOption,
    RouteCandidate,
    RouteMetrics,
    RouteNeeds,
    RouteRequest,
    CURRENT_LOCATION_WORDS,
)


def decode_polyline(polyline_str: str) -> list[LatLng]:
    """Google Encoded Polyline をフロントエンド描画用の [{lat, lng}, ...] にデコードする"""
    index, lat, lng = 0, 0, 0
    coordinates = []
    length = len(polyline_str)
    while index < length:
        changes = {"latitude": 0, "longitude": 0}
        for key in ["latitude", "longitude"]:
            shift, result = 0, 0
            while True:
                if index >= length:
                    break
                byte = ord(polyline_str[index]) - 63
                index += 1
                result |= (byte & 0x1F) << shift
                shift += 5
                if not byte >= 0x20:
                    break
            if result & 1:
                changes[key] = ~(result >> 1)
            else:
                changes[key] = result >> 1
        lat += changes["latitude"]
        lng += changes["longitude"]
        coordinates.append(LatLng(lat=round(lat / 1e5, 6), lng=round(lng / 1e5, 6)))
    return coordinates


def _mock_analysis(req: RouteRequest, env: EnvironmentContext) -> AgentAnalysis:
    prompt = req.prompt.strip()

    # 1. 出発地・目的地の動的抽出
    dest = (req.destination or "").strip()
    orig = (req.origin or "").strip()

    # プロンプトからの明示的な目的地指定・変更の検出
    explicit_dest: str | None = None
    m_from_to = re.search(r'([^\s、。〜～]+?)(?:から|より)\s*([^\s、。〜～]+?)(?:まで|へ|に行きたい|に向かう|を目指す)', prompt)
    if m_from_to:
        orig = m_from_to.group(1).strip()
        explicit_dest = m_from_to.group(2).strip()
    else:
        m_change = re.search(r'(?:目的地(?:を|は)?|行き先(?:を|は)?)\s*([^\s、。〜～]+?)(?:に|へ|で)?(?:変更|変えて|にして)?', prompt)
        if m_change and m_change.group(1).strip() not in ("変更", "変えて", "なし", ""):
            explicit_dest = m_change.group(1).strip()
        if not explicit_dest:
            m_dest = re.search(r'([^\s、。〜～]+?)(?:まで|へ|に行きたい|に向かう|を目指す)', prompt)
            if m_dest:
                candidate = m_dest.group(1).strip()
                non_dest = r"(坂|坂道|階段|雨|屋根|地下|大通り|幹線|明るい|安全|夜道|カフェ|喫茶|休憩|トイレ|近道|最短|快適|ルート|案内|おすすめ|散歩)$"
                if not re.search(non_dest, candidate):
                    explicit_dest = candidate

    if explicit_dest:
        dest = re.sub(r'(?:から|より|まで|へ|に行きたい|に向かう|を目指す|歩きたい|行きたい)$', '', explicit_dest).strip()
    elif req.destination_location and dest:
        # プロンプトで新たな目的地が指定されていない場合はピンの目的地を維持
        dest = dest
    elif not dest:
        clean_prompt = re.sub(r'(歩きたい|行きたい|向かいたい|散歩|最短|雨よけ|坂道|回避|おすすめ|快適|ルート|案内)', '', prompt)
        words = [w.strip() for w in re.split(r'[\s、。]+', clean_prompt) if w.strip()]
        if words:
            dest = words[-1]

    if not orig or orig in CURRENT_LOCATION_WORDS:
        m_orig = re.search(r'([^\s、。〜～]+?)(?:から|より)', prompt)
        if m_orig:
            orig = m_orig.group(1).strip()

    if dest:
        dest = re.sub(r'(?:から|より|まで|へ|に行きたい|に向かう|を目指す|歩きたい|行きたい)$', '', dest).strip()
    if orig:
        orig = re.sub(r'(?:から|より)$', '', orig).strip()

    if not dest or dest in CURRENT_LOCATION_WORDS:
        if req.destination_location and req.destination:
            dest = req.destination
        elif re.search(r'(ラーメン|飯|ご飯|食事|カフェ|ランチ|ディナー)', prompt):
            dest = "人気のグルメスポット"
        elif re.search(r'(公園|散歩|自然|緑)', prompt):
            dest = "近くの公園"
        else:
            dest = "目的地の名所"

    if not orig or orig in CURRENT_LOCATION_WORDS:
        orig = "現在地"

    # 周回・ループ散歩（同じ場所へ戻るおまかせ散歩、または「n分間散歩したい」など）判定
    has_explicit_dest = bool(re.search(r"[^\s]+(?:まで|へ行く|に行きたい)", prompt) and
                            not re.search(r"戻る|戻って|周回|一周|ループ|発着|現在地", prompt))
    is_loop = (not has_explicit_dest) and bool(re.search(r"(周回|ループ|一周|おまかせ|散歩コース|戻る|loop|circuit|散歩|散策|ウォーキング|歩く|歩き|walk)", prompt, re.IGNORECASE))
    minute_match = re.search(r"(\d+)\s*(?:分|時間|min|hours?)", prompt)
    target_minutes = int(minute_match.group(1)) if minute_match else 30
    if re.search(r"(\d+)\s*(?:時間|hours?)", prompt):
        h_match = re.search(r"(\d+)\s*(?:時間|hours?)", prompt)
        target_minutes = int(h_match.group(1)) * 60 if h_match else target_minutes

    if is_loop:
        dest = orig
        target_km = round(target_minutes * 0.08, 1)
        title_1 = f"案1: {orig}発着 水辺・環水公園周回コース（約{target_minutes}分）"
        concept_1 = f"{orig}を出発し、運河沿いの遊歩道や美術館前をめぐって{orig}へ戻ってくる約{target_km}km・{target_minutes}分の周回散歩です。"
        tags_1 = ["水辺・公園周回", f"{target_minutes}分コース", f"約{target_km}km"]

        title_2 = f"案2: {orig}発着 城址公園・カフェ街周回コース（約{target_minutes}分）"
        concept_2 = f"{orig}からお堀沿いの並木道と総曲輪のカフェ街を楽しみながら一周して戻る散策コースです。"
        tags_2 = ["城址・カフェ街", "フラット周回", f"{target_minutes}分コース"]

        title_3 = f"案3: {orig}発着 アーケード・寺社裏通り周回（約{target_minutes}分）"
        concept_3 = f"屋根付きアーケード街や静かな神社の参道・路地裏を歩いて{orig}へ戻る周回コースです。"
        tags_3 = ["屋根付き・路地裏", "寺社めぐり", "雨の日も安心"]

        title_4 = f"案4: {orig}発着 リバーサイド・大通り快走周回（約{target_minutes}分）"
        concept_4 = f"信号が少なく見通しの良い広幅歩道と川沿いをテンポよく一周するリフレッシュ周回コースです。"
        tags_4 = ["広幅歩道", "早歩き・運動", "見通し良好"]

        mock_stops_1 = [
            PlaceStop(name="富岩運河環水公園", lat=36.7088, lng=137.2141, reason="水辺の景観散策", tags=["公園", "水辺"]),
            PlaceStop(name="環水公園 カフェテラス", lat=36.7075, lng=137.2128, reason="ひと休みカフェ", tags=["カフェ"]),
        ]
        mock_stops_2 = [
            PlaceStop(name="富山城址公園", lat=36.6933, lng=137.2105, reason="歴史散策・お堀沿い", tags=["歴史", "公園"]),
            PlaceStop(name="総曲輪通り カフェ街", lat=36.6908, lng=137.2135, reason="アーケード街・カフェ", tags=["カフェ", "商店街"]),
        ]
        mock_stops_3 = [
            PlaceStop(name="富山市ガラス美術館", lat=36.6915, lng=137.2155, reason="建築・アート鑑賞", tags=["美術館"]),
            PlaceStop(name="日枝神社", lat=36.6898, lng=137.2182, reason="静かな境内散策", tags=["神社"]),
        ]
        mock_stops_4 = [
            PlaceStop(name="富山県美術館", lat=36.7095, lng=137.2085, reason="屋上庭園・展望", tags=["展望", "美術館"]),
            PlaceStop(name="ブールバール並木道", lat=36.7052, lng=137.2132, reason="広幅員プロムナード", tags=["並木道"]),
        ]
        return AgentAnalysis(
            summary=(
                f"{env.season_and_time}・{env.weather_condition}（{env.temp_c}℃）の気候に合わせて、"
                f"{orig}を起点にぐるっと一周して戻る【約{target_minutes}分（約{target_km}km・Googleマップ基準 分速80m）のおまかせ周回散歩コース】を4パターン作成しました。"
            ),
            origin_query=orig,
            destination_query=dest,
            inferred_factors=[
                ContextFactor(
                    category="loop_walk",
                    label=f"約{target_minutes}分（約{target_km}km）の周回・ループ散歩",
                    detail=f"徒歩速度をGoogleマップ基準の分速80m（時速4.8km）と想定し、{orig}から方角・テーマの異なる4つの一周コースを設計しました。",
                ),
                ContextFactor(
                    category="season_weather",
                    label=f"{env.weather_condition}・{env.temp_c}℃の散歩環境",
                    detail="現在の気候でも歩きやすく、見通しの良い遊歩道を優先しました。",
                ),
            ],
            planned_routes=[
                PlannedRouteOption(route_id="route_1", title=title_1, concept=concept_1, travel_mode="WALK", tags=tags_1, suggested_stops=mock_stops_1),
                PlannedRouteOption(route_id="route_2", title=title_2, concept=concept_2, travel_mode="WALK", tags=tags_2, suggested_stops=mock_stops_2),
                PlannedRouteOption(route_id="route_3", title=title_3, concept=concept_3, travel_mode="WALK", tags=tags_3, suggested_stops=mock_stops_3),
                PlannedRouteOption(route_id="route_4", title=title_4, concept=concept_4, travel_mode="WALK", tags=tags_4, suggested_stops=mock_stops_4),
            ][: max(3, req.route_count)],
        )

    # 3. プロンプトから特徴タグとタイトルを動的構成
    is_rain = bool(re.search(r"(雨|濡れ|傘|屋根|地下)", prompt))
    is_flat = bool(re.search(r"(坂|階段|フラット|平坦|疲れ|足)", prompt))

    title_1 = f"案1: {dest}への快適メインルート"
    concept_1 = f"{orig}から{dest}へ、歩行者優先で安全な通りを歩く標準推奨ルート"
    tags_1 = ["歩行者優先", "快適", "安全"]
    if is_rain:
        title_1 = f"案1: {dest}への雨よけ・地下道ルート"
        tags_1 = ["雨よけ", "地下通路", "屋根あり"]
    elif is_flat:
        title_1 = f"案1: {dest}への坂道回避フラットルート"
        tags_1 = ["坂道回避", "フラット", "階段なし"]

    title_2 = f"案2: {dest}への大通り安心ルート"
    concept_2 = f"道幅が広く街灯と人通りの多い大通りを経由して{dest}へ向かう安心ルート"
    tags_2 = ["大通り優先", "見通し良好", "治安安心"]

    title_3 = f"案3: {dest}への最短直行ルート"
    concept_3 = f"寄り道を一切せず、{orig}から{dest}へ向けて最短距離・最速で直行するルート"
    tags_3 = ["最短直行", "スピード重視", "寄り道なし"]

    return AgentAnalysis(
        summary=(
            f"{env.season_and_time}・{env.weather_condition}（{env.temp_c}℃）の環境を考慮し、"
            f"{orig}から{dest}への最適化ルートを作成しました。"
        ),
        origin_query=orig,
        destination_query=dest,
        inferred_factors=[
            ContextFactor(
                category="season_weather",
                label=f"{env.weather_condition}・{env.temp_c}℃への配慮",
                detail=f"{env.season_and_time}の天候・気温に合わせ、快適に歩ける歩道を優先しました。",
            ),
            ContextFactor(
                category="fatigue_terrain",
                label="足の疲れ・高低差軽減",
                detail="急勾配の坂道や歩道橋の階段を避け、歩きやすい経路を選択しました。",
            ),
            ContextFactor(
                category="safety",
                label="治安・道幅と明るさ",
                detail="見通しが良く街灯や人通りのある通りを優先しました。",
            ),
        ],
        planned_routes=[
            PlannedRouteOption(
                route_id="route_1",
                title=title_1,
                concept=concept_1,
                travel_mode="WALK",
                tags=tags_1,
                safety_note="見通しの良い歩道を通るため安全性が高いです。",
                fatigue_note="勾配の緩やかな歩道を中心に移動できます。",
                seasonal_weather_note=f"{env.weather_condition}（{env.temp_c}℃）でも快適に移動できます。",
                suggested_stops=[],
            ),
            PlannedRouteOption(
                route_id="route_2",
                title=title_2,
                concept=concept_2,
                travel_mode="WALK",
                tags=tags_2,
                safety_note="街灯と人通りが多い大通り沿いを通過します。",
                fatigue_note="平坦で舗装された広い歩道を歩けます。",
                seasonal_weather_note="風通しや見通しが良い幹線道路沿いです。",
                suggested_stops=[],
            ),
            PlannedRouteOption(
                route_id="route_fast",
                title=title_3,
                concept=concept_3,
                travel_mode="WALK",
                tags=tags_3,
                safety_note="目的地への最短ルートです。",
                fatigue_note="最速ペースで目的地まで到達できます。",
                seasonal_weather_note="歩行時間が最も短いため、天候変化の影響を最小限に抑えられます。",
                suggested_stops=[],
            ),
        ][: req.route_count],
        needs=RouteNeeds(
            elevation=bool(re.search(r"坂|階段|足が痛|足が疲|疲れ|高低差", prompt)),
            pollen=bool(re.search(r"花粉|花粉症|アレルギー", prompt)),
            air_quality=bool(re.search(r"空気|排気|大気|喘息", prompt)),
            shade=bool(re.search(r"日陰|日差し|暑|涼し", prompt)),
            street_view=bool(re.search(r"明る|街灯|道幅|見通し|夜道|安全|治安", prompt)),
            stops=bool(re.search(r"カフェ|喫茶|トイレ|立ち寄|寄り道", prompt)),
        ),
    )


def _mock_candidate_from_plan(plan_opt: PlannedRouteOption, stops: list[PlaceStop]) -> RouteCandidate:
    poly = "}k~xE_~_tYgK}AkGs@u[uRwCoA"
    return RouteCandidate(
        route_id=plan_opt.route_id,
        title=plan_opt.title,
        concept=plan_opt.concept,
        travel_mode=plan_opt.travel_mode,
        tags=plan_opt.tags,
        safety_note=plan_opt.safety_note,
        fatigue_note=plan_opt.fatigue_note,
        seasonal_weather_note=plan_opt.seasonal_weather_note,
        waypoints=stops,
        metrics=RouteMetrics(
            distance_meters=1450 if plan_opt.route_id == "route_1" else 1620,
            duration_seconds=1140 if plan_opt.route_id == "route_1" else 1260,
            encoded_polyline=poly,
            path=[LatLng(lat=s.lat, lng=s.lng) for s in stops if s.lat and s.lng] or decode_polyline(poly),
            elevation_gain_meters=4.2 if plan_opt.route_id == "route_1" else 11.5,
            elevation_loss_meters=3.8 if plan_opt.route_id == "route_1" else 8.5,
            max_sampled_uphill_grade_percent=2.1,
            max_sampled_downhill_grade_percent=1.8,
            elevation_profile_meters=[12.0, 13.0, 14.2, 16.2, 15.0, 14.0, 12.5] if plan_opt.route_id == "route_1" else [12.0, 16.0, 23.5, 20.0, 16.0, 13.0],
            warnings=[],
        ),
    )


def _get_genai_client():
    """Gemini API クライアントを初期化。Vertex AI Expressキー (AQ...)、AI Studio (AIza...)、または ADC に安全に対応。"""
    project_id = os.getenv("GOOGLE_CLOUD_PROJECT")
    api_key = os.getenv("GEMINI_API_KEY")
    if not project_id and not api_key:
        return None

    try:
        from google import genai

        if api_key:
            if api_key.startswith("AQ."):
                # Vertex AI Express key
                location = os.getenv("GOOGLE_CLOUD_LOCATION", "global")
                return genai.Client(vertexai=True, api_key=api_key, project=project_id, location=location)
            elif api_key.startswith("AIzaSy"):
                # Google AI Studio API key
                return genai.Client(vertexai=False, api_key=api_key)
            else:
                use_vertex = os.getenv("USE_VERTEX_AI", "false").lower() in ("true", "1")
                location = os.getenv("GOOGLE_CLOUD_LOCATION", "global")
                return genai.Client(vertexai=use_vertex, api_key=api_key, project=project_id, location=location)
        else:
            import google.auth

            location = os.getenv("GOOGLE_CLOUD_LOCATION", "global")
            creds, _ = google.auth.default(quota_project_id=project_id)
            return genai.Client(vertexai=True, project=project_id, location=location, credentials=creds)
    except Exception as exc:
        logging.getLogger("uvicorn.error").warning("GenAI client initialization failed: %s", exc)
        return None


class IntentAnalysisError(Exception):
    """A live request must never silently substitute a demo itinerary."""


def _analysis_unavailable(req: RouteRequest, env: EnvironmentContext) -> AgentAnalysis:
    if not os.getenv("GOOGLE_MAPS_API_KEY"):
        return _mock_analysis(req, env)
    raise IntentAnalysisError("希望を解析できませんでした。少し待って再検索してください。デモ用の経路への置き換えは行っていません。")


async def analyze_with_gemini(req: RouteRequest, env: EnvironmentContext) -> AgentAnalysis:
    client = _get_genai_client()
    if client is None:
        return _analysis_unavailable(req, env)

    try:
        from google.genai import types

        custom_instruction_part = f"\n【ユーザー定義の特別方針】\n{req.custom_system_prompt}\n" if req.custom_system_prompt else ""
        avoid_spots_part = f"\n【NGスポット・回避指定】\nユーザーは以下の場所・エリア・条件の通過を固く禁止しています。これらを完全に迂回するルートを設計してください：{', '.join(req.avoid_spots)}\n" if req.avoid_spots else ""

        system_instruction = (
            "あなたは観光・街歩き・都市移動に特化した世界最高峰の動的ルート処理エージェントです。\n"
            "提供するルートは【完全徒歩限定（WALK）】です。車や電車移動は含めず、歩行者が安全・快適・楽しく歩ける街歩きルートのみを提案してください。\n\n"
            f"【出力言語ルール】\n"
            f"すべての要約（summary）、ルートタイトル（title）、コンセプト（concept）、タグ（tags）、注意事項（safety_note, fatigue_note, seasonal_weather_note）、推論要因（inferred_factors）は、必ず指定された言語コード【{req.language}】（例: 'en'なら英語、'zh'なら中国語、'ja'なら日本語）で記述してください。\n\n"
            "【プロンプト解釈の汎化ルール：どんなユーザー入力にも柔軟かつ賢く対応すること】\n"
            "ユーザーは自由かつ多様な入力を行います。以下のパターンを柔軟に判別し、Google マップで確実にピンが立つ実在の地名・施設名に具体化（Grounding）してください：\n"
            "1. 【完全指定】（例: 「渋谷駅から六本木ヒルズまで」）→ origin_query='渋谷駅', destination_query='六本木ヒルズ'\n"
            "2. 【目的地のみ】（例: 「東京タワー」「浅草寺に行きたい」）→ origin_query='現在地', destination_query='東京タワー'\n"
            "3. 【出発地のみ】（例: 「京都駅からぶらぶらしたい」）→ origin_query='京都駅', destination_queryは京都駅徒歩圏の人気名所（例: '東本願寺', '鴨川（五条大橋）'等）を具体的に選定\n"
            "4. 【欲求・ジャンル・アクティビティ】（例: 「お腹すいた、ラーメン食べたい」「美味しいカフェ」「静かな公園で本を読みたい」）\n"
            "   → 抽象的な言葉のまま検索せず、現在地または出発地周辺の実在する具体的エリア・代表的施設名（例: '歌舞伎町ラーメンエリア', '和田倉噴水公園', 'スターバックス 〇〇店'）を destination_query に設定してください。\n"
            "5. 【トイレ・お手洗い検索】\n"
            "   → ユーザーの要望に『トイレ』『お手洗い』『公衆トイレ』『Restroom』『WC』が含まれている場合、必ず進行方向の沿道にある実在の公衆トイレ、駅構内・商業施設・公園のトイレ（例: '〇〇公園（公衆トイレ）', '〇〇駅東口公衆トイレ'）を各ルートの suggested_stops に組み込んでください。\n"
            "6. 【周回・ループ散歩（同じ出発地へ戻る散歩コース）】\n"
            "   → ユーザーが『〇分間散歩したい』『〇分散歩』『〇分歩きたい』『〇分でおまかせ周回散歩』『〇〇駅に戻ってくる30分の散歩』『ループコース』『一周して戻る』などを希望した場合：\n"
            "     - destination_query は origin_query（または現在地）と同じ場所に設定してください。\n"
            "     - 徒歩速度は【Googleマップ基準の分速80m（時速4.8km）】を基準とし、指定時間（15分なら約1.1〜1.2km、30分なら約2.2〜2.4km、45分なら約3.4〜3.6km、60分なら約4.5〜4.8km）にピタッと収まるよう、出発地から適切な距離にある実在スポット2〜3箇所を時計回り・反時計回りの順で suggested_stops に組み込んでください。\n"
            "     - 複数案（最大4案）を作る際は、同じ道や同じ方角ばかりにならぬよう、案1は北・水辺公園ループ、案2は南・城址や商店街カフェループ、案3は東・寺社や屋根付きアーケードループ、案4は見通しの良い大通りリフレッシュループのように【方角とテーマを完全に分けた多彩な周回コース】を提案してください。\n"
            "7. 【気分・状態・制約】（例: 「足が疲れた」「暗い夜道は嫌」「雨宿りしたい」「ベビーカーで移動」「デート向きの道」）\n"
            "   → 要望を inferred_factors に抽出し、坂道回避・地下道・大通り・景観優先など、ルートの設計思想に反映してください。\n"
            "8. 【外国語・略称・曖昧語】（例: 'Walk to Tokyo Dome', 'スカイツリー', 'アキバ'）→ 正式な検索用名称（'東京ドーム', '東京スカイツリー', '秋葉原駅'）に正規化してください。\n"
            f"{avoid_spots_part}"
            f"{custom_instruction_part}\n"
            "【道路の希望と立ち寄りの区別】大通り・道幅・歩道・街灯・坂回避・日陰など道路の状態の希望は候補の比較条件です。それだけを理由に店・公園・交差点などのsuggested_stopsを追加しないでください。明示された立ち寄り先と海沿いなどの体験に必要な地点だけを指定します。道路の希望だけならsuggested_stopsは空配列にし、複数の実道路候補を取得して比較します。\n"
            "【最重要：Google Maps 検索との整合性と地域適応】\n"
            "- origin_query, destination_query, suggested_stops の name は、必ず Google Places API で一意に検索可能な【具体的で実在するスポット名】にしてください（「カフェ」「近くの公園」のような一般名詞だけの出力は禁止）。\n"
            "- 【最重要：通ってきた道をUターンして戻るのを禁止】同じ道の中で急に後ろに戻るピストン往復（同じ道をUターンして引き返す移動）は絶対に禁止です。周回散歩や経由地に立ち寄る際は、必ず別の道路網を通ってぐるっと迂回して進む・戻るルート（時計回り・反時計回りの一筆書きサーキット）として suggested_stops を進行順に配置してください。行き止まりへ入って同じ道を引き返したり、同じ道路をUターンして戻る経由地配置は禁止します（迂回して戻るのは大歓迎）。\n"
            "- 経由地点は出発地から目的地への順番を保ってください。通常は自然な進行方向に沿わせますが、ユーザーが希望した沿線体験を実現するための遠回りは許容し、直行ルートとの距離差を理由に除外しないでください。\n"
            "- 体験区間を長くする場合も目的地へ進む方向に沿って延ばし、目的地を通り越した後に同じ道を戻る構成は避けてください。目的地より先の名所へ往復するのは、ユーザーが明示的に希望した場合だけにしてください。\n"
            "- 通常の寄り道は経由地を必要最小限にし、自然な進行方向に沿わせてください。\n"
            "- ユーザーが海沿い・川沿い・景色・商店街など『通る体験』を希望した場合、最短経路の近くにスポットを置くだけでは不十分です。主提案では、希望する沿線・エリアに出てその中を歩くよう、入口・途中の魅力的な場所・出口など必要な数の実在地点を進行順に指定してください。経由地点数に固定上限を設けず、体験を経路上で実現するために必要な地点を選んでください。\n"
            "- 複数の希望（例: 海沿いと大通り）は『どちらか一方』ではなく、主提案で同時に満たす条件として扱ってください。別々の案へ分割して主提案から一方を落とさないでください。\n"
            "- 海沿いと大通りの両方を希望された場合は、進行順に『大通りを歩く区間→海岸へ出る→海沿いの複数地点をつなぐ区間→目的地』となるよう実在地点を配置してください。海沿いの地点をゴール直前の1箇所だけに置く短い寄り道では、海沿い希望を満たしたことにしないでください。\n"
            "- 体験ルートでは直行距離や所要時間を上限として扱わず、遠回りの大きさだけを理由に希望するエリアを省略しないでください。希望に無関係な名所で距離を増やすのも避けてください。別案のうち少なくとも1案は最短直行の比較用として残してください。\n"
            "- Places APIで確認していない混雑状況、営業時間、夜間ライトアップ、現在の眺望を事実として断定しないでください。Street Viewで景観対象が見えた場合も、その撮影地点・撮影画像の範囲に限定して説明してください。\n"
            "- 地方・郊外・海外でも、その地域の地形や幹線道路・ランドマークに自然に適応してください。\n\n"
            f"ユーザーのプロンプトに合わせて、必ず以下の {req.route_count} つの徒歩ルート案を `planned_routes` に動的に作成してください：\n"
            "1. 案1 (route_id: 'route_primary'): 【ユーザー要望最適化ルート】ユーザーのプロンプトの主要望に最も誠実に応えたメイン提案ルート。沿線体験の希望があれば、沿線へ出て、その沿線の歩いて楽しいエリアを通る経路にする。\n"
            "2. 案2 (route_id: 'route_alt'): 【別アプローチルート】景観、大通り安心、立ち寄りスポット、裏道風情など別視点のアプローチ案。\n"
            "3. 案3 (route_id: 'route_direct'): 【最短直行ルート】寄り道せず目的地へまっすぐ向かう最速ルート（suggested_stops は空 []）。"
            "\n`needs`は自然文から必要なAPIだけをtrueにする。通常の出発地・目的地だけなら全てfalse。坂/足の疲れ=elevation、花粉=pollen、空気質/排気=air_quality、日陰/日差し=shade、道幅/街灯/見通し/舗装/路面/段差/障害物/歩きやすさ/景観=street_view、店やトイレ等の立ち寄り=stops。`priorities`には明示された条件を重要順で列挙し、強さも保持してください:『絶対・必ず・避けて』は必須/回避、『できる限り・できるだけ長く』は最大化、『優先』は高優先、『できれば』は希望として表現します。例: ['最大化: 海沿い区間の長さ','回避: 急坂','希望: 広い歩道']。『できる限り長く』は対象地点へ立ち寄るだけで満たしたことにせず、経路上の区間を伸ばし、目的地を通り越して引き返すのは避けてください。ユーザーが言っていない条件を補わず、曖昧な一般希望だけなら追加APIは要求しない。"
        )
        system_instruction += (
            "\n【特定道路の指定】国道・県道など道路名や路線番号を指定されたら、単なる通過エリアではなく、その道路に沿って歩く要求として扱う。"
            "主要案では指定道路上の進入側と退出側にある実在の交差点等を使い、道路に沿う区間を作る。接続地点は1道路につき最大2箇所、1地点で十分なら1箇所のみ。"
            "道路を横断するだけ、道路付近の店舗に寄るだけでは満たさない。出発地・目的地と既存の必須経由地も維持する。"
            "歩行可能と確認できない車道や立入禁止区間には誘導しない。道路名そのものを巨大な1地点として指定しない。各suggested_stopsのpurposeを必ず指定する。接続地点はroad_anchor、ユーザーが名指しした立寄先はuser_stop、別の明示的な体験希望の地点はexperience。道路指定を満たすために無関係な店舗・観光地・休憩所を追加しない。既存の必須経由地との接続が自然で、折り返しを抑える進入・退出地点と順序を選ぶ。"
        )
        if req.previous_route_summary:
            system_instruction += (
                "\n【ルートの反復改善】前回のユーザー希望と選択案が渡されています。前回のユーザー希望は今回に引き継がれる条件です。"
                "今回の追加入力は既存希望への追加として扱い、ユーザーが明示的に取り消した条件だけを外してください。"
                "前回選択案をそのまま返すのではなく、新しい希望を実際の経由地・経路形状・採点へ加えた候補を作ってください。"
                "出発地や目的地は今回の入力で変更指定がない限り維持してください。"
            )
        user_content = f"""
【ユーザーの要望】
{req.prompt}

【環境・時期・気象コンテキスト】
- 時期・時間帯: {env.season_and_time}
- 現在の天候: {env.weather_condition} (気温: {env.temp_c}℃, 降水量: {env.precipitation_mm}mm)
- 追加指定コンテキスト: {env.custom_overrides or "なし"}
- 現在地座標: {f"{req.current_location.lat:.5f}, {req.current_location.lng:.5f}" if req.current_location else "不明"}
- UI上の現在の出発地欄（デフォルト値・文章に出発地の記載がない場合のみ採用）: {req.origin or "なし"}
- UI上の現在の目的地欄（デフォルト値・文章に目的地の記載がない場合のみ採用）: {req.destination or "なし"}
- UIで指定された必須経由地（この順序を維持。追加希望を実現する経由地点を前後や間に追加してよい）: {', '.join(req.waypoints) if req.waypoints else "なし"}
- 回避したいNGスポット・条件: {', '.join(req.avoid_spots) if req.avoid_spots else "特になし"}
- 指定出力言語コード: {req.language}
- 【場所抽出ルール】ユーザーの文章中に出発地・目的地・「今いる場所/ここ/現在地」等の記述があれば、UI欄の値より必ず文章を優先して origin_query / destination_query に設定すること。「現在地」「ここ」から出発する場合は origin_query を厳密に「現在地」とすること。文章に記載が無い側のみUI欄の値を使うこと。
- 前回ルート文脈: {req.previous_route_summary or "なし（新規検索）"}
- 前回のユーザー希望（明示的に取り消されない限り今回も維持）: {req.previous_user_prompt or "なし"}
- 作成するルート案の数: {req.route_count}案
"""
        gemini_model = os.getenv("GEMINI_MODEL", "gemini-3.5-flash-lite")
        timeout_sec = float(os.getenv("GEMINI_TIMEOUT_SECONDS", "12.0"))

        def _call_gemini():
            return client.models.generate_content(
                model=gemini_model,
                contents=user_content,
                config=types.GenerateContentConfig(
                    system_instruction=system_instruction,
                    response_mime_type="application/json",
                    response_schema=AgentAnalysis,
                    temperature=0.4,
                ),
            )

        response = await asyncio.wait_for(
            asyncio.to_thread(_call_gemini),
            timeout=timeout_sec,
        )
        parsed = AgentAnalysis.model_validate_json(response.text)
        if req.destination_location:
            dest_change = re.search(r"([^、。\s]+?)(?:まで|へ|に行きたい|に向かう|を目指す)(?:歩く|行く|散歩)?$", req.prompt)
            if not dest_change or dest_change.group(1) in (req.destination or ""):
                parsed.destination_query = req.destination or "指定した地点"
        return parsed
    except asyncio.TimeoutError:
        logging.getLogger("uvicorn.error").warning("Gemini analysis timed out (over %ss); request cannot be analyzed", os.getenv("GEMINI_TIMEOUT_SECONDS", "12.0"))
        return _analysis_unavailable(req, env)
    except Exception:
        logging.getLogger("uvicorn.error").exception("Gemini analysis failed; request cannot be analyzed")
        return _analysis_unavailable(req, env)
