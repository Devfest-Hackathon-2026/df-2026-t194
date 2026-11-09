from __future__ import annotations

import asyncio
import datetime
import logging
import math
import os
import re
import time
from typing import Any

import httpx

from app.services.street_view_direction import route_position, forward_heading
from urllib.parse import urlencode

from app.services.polyline import encode_path
from app.models import (
    AgentAnalysis,
    CURRENT_LOCATION_WORDS,
    LatLng,
    PlaceStop,
    PlannedRouteOption,
    RouteCandidate,
    RouteMetrics,
    StreetViewAssessment,
    StreetViewObservation,
)
from app.services.gemini import _get_genai_client, decode_polyline
from app.services.intent import _requested_visual_target, _wants_experience_route, _road_usage_confirmed

logger = logging.getLogger("uvicorn.error")
_STREET_VIEW_ANALYSIS_CACHE: dict[tuple, tuple[float, StreetViewAssessment]] = {}
MAX_WALK_DIRECT_DISTANCE_KM = 70.0
MAX_WALK_ROUTE_DISTANCE_METERS = 100_000


class RouteSearchError(Exception):
    """Expected route validation/finding failure that the API should report as 4xx."""


def _haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlng / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _sample_path_by_fraction(path: list[LatLng], fractions: tuple[float, ...] = (0.25, 0.5, 0.75)) -> list[LatLng]:
    """Sample points by travelled distance, not polyline vertex index density."""
    if not path:
        return []
    if len(path) == 1:
        return [path[0] for _ in fractions]
    lengths = [_haversine_km(a.lat, a.lng, b.lat, b.lng) for a, b in zip(path, path[1:])]
    total = sum(lengths)
    if total <= 0:
        return [path[0] for _ in fractions]
    samples: list[LatLng] = []
    for fraction in fractions:
        target = total * fraction
        traversed = 0.0
        for idx, segment_length in enumerate(lengths):
            if traversed + segment_length >= target or idx == len(lengths) - 1:
                ratio = 0.0 if segment_length <= 0 else max(0.0, min(1.0, (target - traversed) / segment_length))
                a, b = path[idx], path[idx + 1]
                samples.append(LatLng(lat=a.lat + (b.lat - a.lat) * ratio,
                                      lng=a.lng + (b.lng - a.lng) * ratio))
                break
            traversed += segment_length
    return samples


def _summarize_elevation_profile(elevations: list[float], route_distance_m: int) -> tuple[float, float, float, float]:
    """Return cumulative ascent/descent and max sampled grades along a route profile."""
    if len(elevations) < 2 or route_distance_m <= 0:
        return 0.0, 0.0, 0.0, 0.0
    segment_distance = route_distance_m / (len(elevations) - 1)
    ascent = descent = max_uphill = max_downhill = 0.0
    for start, end in zip(elevations, elevations[1:]):
        delta = end - start
        if delta > 0:
            ascent += delta
            max_uphill = max(max_uphill, delta / segment_distance * 100)
        elif delta < 0:
            descent += -delta
            max_downhill = max(max_downhill, -delta / segment_distance * 100)
    return round(ascent, 1), round(descent, 1), round(max_uphill, 1), round(max_downhill, 1)


async def _snap_to_nearest_public_road(
    client: httpx.AsyncClient,
    stop: PlaceStop,
    api_key: str,
    language: str = "ja",
) -> PlaceStop:
    """ピン指しした地点が私有地・建物内・河川などの場合、Google Roads API (nearestRoads) または
    Geocoding API (result_type=route) を使って最も近い公道上の座標へスナップする。"""
    if not api_key or not stop.lat or not stop.lng:
        return stop

    snapped_lat = stop.lat
    snapped_lng = stop.lng
    was_snapped = False

    # 1. Google Roads API (nearestRoads) による公道スナップ
    try:
        r_res = await client.get(
            "https://roads.googleapis.com/v1/nearestRoads",
            params={"points": f"{stop.lat},{stop.lng}", "key": api_key},
        )
        if r_res.status_code == 200:
            pts = r_res.json().get("snappedPoints", [])
            if pts:
                loc = pts[0].get("location", {})
                rlat = loc.get("latitude")
                rlng = loc.get("longitude")
                if rlat is not None and rlng is not None:
                    dist_m = _haversine_km(stop.lat, stop.lng, rlat, rlng) * 1000
                    snapped_lat = float(rlat)
                    snapped_lng = float(rlng)
                    if dist_m >= 3.0:
                        was_snapped = True
    except Exception as exc:
        logger.debug("Roads API nearestRoads fallback: %s", exc)

    # 2. Roads API 未有効または未スナップ時は Geocoding API (result_type=route) で最寄り道路を取得
    if not was_snapped:
        try:
            g_res = await client.get(
                "https://maps.googleapis.com/maps/api/geocode/json",
                params={
                    "latlng": f"{stop.lat},{stop.lng}",
                    "result_type": "route|street_address",
                    "key": api_key,
                    "language": language,
                },
            )
            if g_res.status_code == 200:
                results = g_res.json().get("results", [])
                route_hit = next(
                    (r for r in results if "route" in r.get("types", [])),
                    results[0] if results else None,
                )
                if route_hit:
                    loc = route_hit.get("geometry", {}).get("location", {})
                    glat = loc.get("lat")
                    glng = loc.get("lng")
                    if glat is not None and glng is not None:
                        dist_m = _haversine_km(stop.lat, stop.lng, glat, glng) * 1000
                        if 3.0 <= dist_m <= 180.0:
                            snapped_lat = float(glat)
                            snapped_lng = float(glng)
                            was_snapped = True
        except Exception as exc:
            logger.debug("Reverse geocoding road snap fallback: %s", exc)

    return stop.model_copy(
        update={
            "lat": snapped_lat,
            "lng": snapped_lng,
        }
    )


