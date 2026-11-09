from __future__ import annotations

import asyncio
import json
import logging
import os
import re
from typing import Literal

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
import httpx

# .envファイルを読み込む
load_dotenv()

from app.models import (
    AgentAnalysis,
    CURRENT_LOCATION_WORDS,
    ContextFactor,
    EnvironmentContext,
    LatLng,
    PlaceStop,
    PhotoWalkRouteRequest,
    PhotoWalkRouteResponse,
    PlannedRouteOption,
    ResolveLocationRequest,
    ResolveLocationResponse,
    RouteCandidate,
    RouteMetrics,
    RouteNeeds,
    RouteRequest,
    RouteResponse,
    StreetViewAssessment,
    StreetViewObservation,
    WMO_WEATHER_MAP,
)
from app.services.gemini import (
    _mock_analysis,
    _mock_candidate_from_plan,
    analyze_with_gemini,
    IntentAnalysisError,
    decode_polyline,
)
from app.services.constraints import strict_slope_limit
from app.services.slope_search import recover_slope_routes, explore_slope_options
from app.services.slope_options import slope_comparison_requested
from app.services.photo_routes import photo_walk_metrics
from app.services.facility_preferences import requested_facilities, generic_facility_name
from app.services.intent import (
    _gate_needs_to_prompt,
    _apply_loop_request,
    _apply_waypoint_request,
    _limit_road_anchors,
    _requested_visual_target,
    _simple_route_analysis,
    _wants_experience_route,
)
from app.services.maps import (
    _assess_street_view,
    _build_route_candidate,
    _fetch_alternative_walk_routes,
    _fetch_alternatives_for_queries,
    _fetch_walk_metrics,
    _haversine_km,
    _lateral_route_anchors,
    _measure_elevation_for_metrics,
    _resolve_place,
    _route_overlap_fraction,
    _sample_path_by_fraction,
    _solar_shade_percent,
    _summarize_elevation_profile,
    RouteSearchError,
    build_all_routes,
)
from app.services.ranking import (
    _rank_routes,
)
from app.services.embeddinggemma import status as embeddinggemma_status
from app.services.weather import _build_season_time_str, fetch_environment, fetch_route_environment

logger = logging.getLogger("uvicorn.error")