async def _resolve_place(
    client: httpx.AsyncClient,
    item: PlaceStop,
    api_key: str,
    bias_center: tuple[float, float] | None = None,
    bias_radius_meters: float = 6000.0,
    language: str = "ja",
    include_facilities: bool = False,
) -> PlaceStop:
    if not api_key:
        return item

    if item._provider_resolved:
        return item
    confirmed = item._coordinates_confirmed and bool(item.lat and item.lng)
    is_road_anchor = item.purpose == "road_anchor"
    # Generated coordinates, opening hours, tags and IDs are never evidence.
    clean = item.model_copy(update={"lat": item.lat if confirmed else 0.0,
        "lng": item.lng if confirmed else 0.0, "place_id": None, "open_now": None,
        "place_verified": False, "place_types": [], "restroom": None, "tags": [],
        "reason": "指定した地点" if confirmed else "施設候補（設備・景観は未確認）"})
    if confirmed and re.search(r"^(?:経由地|指定した地点|ピン|位置を指定|[-+]?\d+\.\d+\s*,)", item.name):
        return clean
    headers = {"X-Goog-Api-Key": api_key, "Content-Type": "application/json",
        "X-Goog-FieldMask": "places.id,places.displayName,places.location,places.formattedAddress,places.types" + (",places.currentOpeningHours.openNow,places.restroom" if include_facilities else "")}
    body: dict[str, Any] = {"textQuery": item.name, "languageCode": language}
    center = (item.lat, item.lng) if confirmed else bias_center
    if center:
        body["locationBias"] = {"circle": {"center": {"latitude": center[0], "longitude": center[1]},
            "radius": min(50000.0, max(1.0, bias_radius_meters))}}
    try:
        response = await client.post("https://places.googleapis.com/v1/places:searchText", headers=headers, json=body)
        places = response.json().get("places", []) if response.status_code == 200 else []
        for top in places:
            loc = top.get("location", {})
            lat, lng = loc.get("latitude"), loc.get("longitude")
            if lat is None or lng is None:
                continue
            types = top.get("types", [])
            if is_road_anchor and "intersection" not in types:
                continue
            # Pins stay where the user put them; an unrelated nearby search hit cannot supply their facts.
            if confirmed and _haversine_km(item.lat, item.lng, lat, lng) > 0.25:
                continue
            allowed = bias_radius_meters / 1000 if is_road_anchor else max(30.0, bias_radius_meters / 1000 * 2)
            if bias_center and _haversine_km(*bias_center, lat, lng) > allowed:
                continue
            tags = []
            if "cafe" in types or "coffee_shop" in types:
                tags.append("カフェ")
            restroom = top.get("restroom")
            if "public_bathroom" in types:
                restroom = True
            if restroom is True:
                tags.append("トイレあり")
            return clean.model_copy(update={"name": item.name if confirmed else top.get("displayName", {}).get("text", item.name),
                "lat": item.lat if confirmed else lat, "lng": item.lng if confirmed else lng,
                "place_id": top.get("id"), "address": top.get("formattedAddress"),
                "open_now": top.get("currentOpeningHours", {}).get("openNow"),
                "place_verified": True, "place_types": types, "restroom": restroom, "tags": tags,
                "reason": "Places APIで位置を確認（設備は取得できた項目のみ）"})
    except Exception as exc:
        logger.warning("Places lookup unavailable: %s", type(exc).__name__)
    if confirmed:
        return clean
    # Named endpoints and road anchors may still be resolved by Geocoding, without inventing facility attributes.
    # Intermediate facilities fail closed instead of routing to a guessed or generic address.
    if item.purpose not in ("unspecified", "road_anchor") and item.reason not in ("出発地", "目的地"):
        return clean
    try:
        response = await client.get("https://maps.googleapis.com/maps/api/geocode/json",
            params={"address": item.name, "key": api_key, "language": language})
        for hit in response.json().get("results", []) if response.status_code == 200 else []:
            if is_road_anchor and "intersection" not in hit.get("types", []):
                continue
            loc = hit.get("geometry", {}).get("location", {})
            if is_road_anchor and bias_center and "lat" in loc and "lng" in loc and _haversine_km(*bias_center, loc["lat"], loc["lng"]) > bias_radius_meters / 1000:
                continue
            if "lat" in loc and "lng" in loc:
                return clean.model_copy(update={"lat": loc["lat"], "lng": loc["lng"],
                    "place_id": hit.get("place_id"), "address": hit.get("formatted_address"), "place_verified": True})
    except Exception as exc:
        logger.warning("Geocoding lookup unavailable: %s", type(exc).__name__)
    return clean


def _route_instructions(route: dict[str, Any]) -> list[str]:
    return [text for leg in route.get("legs", []) for step in leg.get("steps", [])
            if (text := step.get("navigationInstruction", {}).get("instructions", "").strip())]


async def _fetch_walk_metrics(
    client: httpx.AsyncClient, stops: list[PlaceStop], api_key: str, language: str = "ja", measure_elevation: bool = True, high_quality: bool = False
) -> RouteMetrics | None:
    """stops を順に辿る徒歩ルートの距離・時間・ポリライン・登り標高差を取得する。失敗時は None。
    経由地なし（[出発地, 目的地]）で呼べば Google マップ標準の徒歩ルート（比較用 baseline）になる。"""

    def wp(s: PlaceStop) -> dict[str, Any]:
        return {"location": {"latLng": {"latitude": s.lat, "longitude": s.lng}}}

    try:
        r_res = await client.post(
            "https://routes.googleapis.com/directions/v2:computeRoutes",
            headers={
                "X-Goog-Api-Key": api_key,
                "Content-Type": "application/json",
                "X-Goog-FieldMask": "routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline,routes.legs.steps.navigationInstruction.instructions,routes.legs.steps.distanceMeters",
            },
            json={
                "origin": wp(stops[0]),
                "destination": wp(stops[-1]),
                "intermediates": [wp(s) for s in stops[1:-1]],
                "polylineQuality": "HIGH_QUALITY" if (high_quality or measure_elevation) else "OVERVIEW",
                "travelMode": "WALK",
                "languageCode": language,
            },
        )
        routes = r_res.json().get("routes", [])
        if not routes:
            return None

        r0 = routes[0]
        dur_str = r0.get("duration", "900s").rstrip("s")
        poly = r0.get("polyline", {}).get("encodedPolyline", "")
        decoded = decode_polyline(poly) if poly else [LatLng(lat=s.lat, lng=s.lng) for s in stops]

        metrics = RouteMetrics(navigation_instructions=_route_instructions(r0),
            distance_meters=r0.get("distanceMeters",1200),duration_seconds=int(float(dur_str)),
            encoded_polyline=poly,path=decoded)
        if measure_elevation:
            await _measure_elevation_for_metrics(client,metrics,api_key)
        return metrics
    except Exception:
        return None


async def _measure_elevation_for_metrics(client: httpx.AsyncClient, metrics: RouteMetrics, api_key: str) -> tuple[float, float, float, float]:
    if len(metrics.path) < 2:
        return 0.0, 0.0, 0.0, 0.0
    try:
        # Keep comparable ~25m spacing, instead of diluting hills on a long detour.
        sample_count=min(512,max(10,math.ceil(metrics.distance_meters/25)+1))
        points=metrics.path if len(metrics.path)<=512 else _sample_path_by_fraction(metrics.path,tuple(i/511 for i in range(512)))
        encoded=encode_path(points)
        if len(encoded)>4500:
            encoded=encode_path(_sample_path_by_fraction(metrics.path,tuple(i/255 for i in range(256))))
        response = await client.get("https://maps.googleapis.com/maps/api/elevation/json", params={
            "path": "enc:"+encoded, "samples": sample_count, "key": api_key,
        })
        response.raise_for_status()
        payload = response.json()
        elevations = [p["elevation"] for p in payload.get("results", [])]
        if len(elevations) < 2:
            logger.warning("Elevation unavailable: status=%s", payload.get("status", "UNKNOWN"))
            metrics.warnings.append("標高データを取得できず、坂回避の条件は未確認です")
            return 0.0, 0.0, 0.0, 0.0
        profile = _summarize_elevation_profile(elevations, metrics.distance_meters)
        metrics.elevation_gain_meters, metrics.elevation_loss_meters = profile[:2]
        metrics.max_sampled_uphill_grade_percent, metrics.max_sampled_downhill_grade_percent = profile[2:]
        metrics.elevation_profile_meters = [round(value, 1) for value in elevations]
        metrics.elevation_sample_spacing_meters = round(metrics.distance_meters/(len(elevations)-1),1)
        return profile
    except Exception as exc:
        logger.warning("Elevation lookup failed: %s", type(exc).__name__)
        return 0.0, 0.0, 0.0, 0.0


async def _fetch_alternative_walk_routes(
    client: httpx.AsyncClient, origin: PlaceStop, destination: PlaceStop, api_key: str, language: str = "ja"
) -> list[RouteMetrics]:
    """One Routes API call for the default walk plus available alternatives."""
    def wp(s: PlaceStop) -> dict[str, Any]:
        return {"location": {"latLng": {"latitude": s.lat, "longitude": s.lng}}}
    try:
        response = await client.post(
            "https://routes.googleapis.com/directions/v2:computeRoutes",
            headers={"X-Goog-Api-Key": api_key, "Content-Type": "application/json",
                     "X-Goog-FieldMask": "routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline,routes.legs.steps.navigationInstruction.instructions"},
            json={"origin": wp(origin), "destination": wp(destination), "travelMode": "WALK",
                  "computeAlternativeRoutes": True, "polylineQuality":"HIGH_QUALITY", "languageCode": language},
        )
        response.raise_for_status()
        metrics: list[RouteMetrics] = []
        for route in response.json().get("routes", []):
            poly = route.get("polyline", {}).get("encodedPolyline", "")
            path = decode_polyline(poly) if poly else [LatLng(lat=origin.lat, lng=origin.lng), LatLng(lat=destination.lat, lng=destination.lng)]
            metrics.append(RouteMetrics(
                navigation_instructions=_route_instructions(route), distance_meters=route.get("distanceMeters", 0),
                duration_seconds=int(str(route.get("duration", "0s")).rstrip("s")),
                encoded_polyline=poly, path=path, elevation_gain_meters=0.0, warnings=[],
            ))
        return metrics
    except Exception as exc:
        logger.warning("Alternative walking routes failed: %s", type(exc).__name__)
        return []


def _route_overlap_fraction(a: RouteMetrics, b: RouteMetrics, threshold_m: float = 25.0) -> float:
    """Approximate shared path length by comparing evenly spaced route samples."""
    if not a.path or not b.path:
        return 0.0
    fractions = tuple(i / 20 for i in range(21))
    a_samples, b_samples = _sample_path_by_fraction(a.path, fractions), _sample_path_by_fraction(b.path, fractions)

    def within_threshold(samples: list[LatLng], path: list[LatLng]) -> float:
        if len(path) < 2:
            return 0.0
        cosine = math.cos(math.radians(path[0].lat))
        origin_lat, origin_lng = path[0].lat, path[0].lng
        def xy(point):
            return ((point.lng-origin_lng)*111320*cosine, (point.lat-origin_lat)*110540)
        vertices = [xy(point) for point in path]
        close = 0
        for point in samples:
            px, py = xy(point)
            nearest = float('inf')
            for (ax,ay),(bx,by) in zip(vertices,vertices[1:]):
                dx,dy = bx-ax,by-ay
                norm = dx*dx+dy*dy
                t = max(0,min(1,((px-ax)*dx+(py-ay)*dy)/norm)) if norm else 0
                nearest = min(nearest, math.hypot(px-ax-t*dx,py-ay-t*dy))
                if nearest <= threshold_m:
                    break
            close += nearest <= threshold_m
        return close/max(len(samples),1)

    return (within_threshold(a_samples, b.path) + within_threshold(b_samples, a.path)) / 2


def _measure_route_backtrack_percent(metrics: RouteMetrics, threshold_m: float = 28.0) -> float:
    """Measure if the route U-turns and doubles back along the same road segment (opposing direction within road width).
    Returns percentage of route distance spent retracing opposing path."""
    has_u_turn_instruction = any(
        re.search(r"Uターン|U-turn|転回|後ろに戻る|引き返す|掉头|調頭|逆走|戻って", inst, re.IGNORECASE)
        for inst in metrics.navigation_instructions
    )
    path = metrics.path
    if len(path) < 6:
        return 35.0 if has_u_turn_instruction else 0.0

    origin = path[0]
    cosine = math.cos(math.radians(origin.lat))
    grid: dict[tuple[int, int], list[tuple[float, float, float, float, float]]] = {}
    total = repeated = travelled = 0.0

    for a, b in zip(path, path[1:]):
        ax, ay = (a.lng - origin.lng) * 111320 * cosine, (a.lat - origin.lat) * 110540
        bx, by = (b.lng - origin.lng) * 111320 * cosine, (b.lat - origin.lat) * 110540
        length = math.hypot(bx - ax, by - ay)
        if length < 0.01:
            continue
        ux, uy = (bx - ax) / length, (by - ay) / length
        count = max(1, math.ceil(length / 8))
        step = length / count
        for i in range(count):
            fraction = (i + 0.5) / count
            x, y = ax + (bx - ax) * fraction, ay + (by - ay) * fraction
            key = (math.floor(x / 10), math.floor(y / 10))
            match = False
            # 道路幅（最大約28m、大通りの両側歩道を含む）での逆方向進行（Uターン引き返し）を検出
            # 迂回路（別の通り）は通常35m以上離れているため誤検出しない
            for dx in range(-3, 4):
                for dy in range(-3, 4):
                    for px, py, vx, vy, distance in grid.get((key[0] + dx, key[1] + dy), []):
                        if travelled - distance >= 12 and ux * vx + uy * vy < -0.4 and math.hypot(x - px, y - py) <= threshold_m:
                            match = True
                            break
                    if match:
                        break
                if match:
                    break
            if match:
                repeated += step
            total += step
            grid.setdefault(key, []).append((x, y, ux, uy, travelled))
            travelled += step

    calc = round(repeated / total * 100, 1) if total >= 50 else 0.0
    return max(35.0, calc) if has_u_turn_instruction else calc


def _lateral_route_anchors(path: list[LatLng]) -> list[tuple[LatLng, str]]:
    """Create deterministic waypoint anchors on either side of a route midpoint."""
    if len(path) < 2:
        return []
    before, after, center = _sample_path_by_fraction(path, (0.4, 0.6, 0.5))
    mean_lat = math.radians(center.lat)
    dx = (after.lng - before.lng) * 111_320 * math.cos(mean_lat)
    dy = (after.lat - before.lat) * 110_540
    length = math.hypot(dx, dy)
    if length < 1:
        return []
    # Left/right offsets from the direction of travel. Nearby streets often sit one or two blocks away.
    normal_x, normal_y = -dy / length, dx / length
    anchors: list[tuple[LatLng, str]] = []
    for offset_m in (90.0, 180.0):
        for side, sign in (("左", 1.0), ("右", -1.0)):
            east_m, north_m = normal_x * offset_m * sign, normal_y * offset_m * sign
            lat = center.lat + north_m / 110_540
            lng = center.lng + east_m / (111_320 * max(math.cos(mean_lat), 0.01))
            anchors.append((LatLng(lat=lat, lng=lng), f"進行方向の{side}側・約{offset_m:.0f}m地点経由"))
    return anchors