app = FastAPI(title="Google Maps Pro Max API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _get_gemini_display_name(model_id: str) -> str:
    display_map = {
        "gemini-3.8-flash": "Gemini 3.8 Flash",
        "gemini-3.5-flash-lite": "Gemini 3.5 Flash Lite",
        "gemini-2.5-flash": "Gemini 2.5 Flash",
        "gemini-2.5-pro": "Gemini 2.5 Pro",
        "gemini-1.5-flash": "Gemini 1.5 Flash",
        "gemini-1.5-pro": "Gemini 1.5 Pro",
    }
    return display_map.get(model_id, model_id)


@app.get("/api/health")
def health():
    gemini_model = os.getenv("GEMINI_MODEL", "gemini-3.8-flash")
    return {
        "status": "ok",
        "vertex_configured": bool(os.getenv("GOOGLE_CLOUD_PROJECT")),
        "gemini_configured": bool(os.getenv("GOOGLE_CLOUD_PROJECT") or os.getenv("GEMINI_API_KEY")),
        "gemini_model": gemini_model,
        "gemini_display_name": _get_gemini_display_name(gemini_model),
        "maps_configured": bool(os.getenv("GOOGLE_MAPS_API_KEY")),
        "embeddinggemma": embeddinggemma_status(),
    }


@app.post("/api/places/resolve", response_model=ResolveLocationResponse)
async def resolve_nearest_place(req: ResolveLocationRequest):
    """触れたGoogle Maps上のPOIピン（place_id）から正確な公式施設情報をピンポイント取得"""
    maps_key = os.getenv("GOOGLE_MAPS_API_KEY")
    if not maps_key:
        return ResolveLocationResponse(name="選択したスポット", address="")

    async with httpx.AsyncClient(timeout=6.0) as client:
        # 1. ユーザーが触れたGoogle Maps上の施設ピン（place_id）から公式施設情報を高精度取得
        if req.place_id:
            try:
                p_res = await client.get(
                    f"https://places.googleapis.com/v1/places/{req.place_id}",
                    headers={
                        "X-Goog-Api-Key": maps_key,
                        "X-Goog-FieldMask": "id,displayName,formattedAddress,location,primaryType",
                    },
                    params={"languageCode": req.language},
                )
                if p_res.status_code == 200:
                    data = p_res.json()
                    name = data.get("displayName", {}).get("text")
                    if name:
                        loc = data.get("location", {})
                        return ResolveLocationResponse(
                            name=name,
                            address=data.get("formattedAddress", ""),
                            category="landmark",
                            place_id=data.get("id", req.place_id),
                            lat=loc.get("latitude"),
                            lng=loc.get("longitude"),
                        )
            except Exception as exc:
                logging.getLogger("uvicorn.error").warning("Place details lookup failed for %s: %s", req.place_id, exc)

        # 2. place_id がない場合は、指定された座標の住所・地名を取得
        if req.lat is not None and req.lng is not None:
            try:
                geo_res = await client.get(
                    "https://maps.googleapis.com/maps/api/geocode/json",
                    params={"latlng": f"{req.lat},{req.lng}", "key": maps_key, "language": req.language},
                )
                if geo_res.status_code == 200:
                    results = geo_res.json().get("results", [])
                    if results:
                        named_hit = next(
                            (r for r in results if any(t in r.get("types", []) for t in ["premise", "point_of_interest", "establishment"])),
                            results[0],
                        )
                        addr = named_hit.get("formatted_address", "")
                        import re
                        clean_name = re.sub(r"^(日本、|Japan,\s*)?(〒\d{3}-\d{4}\s*)?", "", addr).strip()
                        clean_name = re.sub(r"^[^\s県市区]+[都道府県]", "", clean_name).strip() or clean_name
                        loc = named_hit.get("geometry", {}).get("location", {})
                        return ResolveLocationResponse(
                            name=clean_name or "選択した地点",
                            address=addr,
                            place_id=named_hit.get("place_id"),
                            lat=loc.get("lat", req.lat),
                            lng=loc.get("lng", req.lng),
                        )
            except Exception as exc:
                logging.getLogger("uvicorn.error").warning("Geocode lookup failed: %s", exc)

    return ResolveLocationResponse(name="選択したスポット", address="", lat=req.lat, lng=req.lng)


@app.post("/api/sanpo/route", response_model=PhotoWalkRouteResponse)
async def build_photo_walk_route(req: PhotoWalkRouteRequest):
    """Snap chronological EXIF GPS photo points to a real walking route."""
    maps_key = os.getenv("GOOGLE_MAPS_API_KEY")
    if not maps_key:
        raise HTTPException(status_code=503, detail="徒歩ルートAPIが設定されていません。")
    if any(not (-90 <= point.lat <= 90 and -180 <= point.lng <= 180) for point in req.points):
        raise HTTPException(status_code=422, detail="写真のGPS座標が不正です。")
    direct_km = sum(
        _haversine_km(a.lat, a.lng, b.lat, b.lng)
        for a, b in zip(req.points, req.points[1:])
    )
    if direct_km > 60:
        raise HTTPException(status_code=422, detail="写真の位置が離れすぎています。60km以内の散歩写真を選んでください。")

    stops = [
        PlaceStop(name=f"写真地点{index + 1}", lat=point.lat, lng=point.lng, reason="EXIF GPS撮影地点", tags=[])
        for index, point in enumerate(req.points)
    ]
    async with httpx.AsyncClient(timeout=20.0) as client:
        metrics = await photo_walk_metrics(client, stops, maps_key, req.language)
    if metrics is None or len(metrics.path) < 2 or not metrics.encoded_polyline:
        raise HTTPException(status_code=422, detail="写真地点を順に通る徒歩ルートを作成できませんでした。GPS位置を確認してください。")
    if metrics.distance_meters > 60000 or metrics.duration_seconds > 86400:
        raise HTTPException(status_code=422, detail="作成された経路が長すぎます。散歩の区間を分けて投稿してください。")
    return PhotoWalkRouteResponse(
        distance_meters=metrics.distance_meters,
        duration_seconds=metrics.duration_seconds,
        encoded_polyline=metrics.encoded_polyline,
        path=metrics.path,
    )


async def build_routes_with_slope_retry(req: RouteRequest, *args, **kwargs):
    preference_text = f"{req.previous_user_prompt or ''} {req.prompt}"
    facilities = requested_facilities(preference_text)
    if req.waypoints or re.search(r"海|川沿い|景観|景色|公園|観光|「",preference_text) or any(stop.name in preference_text and not generic_facility_name(stop.name) for plan in args[0].planned_routes for stop in plan.suggested_stops):
        facilities = ()
    kwargs.setdefault("facility_preferences",facilities)
    kwargs.setdefault("include_facilities", bool(facilities or requested_facilities(preference_text)))
    kwargs.setdefault("requested_visual_target", _requested_visual_target(f"{req.previous_user_prompt or ''} {req.prompt}"))
    limit=strict_slope_limit(req)
    compare=slope_comparison_requested(req) and not args[0].loop_minutes and limit is None
    images,shade=kwargs.get("analyze_images",False),kwargs.get("analyze_shade",False)
    if compare:
        # Compare slope/time first; acquire costly image evidence for selected routes only.
        kwargs.update(analyze_images=False,analyze_shade=False,measure_elevation=True)
    candidates, baseline = await build_all_routes(*args, **kwargs)
    if compare and candidates:
        candidates=await explore_slope_options(candidates,args[1],req.language,
            analyze_images=images,analyze_shade=shade,requested_visual_target=kwargs.get("requested_visual_target"))
    elif limit is not None and candidates:
        candidates=await recover_slope_routes(candidates,args[1],req.language,limit,
            analyze_images=images,analyze_shade=shade,requested_visual_target=kwargs.get("requested_visual_target"))
    return candidates, baseline


@app.post("/api/route", response_model=RouteResponse)
async def plan_dynamic_route(req: RouteRequest):
    lat = req.current_location.lat if req.current_location else 36.6959
    lng = req.current_location.lng if req.current_location else 137.2137

    maps_key = os.getenv("GOOGLE_MAPS_API_KEY")
    simple_analysis = _simple_route_analysis(req)
    if maps_key and simple_analysis:
        simple_analysis = _apply_waypoint_request(req, simple_analysis)
        # Weather and route computation are independent for a plain A-to-B request.
        env_task = asyncio.create_task(fetch_environment(lat, lng, req.context_override))
        route_task = asyncio.create_task(build_routes_with_slope_retry(req,
            simple_analysis, maps_key, req.current_location, req.language, fast_alternatives=False, analyze_images=True,
            measure_elevation=simple_analysis.needs.elevation, resolve_stops=simple_analysis.needs.stops, destination_location=req.destination_location, origin_location=req.origin_location))
        try:
            env, (candidates, baseline) = await asyncio.gather(env_task, route_task)
        except RouteSearchError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        try:
            candidates = await asyncio.to_thread(_rank_routes, candidates, req, env, simple_analysis.needs)
        except RouteSearchError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        return RouteResponse(mode="live", environment=env,
            summary=f"{env.season_and_time}・{env.weather_condition}（{env.temp_c}℃）を確認し、徒歩ルートを検索しました。",
            origin_query=simple_analysis.origin_query, destination_query=simple_analysis.destination_query,
            inferred_factors=[], routes=candidates, baseline=baseline)

    env = await fetch_environment(lat, lng, req.context_override)
    try:
        analysis = _apply_loop_request(req, await analyze_with_gemini(req, env))
    except IntentAnalysisError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    analysis.needs = _gate_needs_to_prompt(req, analysis.needs)
    analysis = _limit_road_anchors(req, _apply_waypoint_request(req, analysis))

    if maps_key:
        wants_visual = True  # Pedestrian routes always compare sampled sidewalk evidence.
        wants_shade = False  # Solar shade selection is not supported; compare visual cover only.
        fast_alternatives = not any((analysis.needs.elevation, analysis.needs.pollen, analysis.needs.air_quality,
                                     analysis.needs.shade, analysis.needs.street_view, analysis.needs.stops)) and not req.avoid_spots
        effective_dest_loc = (
            req.destination_location
            if (not req.destination or analysis.destination_query == req.destination or analysis.destination_query == "指定した地点")
            else None
        )
        try:
            candidates, baseline = await build_routes_with_slope_retry(req,
                analysis, maps_key, req.current_location, req.language,
                analyze_images=wants_visual, analyze_shade=wants_shade,
                measure_elevation=analysis.needs.elevation,
                resolve_stops=analysis.needs.stops,
                fast_alternatives=False,
                allow_experience_detour=_wants_experience_route(f"{req.previous_user_prompt or ''} {req.prompt}"),
                requested_visual_target=_requested_visual_target(f"{req.previous_user_prompt or ''} {req.prompt}"),
                origin_location=req.origin_location,
                destination_location=effective_dest_loc,
            )
        except RouteSearchError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        await fetch_route_environment(
            candidates, need_air=analysis.needs.air_quality, need_pollen=analysis.needs.pollen,
            origin_environment=env, origin_lat=lat, origin_lng=lng,
        )
        try:
            candidates = await asyncio.to_thread(_rank_routes, candidates, req, env, analysis.needs)
        except RouteSearchError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        mode: Literal["live", "mock"] = "live"
    else:
        origin_stop = PlaceStop(name=analysis.origin_query, lat=36.6959, lng=137.2137, reason="出発地", tags=["出発地"])
        dest_lat = req.destination_location.lat if req.destination_location else 36.7013
        dest_lng = req.destination_location.lng if req.destination_location else 137.2133
        dest_stop = PlaceStop(name=analysis.destination_query, lat=dest_lat, lng=dest_lng, reason="目的地", tags=["目的地"])
        candidates = [
            _mock_candidate_from_plan(opt, [origin_stop] + opt.suggested_stops + [dest_stop])
            for opt in analysis.planned_routes
        ]
        try:
            candidates = await asyncio.to_thread(_rank_routes, candidates, req, env, analysis.needs)
        except RouteSearchError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        # ponytail: モックの baseline は固定値（実APIキー設定時のみ本物の Google 標準ルートを返す）
        if analysis.needs.elevation:
            baseline = RouteMetrics(
                distance_meters=1310,
                duration_seconds=1000,
                encoded_polyline="",
                path=[LatLng(lat=origin_stop.lat, lng=origin_stop.lng), LatLng(lat=dest_stop.lat, lng=dest_stop.lng)],
                elevation_gain_meters=21.0,
                elevation_loss_meters=14.0,
                max_sampled_uphill_grade_percent=4.2,
                max_sampled_downhill_grade_percent=3.1,
                elevation_profile_meters=[12.0, 14.5, 18.0, 25.0, 31.0, 26.0, 19.0, 14.0],
                warnings=[],
            )
        else:
            baseline = RouteMetrics(
                distance_meters=1310,
                duration_seconds=1000,
                encoded_polyline="",
                path=[LatLng(lat=origin_stop.lat, lng=origin_stop.lng), LatLng(lat=dest_stop.lat, lng=dest_stop.lng)],
                elevation_gain_meters=0.0,
                elevation_loss_meters=0.0,
                elevation_profile_meters=[],
                warnings=[],
            )
        mode = "mock"

    return RouteResponse(
        mode=mode,
        environment=env,
        summary=(f"徒歩ルートを{len(candidates)}件比較しました。各案の説明は計算した経由地点と経路APIの案内に基づきます。" if mode == "live" else analysis.summary),
        origin_query=analysis.origin_query,
        destination_query=analysis.destination_query,
        inferred_factors=[factor.model_copy(update={"detail": "入力から抽出した希望です。実際の反映状況は各ルートの評価理由を確認してください。"}) for factor in analysis.inferred_factors],
        routes=candidates,
        baseline=baseline,
    )


@app.post("/api/route/stream")
async def plan_dynamic_route_stream(req: RouteRequest, request: Request):
    """Server-Sent Events (SSE) でAIエージェントの各思考段階（Gemini, Routes, Sensors, Decision）をリアルタイム配信"""
    async def event_generator():
        def sse(event_type: str, payload: dict) -> str:
            return f"event: {event_type}\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n"

        if await request.is_disconnected():
            return

        # Cloud Run / リバースプロキシでのレスポンス開始バッファリングを即時解除
        yield sse("progress", {"stage": "init", "label": "リクエストを受信しました。ルート解析を開始します..."})

        lat = req.current_location.lat if req.current_location else 36.6959
        lng = req.current_location.lng if req.current_location else 137.2137
        maps_key = os.getenv("GOOGLE_MAPS_API_KEY")

        simple_analysis = _simple_route_analysis(req)
        if maps_key and simple_analysis:
            simple_analysis = _apply_waypoint_request(req, simple_analysis)
            yield sse("progress", {"stage": "routes", "label": "Google Routes API: 実道路網で複数ルート候補の探索中"})
            env_task = asyncio.create_task(fetch_environment(lat, lng, req.context_override))
            route_task = asyncio.create_task(build_routes_with_slope_retry(req,
                simple_analysis, maps_key, req.current_location, req.language, fast_alternatives=False, analyze_images=True,
                measure_elevation=simple_analysis.needs.elevation, resolve_stops=simple_analysis.needs.stops, destination_location=req.destination_location, origin_location=req.origin_location))
            try:
                env, (candidates, baseline) = await asyncio.gather(env_task, route_task)
            except RouteSearchError as exc:
                yield sse("error", {"status": 422, "message": str(exc)})
                return
            if await request.is_disconnected():
                return
            yield sse("progress", {"stage": "decision", "label": "EmbeddingGemma 2 270M: 希望と実測ルートの意味類似度を比較中"})
            try:
                candidates = await asyncio.to_thread(_rank_routes, candidates, req, env, simple_analysis.needs)
            except RouteSearchError as exc:
                yield sse("error", {"status": 422, "message": str(exc)})
                return
            if await request.is_disconnected():
                return
            resp = RouteResponse(
                mode="live", environment=env,
                summary=f"{env.season_and_time}・{env.weather_condition}（{env.temp_c}℃）を確認し、徒歩ルートを検索しました。",
                origin_query=simple_analysis.origin_query, destination_query=simple_analysis.destination_query,
                inferred_factors=[], routes=candidates, baseline=baseline
            )
            yield sse("complete", resp.model_dump())
            return

        # 段階1: 意図・文脈解析
        gemini_model = os.getenv("GEMINI_MODEL", "gemini-3.8-flash")
        model_name = _get_gemini_display_name(gemini_model)
        yield sse("progress", {"stage": "gemini", "label": f"{model_name}: ユーザー要望と現在地文脈の解析中"})
        env = await fetch_environment(lat, lng, req.context_override)
        if await request.is_disconnected():
            return
        try:
            analysis = _apply_loop_request(req, await analyze_with_gemini(req, env))
        except IntentAnalysisError as exc:
            yield sse("error", {"status": 503, "message": str(exc)})
            return
        if await request.is_disconnected():
            return
        analysis.needs = _gate_needs_to_prompt(req, analysis.needs)
        analysis = _limit_road_anchors(req, _apply_waypoint_request(req, analysis))

        # 段階2: 実道路網ルート計算
        yield sse("progress", {"stage": "routes", "label": "Google Routes API: 実道路網で複数ルート候補の探索中"})
        if maps_key:
            wants_visual = True  # Pedestrian routes always compare sampled sidewalk evidence.
            wants_shade = False  # Solar shade selection is not supported; compare visual cover only.
            fast_alternatives = not any((analysis.needs.elevation, analysis.needs.pollen, analysis.needs.air_quality,
                                         analysis.needs.shade, analysis.needs.street_view, analysis.needs.stops)) and not req.avoid_spots
            if wants_shade or analysis.needs.elevation or wants_visual:
                # 段階3: 道路環境・センサー計測 (実際に要求されたAPIのみを正確に表記)
                active_sensors = []
                if wants_shade:
                    active_sensors.append("Solar")
                if analysis.needs.elevation:
                    active_sensors.append("Elevation")
                if wants_visual:
                    active_sensors.append("Street View")
                sensor_name = " & ".join(active_sensors) if active_sensors else "道路環境"
                yield sse("progress", {"stage": "sensors", "label": f"{sensor_name}: 道路環境・客観データの計測中"})

            effective_dest_loc = (
                req.destination_location
                if (not req.destination or analysis.destination_query == req.destination or analysis.destination_query == "指定した地点")
                else None
            )
            try:
                candidates, baseline = await build_routes_with_slope_retry(req,
                    analysis, maps_key, req.current_location, req.language,
                    analyze_images=wants_visual, analyze_shade=wants_shade,
                    measure_elevation=analysis.needs.elevation,
                    resolve_stops=analysis.needs.stops,
                    fast_alternatives=False,
                    allow_experience_detour=_wants_experience_route(f"{req.previous_user_prompt or ''} {req.prompt}"),
                    requested_visual_target=_requested_visual_target(f"{req.previous_user_prompt or ''} {req.prompt}"),
                    origin_location=req.origin_location,
                    destination_location=effective_dest_loc,
                )
            except RouteSearchError as exc:
                yield sse("error", {"status": 422, "message": str(exc)})
                return
            if await request.is_disconnected():
                return
            await fetch_route_environment(
                candidates, need_air=analysis.needs.air_quality, need_pollen=analysis.needs.pollen,
                origin_environment=env, origin_lat=lat, origin_lng=lng,
            )
            if await request.is_disconnected():
                return
            # 段階4: オンデバイス適合度リランキング
            yield sse("progress", {"stage": "decision", "label": "EmbeddingGemma 2 270M: 希望と実測ルートの意味類似度を比較中"})
            try:
                candidates = await asyncio.to_thread(_rank_routes, candidates, req, env, analysis.needs)
            except RouteSearchError as exc:
                yield sse("error", {"status": 422, "message": str(exc)})
                return
            mode: Literal["live", "mock"] = "live"
        else:
            origin_stop = PlaceStop(name=analysis.origin_query, lat=36.6959, lng=137.2137, reason="出発地", tags=["出発地"])
            dest_lat = req.destination_location.lat if req.destination_location else 36.7013
            dest_lng = req.destination_location.lng if req.destination_location else 137.2133
            dest_stop = PlaceStop(name=analysis.destination_query, lat=dest_lat, lng=dest_lng, reason="目的地", tags=["目的地"])
            candidates = [
                _mock_candidate_from_plan(opt, [origin_stop] + opt.suggested_stops + [dest_stop])
                for opt in analysis.planned_routes
            ]
            if await request.is_disconnected():
                return
            yield sse("progress", {"stage": "decision", "label": "EmbeddingGemma 2 270M: 希望と実測ルートの意味類似度を比較中"})
            try:
                candidates = await asyncio.to_thread(_rank_routes, candidates, req, env, analysis.needs)
            except RouteSearchError as exc:
                yield sse("error", {"status": 422, "message": str(exc)})
                return
            if analysis.needs.elevation:
                baseline = RouteMetrics(
                    distance_meters=1310,
                    duration_seconds=1000,
                    encoded_polyline="",
                    path=[LatLng(lat=origin_stop.lat, lng=origin_stop.lng), LatLng(lat=dest_stop.lat, lng=dest_stop.lng)],
                    elevation_gain_meters=21.0,
                    elevation_loss_meters=14.0,
                    max_sampled_uphill_grade_percent=4.2,
                    max_sampled_downhill_grade_percent=3.1,
                    elevation_profile_meters=[12.0, 14.5, 18.0, 25.0, 31.0, 26.0, 19.0, 14.0],
                    warnings=[],
                )
            else:
                baseline = RouteMetrics(
                    distance_meters=1310,
                    duration_seconds=1000,
                    encoded_polyline="",
                    path=[LatLng(lat=origin_stop.lat, lng=origin_stop.lng), LatLng(lat=dest_stop.lat, lng=dest_stop.lng)],
                    elevation_gain_meters=0.0,
                    elevation_loss_meters=0.0,
                    elevation_profile_meters=[],
                    warnings=[],
                )
            mode = "mock"

        if await request.is_disconnected():
            return
        yield sse("progress", {"stage": "synthesizing", "label": "最適ルート案を統合・合成中..."})
        resp = RouteResponse(
            mode=mode,
            environment=env,
            summary=(f"徒歩ルートを{len(candidates)}件比較しました。各案の説明は計算した経由地点と経路APIの案内に基づきます。" if mode == "live" else analysis.summary),
            origin_query=analysis.origin_query,
            destination_query=analysis.destination_query,
            inferred_factors=[factor.model_copy(update={"detail": "入力から抽出した希望です。実際の反映状況は各ルートの評価理由を確認してください。"}) for factor in analysis.inferred_factors],
            routes=candidates,
            baseline=baseline,
        )
        yield sse("complete", resp.model_dump())

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