async def _fetch_alternatives_for_queries(
    client: httpx.AsyncClient, origin: str, destination: str, current_location: LatLng | None,
    api_key: str, language: str, destination_location: LatLng | None = None,
) -> tuple[list[RouteMetrics], PlaceStop | None, PlaceStop | None]:
    def waypoint(query: str, fallback: LatLng | None, explicit_loc: LatLng | None = None) -> dict[str, Any]:
        if explicit_loc:
            return {"location": {"latLng": {"latitude": explicit_loc.lat, "longitude": explicit_loc.lng}}}
        if fallback and query in CURRENT_LOCATION_WORDS:
            return {"location": {"latLng": {"latitude": fallback.lat, "longitude": fallback.lng}}}
        coord_match = re.search(r"([-+]?\d{1,3}\.\d+)\s*,\s*([-+]?\d{1,3}\.\d+)", query)
        if coord_match:
            try:
                c_lat = float(coord_match.group(1))
                c_lng = float(coord_match.group(2))
                if -90 <= c_lat <= 90 and -180 <= c_lng <= 180:
                    return {"location": {"latLng": {"latitude": c_lat, "longitude": c_lng}}}
            except ValueError:
                pass
        return {"address": query}
    try:
        response = await client.post(
            "https://routes.googleapis.com/directions/v2:computeRoutes",
            headers={"X-Goog-Api-Key": api_key, "Content-Type": "application/json",
                     "X-Goog-FieldMask": "routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline,routes.legs.steps.navigationInstruction.instructions"},
            json={"origin": waypoint(origin, current_location), "destination": waypoint(destination, None, destination_location),
                  "travelMode": "WALK", "computeAlternativeRoutes": True, "polylineQuality":"HIGH_QUALITY", "languageCode": language},
        )
        response.raise_for_status()
        result: list[RouteMetrics] = []
        for route in response.json().get("routes", []):
            poly = route.get("polyline", {}).get("encodedPolyline", "")
            path = decode_polyline(poly) if poly else []
            result.append(RouteMetrics(navigation_instructions=_route_instructions(route), distance_meters=route.get("distanceMeters", 0),
                duration_seconds=int(str(route.get("duration", "0s")).rstrip("s")),
                encoded_polyline=poly, path=path, elevation_gain_meters=0.0, warnings=[]))
        if not result or not result[0].path:
            return [], None, None
        first, last = result[0].path[0], result[0].path[-1]
        return result, PlaceStop(name=origin, lat=first.lat, lng=first.lng, reason="出発地", tags=["出発地"]), PlaceStop(name=destination, lat=last.lat, lng=last.lng, reason="目的地", tags=["目的地"])
    except Exception as exc:
        logger.warning("Address-based alternative routes failed: %s", type(exc).__name__)
        return [], None, None


async def _solar_shade_percent(
    client: httpx.AsyncClient, path: list[LatLng], api_key: str,
    sample_cache: dict[tuple[float, float], asyncio.Task[bool | None]] | None = None,
) -> float | None:
    """Estimate shade by sampling Solar hourlyShade raster at up to three route points."""
    # コスト保護ガード: Solar API ($0.075/call) の意図しない課金を防ぐため、明示的に有効化された場合のみ呼ぶ
    if not os.getenv("ENABLE_SOLAR_API", "false").lower() in ("true", "1"):
        return None
    if not path:
        return None
    try:
        import io
        import rasterio
        from rasterio.warp import transform as reproject_coords
        now = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=9)))
        sample_points = _sample_path_by_fraction(path)
        outcomes: list[bool] = []
        async def sample_uncached(point: LatLng) -> bool | None:
            data = await client.get("https://solar.googleapis.com/v1/dataLayers:get", params={
                "location.latitude": point.lat, "location.longitude": point.lng,
                "radiusMeters": 100, "key": api_key,
            })
            data.raise_for_status()
            shade_urls = data.json().get("hourlyShadeUrls", [])
            if len(shade_urls) < now.month:
                return None
            asset_id = shade_urls[now.month - 1].split("id=", 1)[-1]
            raster_resp = await client.get("https://solar.googleapis.com/v1/geoTiff:get", params={"id": asset_id, "key": api_key})
            raster_resp.raise_for_status()
            with rasterio.open(io.BytesIO(raster_resp.content)) as raster:
                xs, ys = reproject_coords("EPSG:4326", raster.crs, [point.lng], [point.lat])
                row, col = raster.index(xs[0], ys[0])
                if row < 0 or col < 0 or row >= raster.height or col >= raster.width:
                    return None
                # Bands are hours 0..23; bit (day-1) set means sun, unset means shade.
                value = int(raster.read(now.hour + 1)[row, col])
                if value == -2147483648 or value < 0:
                    return None
                return not bool(value & (1 << (now.day - 1)))
        async def sample(point: LatLng) -> bool | None:
            key = (round(point.lat, 5), round(point.lng, 5))
            task = sample_cache.get(key) if sample_cache is not None else None
            if task is None:
                task = asyncio.create_task(sample_uncached(point))
                if sample_cache is not None:
                    sample_cache[key] = task
            return await task

        outcomes = [x for x in await asyncio.gather(*(sample(point) for point in sample_points)) if x is not None]
        return round(sum(outcomes) * 100 / len(outcomes), 1) if outcomes else None
    except Exception as exc:
        logger.warning("Solar shade lookup failed: %s", type(exc).__name__)
        return None


async def _assess_street_view(client: httpx.AsyncClient, path: list[LatLng], maps_key: str, language: str,
                              requested_visual_target: str | None = None,
                              focus_points: list[LatLng] | None = None) -> tuple[list[str], list[str], list[StreetViewObservation]]:
    """Sample up to three points, prioritizing requested stops on the actual route."""
    project_id, gemini_key = os.getenv("GOOGLE_CLOUD_PROJECT"), os.getenv("GEMINI_API_KEY")
    if not path or (not project_id and not gemini_key):
        return [], [], []
    points: list[tuple[LatLng, float]] = []
    if focus_points:
        focus = focus_points
        if len(focus)>3:
            focus=[focus[round(i*(len(focus)-1)/2)] for i in range(3)]
        for wanted in focus:
            fraction, distance = route_position(path,wanted)
            nearest = _sample_path_by_fraction(path,(fraction,))[0]
            if distance<=150 and all(_haversine_km(nearest.lat,nearest.lng,p.lat,p.lng)>=0.08 for p,_ in points):
                points.append((nearest,fraction))
    fractions=(0.25,0.5,0.75)
    for point,fraction in zip(_sample_path_by_fraction(path,fractions),fractions):
        if len(points)>=3:
            break
        if all(_haversine_km(point.lat,point.lng,p.lat,p.lng)>=0.08 for p,_ in points):
            points.append((point,fraction))
    points.sort(key=lambda item:item[1])
    async def fetch_image(sample_index: int, p: LatLng, fraction: float):
        try:
            meta=await client.get("https://maps.googleapis.com/maps/api/streetview/metadata",params={
                "location":f"{p.lat},{p.lng}","radius":35,"source":"outdoor","key":maps_key})
            metadata=meta.json()
            if meta.status_code!=200 or metadata.get("status")!="OK" or not metadata.get("pano_id"):
                return None
            location=metadata.get("location",{})
            camera=LatLng(lat=location["lat"],lng=location["lng"])
            progress,off_route=route_position(path,camera,hint=fraction)
            if off_route>20 or _haversine_km(p.lat,p.lng,camera.lat,camera.lng)>0.06:
                return None
            heading=forward_heading(path,progress)
            if heading is None:
                return None
            params={"size":"640x400","pano":metadata["pano_id"],"heading":heading,"pitch":0,
                    "fov":100,"return_error_code":"true","key":maps_key}
            image_url="https://maps.googleapis.com/maps/api/streetview"
            img=await client.get(image_url,params=params)
            if img.status_code==200 and img.headers.get("content-type","").startswith("image/"):
                return (sample_index,f"{camera.lat:.5f},{camera.lng:.5f}; forward_heading={heading}",img.content,image_url+"?"+urlencode(params))
        except Exception as exc:
            logger.info("Street View sample %s unavailable; skipping: %s",sample_index,type(exc).__name__)
        return None
    images=[x for x in await asyncio.gather(*(fetch_image(i,p,fraction) for i,(p,fraction) in enumerate(points,1))) if x]
    # Keep returned image order and Gemini sample_index aligned if an earlier image is unavailable.
    images=[(index,*item[1:]) for index,item in enumerate(images,1)]
    if not images:
        return [], [], []
    try:
        from google.genai import types

        gclient = _get_genai_client()
        if gclient is None:
            return [], [], []
        contents: list = [
            "各画像は経路の進行方向へ向けたStreet Viewです。画面中央に続く進行方向の道と、同じ道路の左右の歩道・街灯を対象にしてください。交差する別の道路や建物の敷地内通路は評価に混ぜないでください。画像ごとにsample_indexを保ち、画像から直接確認できる特徴だけをJSONで評価してください。"
            "road_widthは自動車の車線数ではなく歩行者が使う通行空間の見た目をnarrow/normal/wide/unknownで評価。"
            "sidewalkとstreet_lighting（照明器具・街灯が画像内に見えるか）はvisible/not_visible/unknown、"
            "surface_conditionは歩行面の見た目をsmooth/uneven/damaged/unknown、path_obstructionは歩行経路を塞ぐ物が画像内に明確にある場合obstructed、なければclear、判断できなければunknown。"
            "scene_typeはoutdoor_road/outdoor_walkway/indoor/unknown。駅ホーム・店内などの屋内画像はindoorとし、経路の道路の根拠にしない。"
            "overhead_coverは進行する歩行空間の上にある樹冠・屋根の覆いをopen/partial/covered/unknownで評価。実際の日陰、気温、雨よけの連続性は推定しない。"
            "visibilityはgood/average/poor/unknown。not_visibleは『画像内で見つからない』意味で、存在しないという断定ではありません。"
            "画像外の区間、現在の照度、治安、法的な通行可否、連続した歩道の有無を推測しないでください。確信が低ければunknown、confidenceは0〜1。"
        ]
        if requested_visual_target:
            contents[0] += (
                f"ユーザーの景観希望は『{requested_visual_target}が見えること』です。requested_feature_visibilityは各画像の画角内で"
                f"{requested_visual_target}を直接確認できる場合のみvisible、画角内にない場合not_visible、判断できなければunknown。"
                "この画像1枚の評価に限り、ルート全体で見えるとは断言しないでください。"
            )
        for sample_index, loc, data, _url in images:
            contents.extend([f"sample_index={sample_index}, location={loc}", types.Part.from_bytes(data=data, mime_type="image/jpeg")])

        gemini_model = os.getenv("STREET_VIEW_GEMINI_MODEL") or os.getenv("GEMINI_MODEL", "gemini-3.5-flash-lite")
        timeout_sec = float(os.getenv("GEMINI_TIMEOUT_SECONDS", "12.0"))

        def _call_streetview_gemini():
            return gclient.models.generate_content(
                model=gemini_model,
                contents=contents,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    response_schema=StreetViewAssessment,
                    temperature=0.0,
                ),
            )

        cache_key = ("road-evidence-v2", gemini_model, requested_visual_target, tuple(url.rsplit("&key=", 1)[0] for _, _, _, url in images))
        cached = _STREET_VIEW_ANALYSIS_CACHE.get(cache_key)
        if cached and time.monotonic() - cached[0] < 300:
            parsed = cached[1].model_copy(deep=True)
        else:
            response = await asyncio.wait_for(asyncio.to_thread(_call_streetview_gemini), timeout=timeout_sec)
            parsed = StreetViewAssessment.model_validate_json(response.text)
            _STREET_VIEW_ANALYSIS_CACHE[cache_key] = (time.monotonic(), parsed.model_copy(deep=True))
            if len(_STREET_VIEW_ANALYSIS_CACHE) > 128:
                oldest = min(_STREET_VIEW_ANALYSIS_CACHE, key=lambda key: _STREET_VIEW_ANALYSIS_CACHE[key][0])
                _STREET_VIEW_ANALYSIS_CACHE.pop(oldest, None)
        image_indexes = {sample_index for sample_index, _, _, _ in images}
        observations = [item for item in parsed.observations if item.sample_index in image_indexes]
        for index, item in enumerate(observations):
            if item.scene_type == "indoor":
                observations[index] = StreetViewObservation(sample_index=item.sample_index, scene_type="indoor",
                    note="屋内画像のため経路の道路との対応を確認できず、採点対象外")
        if requested_visual_target is None:
            for item in observations:
                item.requested_feature_visibility = "unknown"
        by_index = {item.sample_index: item for item in observations}
        urls = [url for _, _, _, url in images]
        width_ja = {"narrow": "道幅狭め", "normal": "道幅普通", "wide": "道幅広め", "unknown": ""}
        def _format_note(item):
            tags = []
            if item.sidewalk == "visible":
                tags.append("歩道あり")
            if item.street_lighting == "visible":
                tags.append("街灯あり")
            if width_ja.get(item.road_width):
                tags.append(width_ja[item.road_width])
            if item.visibility == "good":
                tags.append("見通し良好")
            return f"地点{item.sample_index}: " + ("・".join(tags) if tags else "画像から対象の道路状態を確認できず")

        notes = [_format_note(item) for item in sorted(observations, key=lambda value: value.sample_index)]
        return notes, urls, [by_index[index] for index in sorted(by_index)]
    except Exception:
        logger.exception("Street View Gemini assessment failed")
        return [], [], []


async def _build_route_candidate(
    client: httpx.AsyncClient,
    origin_stop: PlaceStop,
    dest_stop: PlaceStop,
    plan_opt: PlannedRouteOption,
    api_key: str,
    language: str = "ja",
    analyze_images: bool = False,
    analyze_shade: bool = False,
    measure_elevation: bool = True,
    resolve_stops: bool = True,
    allow_experience_detour: bool = False,
    requested_visual_target: str | None = None,
    include_facilities: bool = True,
    place_resolution_cache: dict[tuple, asyncio.Task[PlaceStop]] | None = None,
    shade_sample_cache: dict[tuple[float, float], asyncio.Task[bool | None]] | None = None,
) -> RouteCandidate | None:
    mid_lat = (origin_stop.lat + dest_stop.lat) / 2
    mid_lng = (origin_stop.lng + dest_stop.lng) / 2
    direct_km = _haversine_km(origin_stop.lat, origin_stop.lng, dest_stop.lat, dest_stop.lng)
    bias_r = max(2500.0, direct_km * 1000 * 1.2)

    requested_stops = plan_opt.suggested_stops if resolve_stops else []
    place_tasks: list[asyncio.Task[PlaceStop]] = []
    for stop in requested_stops:
        key = (stop.name.strip().casefold(), stop.lat, stop.lng, round(mid_lat, 3), round(mid_lng, 3), language)
        task = place_resolution_cache.get(key) if place_resolution_cache is not None else None
        if task is None:
            task = asyncio.create_task(_resolve_place(
                client, stop, api_key, bias_center=(mid_lat, mid_lng), bias_radius_meters=bias_r, language=language, include_facilities=include_facilities
            ))
            if place_resolution_cache is not None:
                place_resolution_cache[key] = task
        place_tasks.append(task)
    resolved_places = await asyncio.gather(*place_tasks)
    resolved_inter = [
        place.model_copy(update={"purpose": requested.purpose})
        for requested, place in zip(requested_stops, resolved_places)
    ]

    # ユーザーが明示指定した経由地・立ち寄りスポットを確実にすべて反映
    missing = [requested.name for requested, place in zip(requested_stops, resolved_inter) if not (place.lat and place.lng)]
    if any(not (place.lat and place.lng) and requested.purpose == "user_stop" for requested, place in zip(requested_stops, resolved_inter)):
        raise RouteSearchError("指定経由地を確認できませんでした: " + "、".join(missing) + "。地図で地点を選び直してください。")
    valid_inter: list[PlaceStop] = [s for s in resolved_inter if s.lat and s.lng]

    distinct_inter = []
    for stop in valid_inter:
        if any((stop.place_id and stop.place_id == prior.place_id) or _haversine_km(stop.lat,stop.lng,prior.lat,prior.lng)<0.01 for prior in distinct_inter):
            continue
        distinct_inter.append(stop)
    valid_inter = distinct_inter
    stops = [origin_stop] + valid_inter + [dest_stop]

    if len(stops) < 2 or not stops[0].lat or not stops[-1].lat:
        return None

    metrics = await _fetch_walk_metrics(client, stops, api_key, language=language, measure_elevation=measure_elevation)
    if metrics is None:
        return None

    if missing:
        metrics.warnings.append("場所を確認できず採用しなかった候補: " + "、".join(missing))

    roads = plan_opt._requested_road_names
    road_anchors = [stop for stop in valid_inter if stop.purpose == "road_anchor"]
    if roads and not all(_road_usage_confirmed(road, metrics.navigation_instructions) for road in roads):
        # A wrongly resolved intersection must not force a detour on unrelated roads.
        if road_anchors:
            valid_inter = [stop for stop in valid_inter if stop.purpose != "road_anchor"]
            stops = [origin_stop] + valid_inter + [dest_stop]
            fallback = await _fetch_walk_metrics(client, stops, api_key, language=language, measure_elevation=measure_elevation)
            if fallback is None:
                raise RouteSearchError("指定道路への接続地点を確認できませんでした。道路上の地点を地図で指定してください。")
            metrics = fallback
        metrics.warnings.append("指定道路（" + "・".join(roads) + "）に沿う経路を確認できず、未確認の接続地点は採用していません。指定道路上の地点を地図で選ぶと再検索できます。")

    enrichments = await asyncio.gather(
        _assess_street_view(
            client, metrics.path, api_key, language, requested_visual_target,
            [LatLng(lat=stop.lat, lng=stop.lng) for stop in valid_inter],
        ) if analyze_images else asyncio.sleep(0, result=([], [], [])),
        _solar_shade_percent(client, metrics.path, api_key, shade_sample_cache) if analyze_shade else asyncio.sleep(0, result=None),
    )
    (view_notes, view_urls, visual_observations), shade_percent = enrichments
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
        metrics=metrics,
        street_view_assessment=view_notes,
        street_view_images=view_urls,
        street_view_observations=visual_observations,
        solar_shade_percent=shade_percent,
    )


async def _build_timed_loop_routes(
    client: httpx.AsyncClient, origin: PlaceStop, analysis: AgentAnalysis, api_key: str,
    language: str, analyze_images: bool, analyze_shade: bool, measure_elevation: bool,
    requested_visual_target: str | None = None,
) -> tuple[list[RouteCandidate], RouteMetrics | None]:
    """Compute road-following loops, then correct their radius once using actual walking time."""
    target_seconds = analysis.loop_minutes * 60
    radius_km = max(0.08, analysis.loop_minutes * 0.08 / 3.75)
    directions = ["北側", "東側", "南側", "西側"]

    def loop_stops(index: int, radius: float, spread: float = 60.0, rotation: float = 0.0) -> list[PlaceStop]:
        stops = [origin]
        # 往路と復路が同じ道路でUターン重複しないよう、角度差を広げ動径差をつけた迂回サーキット配置
        offsets = [(-spread, "A", 0.9), (0.0, "B", 1.3), (spread, "C", 0.9)]
        if index % 2:
            offsets.reverse()
        for offset, label, r_mult in offsets:
            angle = math.radians(index * 90 + offset + rotation)
            r = radius * r_mult
            lat = origin.lat + r * math.cos(angle) / 111.32
            lng = origin.lng + r * math.sin(angle) / (111.32 * max(0.01, math.cos(math.radians(origin.lat))))
            stops.append(PlaceStop(name=f"{directions[index]}の周回経由点{label}", lat=lat, lng=lng,
                                   reason="通ってきた道をUターンせず迂回して戻るための経由点", tags=["周回経由点"]))
        return stops + [origin]

    async def generate(index: int) -> RouteCandidate | None:
        trial_radius = radius_km
        rotation = 0.0
        metrics = None
        stops = []
        def quality(value):
            error = abs(value.duration_seconds - target_seconds) / target_seconds
            return error * 100 + _measure_route_backtrack_percent(value) * 1.5
        for attempt in range(3):
            trial_stops = loop_stops(index, trial_radius, rotation=rotation)
            trial = await _fetch_walk_metrics(client,trial_stops,api_key,language,measure_elevation=False)
            if trial is None or trial.duration_seconds<=0 or not trial.encoded_polyline:
                break
            if metrics is None or quality(trial)<quality(metrics):
                metrics,stops=trial,trial_stops
            backtrack = _measure_route_backtrack_percent(trial)
            if abs(trial.duration_seconds-target_seconds)<=120 and backtrack<5:
                break
            trial_radius *= max(.4,min(1.6,target_seconds/trial.duration_seconds))
            if backtrack >= 5:
                rotation += 15
        if metrics is None:
            return None
        if not metrics.path or abs(metrics.duration_seconds-target_seconds) > max(180,target_seconds*0.15):
            return None
        backtrack = _measure_route_backtrack_percent(metrics)
        if backtrack >= 8:
            return None
        if backtrack >= 1:
            metrics.warnings.append(f"経路の約{backtrack:.0f}%は来た道付近を戻る可能性があります。完全な一方向周回は未確認です")
        view, shade, _ = await asyncio.gather(
            _assess_street_view(client, metrics.path, api_key, language, requested_visual_target) if analyze_images else asyncio.sleep(0, result=([], [], [])),
            _solar_shade_percent(client, metrics.path, api_key) if analyze_shade else asyncio.sleep(0, result=None),
            _measure_elevation_for_metrics(client, metrics, api_key) if measure_elevation else asyncio.sleep(0),
        )
        return RouteCandidate(route_id=f"loop_{index + 1}", title=f"{directions[index]}を回る周回散歩（約{round(metrics.duration_seconds / 60)}分）",
            concept=f"{origin.name}を出発して戻る徒歩周回。目標{analysis.loop_minutes}分に対し実道路の所要時間を比較しました。",
            tags=["周回", f"目標{analysis.loop_minutes}分"], waypoints=stops, metrics=metrics,
            street_view_assessment=view[0], street_view_images=view[1], street_view_observations=view[2], solar_shade_percent=shade)

    generated = await asyncio.gather(*(generate(index) for index in range(min(len(analysis.planned_routes), 4))))
    valid_routes = [route for route in generated if route]
    candidates = sorted(valid_routes, key=lambda route: abs(route.metrics.duration_seconds-target_seconds)/target_seconds*100 + _measure_route_backtrack_percent(route.metrics)*1.5)
    unique: list[RouteCandidate] = []
    for route in candidates:
        if not any(_route_overlap_fraction(route.metrics, previous.metrics) >= 0.95 for previous in unique):
            unique.append(route)
    if not unique:
        raise RouteSearchError("指定時間に近く、往復の少ない徒歩周回を作成できませんでした。出発地や時間を変更してください。")
    return unique, None


async def build_all_routes(
    analysis: AgentAnalysis, api_key: str, current_location: LatLng | None = None, language: str = "ja",
    include_facilities: bool = False,
    facility_preferences: tuple[str, ...] = (),
    analyze_images: bool = False, analyze_shade: bool = False, measure_elevation: bool = True,
    resolve_stops: bool = True, fast_alternatives: bool = False, allow_experience_detour: bool = False,
    requested_visual_target: str | None = None, destination_location: LatLng | None = None,
    origin_location: LatLng | None = None,
) -> tuple[list[RouteCandidate], RouteMetrics | None]:
    async with httpx.AsyncClient(timeout=25.0, limits=httpx.Limits(max_connections=20, max_keepalive_connections=10)) as client:
        shade_sample_cache: dict[tuple[float, float], asyncio.Task[bool | None]] = {}
        has_suggested_stops = any(opt.suggested_stops for opt in analysis.planned_routes)
        if fast_alternatives and not has_suggested_stops and not analysis.loop_minutes and origin_location is None:
            options, fast_origin, fast_destination = await _fetch_alternatives_for_queries(
                client, analysis.origin_query, analysis.destination_query, current_location, api_key, language, destination_location=destination_location)
            if options and fast_origin and fast_destination:
                if options[0].distance_meters > MAX_WALK_ROUTE_DISTANCE_METERS:
                    raise RouteSearchError("この距離は徒歩ルート検索の範囲外です。出発地・目的地を近い区間に分けてください。")
                candidates = []
                for idx, metrics in enumerate(options[:len(analysis.planned_routes)]):
                    plan = analysis.planned_routes[min(idx, len(analysis.planned_routes)-1)]
                    candidates.append(RouteCandidate(route_id=plan.route_id, title=plan.title, concept=plan.concept,
                        travel_mode="WALK", tags=plan.tags, safety_note=plan.safety_note, fatigue_note=plan.fatigue_note,
                        seasonal_weather_note=plan.seasonal_weather_note, waypoints=[fast_origin, fast_destination], metrics=metrics))
                return candidates, options[0]

        async def resolve_endpoint(query: str, reason: str, tag: str) -> PlaceStop:
            q = (query or "").strip()
            if not q:
                raise RouteSearchError(f"{reason}が指定されていません。")
            # GPSを取得できないのに固定の開発用座標へ案内してしまわない。
            if q in CURRENT_LOCATION_WORDS:
                if current_location:
                    return PlaceStop(name="現在地", lat=current_location.lat, lng=current_location.lng, reason=reason, tags=[tag])
                raise RouteSearchError("現在地を取得できませんでした。位置情報を許可するか、出発地を入力してください。")

            coord_match = re.search(r"([-+]?\d{1,3}\.\d+)\s*,\s*([-+]?\d{1,3}\.\d+)", q)
            if coord_match:
                try:
                    c_lat = float(coord_match.group(1))
                    c_lng = float(coord_match.group(2))
                    if -90 <= c_lat <= 90 and -180 <= c_lng <= 180:
                        return PlaceStop(name=q, lat=c_lat, lng=c_lng, reason=reason, tags=[tag])
                except ValueError:
                    pass

            # A name is unresolved until Places/Geocoding returns an actual location.
            # Nonzero development coordinates would trigger the confirmed-coordinate bypass.
            resolved = await _resolve_place(
                client, PlaceStop(name=q, lat=0.0, lng=0.0, reason=reason, tags=[tag]), api_key, language=language
            )
            if not resolved.place_id:
                raise RouteSearchError(f"{reason}「{q}」の場所を見つけられませんでした。地名や駅名を確認してください。")
            return resolved

        async def resolve_origin_endpoint() -> PlaceStop:
            if origin_location is not None:
                return PlaceStop(name=analysis.origin_query or "出発地", lat=origin_location.lat,
                                 lng=origin_location.lng, reason="出発地", tags=["出発地"])
            return await resolve_endpoint(analysis.origin_query, "出発地", "出発地")

        async def resolve_dest_endpoint() -> PlaceStop:
            if destination_location:
                dest_base = PlaceStop(
                    name=analysis.destination_query or "指定した地点",
                    lat=destination_location.lat,
                    lng=destination_location.lng,
                    reason="目的地",
                    tags=["目的地"],
                )
                return await _snap_to_nearest_public_road(client, dest_base, api_key, language)
            resolved = await resolve_endpoint(analysis.destination_query, "目的地", "目的地")
            return resolved

        if analysis.loop_minutes:
            origin_stop = await resolve_origin_endpoint()
            return await _build_timed_loop_routes(client, origin_stop, analysis, api_key, language,
                analyze_images, analyze_shade, measure_elevation, requested_visual_target)

        origin_stop, dest_stop = await asyncio.gather(
            resolve_origin_endpoint(),
            resolve_dest_endpoint(),
        )
        if facility_preferences and not analysis.loop_minutes:
            from app.services.route_facilities import facility_plans
            analysis.planned_routes = await facility_plans(client,origin_stop,dest_stop,api_key,facility_preferences,analysis.planned_routes,language)
            resolve_stops = True

        direct_distance_km = _haversine_km(origin_stop.lat, origin_stop.lng, dest_stop.lat, dest_stop.lng)
        if direct_distance_km > MAX_WALK_DIRECT_DISTANCE_KM:
            raise RouteSearchError("出発地と目的地が離れすぎています。徒歩ルート検索は直線距離50km以内で指定してください。")
        # Only treat planner stops as active if they will actually be resolved and routed.
        # Otherwise this branch must still request/deduplicate route alternatives; previously a
        # discarded Gemini stop suggestion could force all candidates back onto the same baseline.
        has_any_planned_stop = resolve_stops and any(opt.suggested_stops for opt in analysis.planned_routes)
        if not has_any_planned_stop:
            options = await _fetch_alternative_walk_routes(client, origin_stop, dest_stop, api_key, language)
            if options:
                route_limit = max(1, min(len(analysis.planned_routes), 3))
                selected: list[tuple[RouteMetrics, str]] = []

                def add_if_distinct(metrics: RouteMetrics, label: str) -> bool:
                    if not metrics.path or any(_route_overlap_fraction(metrics, prior) >= 0.80 for prior, _ in selected):
                        return False
                    selected.append((metrics, label))
                    return True

                for idx, metrics in enumerate(options):
                    add_if_distinct(metrics, "標準ルート" if idx == 0 else f"Routes API代替ルート {idx}")
                    if len(selected) >= route_limit:
                        break

                # Routes API alternatives can collapse to the same pedestrian path. If so, ask it
                # for routes through nearby left/right corridor anchors, then retain only distinct,
                # reasonably sized results. Enrichment APIs run only after this deduplication.
                anchors = _lateral_route_anchors(options[0].path)
                next_anchor = 0
                while len(selected) < route_limit and next_anchor < len(anchors):
                    batch_size = min(2, route_limit - len(selected), len(anchors) - next_anchor)
                    batch = anchors[next_anchor:next_anchor + batch_size]
                    next_anchor += batch_size

                    async def via_anchor(anchor: LatLng, label: str) -> RouteMetrics | None:
                        anchor_stop = PlaceStop(name="経路候補点", lat=anchor.lat, lng=anchor.lng,
                                                reason="経路の異なる候補を探索", tags=[])
                        return await _fetch_walk_metrics(client, [origin_stop, anchor_stop, dest_stop],
                                                         api_key, language=language, measure_elevation=False)

                    generated = await asyncio.gather(*(via_anchor(anchor, label) for anchor, label in batch))
                    for (anchor, label), metrics in zip(batch, generated):
                        if metrics is None:
                            continue
                        max_distance = max(options[0].distance_meters * 1.6, options[0].distance_meters + 500)
                        if metrics.distance_meters > max_distance:
                            continue
                        # Reject candidates that did not actually pass near the requested waypoint.
                        nearest_anchor_m = min(_haversine_km(anchor.lat, anchor.lng, p.lat, p.lng) * 1000
                                               for p in metrics.path)
                        if nearest_anchor_m > 150:
                            continue
                        add_if_distinct(metrics, f"別経路候補（{label}）")

                async def make_option(idx: int, item: tuple[RouteMetrics, str]) -> RouteCandidate:
                    metrics, label = item
                    enrichment = await asyncio.gather(
                        _assess_street_view(client, metrics.path, api_key, language, requested_visual_target) if analyze_images else asyncio.sleep(0, result=([], [], [])),
                        _solar_shade_percent(client, metrics.path, api_key, shade_sample_cache) if analyze_shade else asyncio.sleep(0, result=None),
                        _measure_elevation_for_metrics(client, metrics, api_key) if measure_elevation else asyncio.sleep(0, result=(0.0, 0.0, 0.0, 0.0)),
                    )
                    (view_notes, view_urls, visual_observations), shade, _elevation_profile = enrichment
                    route_id = (analysis.planned_routes[min(idx, len(analysis.planned_routes) - 1)].route_id
                                if analysis.planned_routes else f"route_{idx + 1}")
                    snapped_end = (
                        dest_stop.model_copy(update={"lat": metrics.path[-1].lat, "lng": metrics.path[-1].lng})
                        if metrics.path
                        else dest_stop
                    )
                    return RouteCandidate(route_id=route_id, title=label,
                        concept="Google Routes APIで計算した実際の徒歩経路です。道幅・街灯などはStreet Viewの代表地点で確認した範囲を示します。",
                        travel_mode="WALK", tags=["Routes API算出"], waypoints=[origin_stop, snapped_end], metrics=metrics,
                        street_view_assessment=view_notes, street_view_images=view_urls,
                        street_view_observations=visual_observations,
                        solar_shade_percent=shade)
                baseline = options[0]
                baseline_task = (
                    _measure_elevation_for_metrics(client, baseline, api_key)
                    if measure_elevation and baseline.path and not any(metrics is baseline for metrics, _label in selected)
                    else asyncio.sleep(0, result=(0.0, 0.0, 0.0, 0.0))
                )
                candidates_task = asyncio.gather(*(make_option(i, item) for i, item in enumerate(selected)))
                _, candidates = await asyncio.gather(baseline_task, candidates_task)
                if not candidates:
                    raise RouteSearchError("この区間の徒歩ルートが見つかりませんでした。出発地と目的地を確認してください。")
                return list(candidates), baseline
        # Identical waypoint plans would produce identical Routes, Street View, Solar and
        # Elevation work. Keep one representative before making any of those calls.
        unique_plans: list[PlannedRouteOption] = []
        seen_stop_sequences: set[tuple] = set()
        for option in analysis.planned_routes:
            stop_sequence = tuple((stop.name.strip().casefold(), stop.lat, stop.lng) for stop in option.suggested_stops)
            if stop_sequence in seen_stop_sequences:
                continue
            seen_stop_sequences.add(stop_sequence)
            unique_plans.append(option)
        place_resolution_cache: dict[tuple, asyncio.Task[PlaceStop]] = {}

        baseline, *candidates = await asyncio.gather(
            # Measure Google standard walk route baseline including elevation
            _fetch_walk_metrics(client, [origin_stop, dest_stop], api_key, language=language,
                                measure_elevation=measure_elevation),
            *[
                _build_route_candidate(client, origin_stop, dest_stop, opt, api_key, language=language,
                    analyze_images=analyze_images, analyze_shade=analyze_shade, measure_elevation=measure_elevation,
                    resolve_stops=resolve_stops, allow_experience_detour=allow_experience_detour,
                    requested_visual_target=requested_visual_target,
                    include_facilities=include_facilities, place_resolution_cache=place_resolution_cache,
                    shade_sample_cache=shade_sample_cache)
                for opt in unique_plans
            ],
        )
        candidates = [candidate for candidate in candidates if candidate is not None and candidate.metrics.encoded_polyline]
        if not candidates:
            raise RouteSearchError("この区間の徒歩ルートが見つかりませんでした。出発地と目的地を近い地点に分けてください。")
        return candidates, baseline
