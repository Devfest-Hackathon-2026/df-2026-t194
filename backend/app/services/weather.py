import asyncio
import datetime
import logging
import os
import time
import httpx

from app.models import EnvironmentContext, RouteCandidate, WMO_WEATHER_MAP

_ENVIRONMENT_CACHE: dict[tuple, tuple[float, EnvironmentContext]] = {}
_ENVIRONMENT_CACHE_TTL_SECONDS = 300
_ROUTE_ENVIRONMENT_CACHE: dict[tuple, tuple[float, tuple]] = {}


def _build_season_time_str(overrides: dict[str, str]) -> str:
    now = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=9)))
    m = now.month
    season = "冬" if m in (12, 1, 2) else "春" if m in (3, 4, 5) else "夏" if m in (6, 7, 8) else "秋"
    h = now.hour
    tod = "早朝" if 4 <= h < 7 else "午前" if 7 <= h < 12 else "午後・日中" if 12 <= h < 16 else "夕方" if 16 <= h < 19 else "夜間"
    base = f"{m}月（{season}）・{tod}（{now.strftime('%H:%M')}頃）"
    if "season" in overrides or "time_of_day" in overrides:
        extra = " / ".join(f"{k}: {v}" for k, v in overrides.items() if k in ("season", "time_of_day"))
        return f"{base} [指定: {extra}]"
    return base


async def fetch_environment(
    lat: float,
    lng: float,
    overrides: dict[str, str] | None,
    *,
    need_air: bool = False,
    need_pollen: bool = False,
    weather_context: EnvironmentContext | None = None,
) -> EnvironmentContext:
    ov = overrides or {}
    cache_key = (
        round(lat, 2), round(lng, 2), tuple(sorted((str(k), str(v)) for k, v in ov.items())),
        need_air, need_pollen,
        (weather_context.weather_source, weather_context.weather_condition, weather_context.temp_c,
         weather_context.precipitation_mm) if weather_context else None,
    )
    cached = _ENVIRONMENT_CACHE.get(cache_key)
    if cached and time.monotonic() - cached[0] < _ENVIRONMENT_CACHE_TTL_SECONDS:
        return cached[1].model_copy(deep=True)
    now_iso = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=9))).isoformat()
    season_time = _build_season_time_str(ov)

    w_override = ov.get("weather")
    base_data: dict = {}
    if weather_context:
        base_data = weather_context.model_dump(
            exclude={"air_quality_index", "air_quality_category", "pollen_index", "pollen_category", "environmental_source"}
        )
    elif w_override:
        presets = {
            "rain": ("本降りの雨", 15.0, 4.5),
            "heavy_rain": ("ゲリラ豪雨・強風", 14.0, 15.0),
            "hot": ("猛暑・強い日差し", 35.5, 0.0),
            "cold": ("底冷え・北風", 4.0, 0.0),
            "clear": ("快晴・快適", 21.0, 0.0),
        }
        cond, temp, precip = presets.get(w_override, (w_override, 18.0, 0.0))
        base_data = dict(
            timestamp_iso=now_iso,
            season_and_time=season_time,
            weather_condition=cond,
            temp_c=float(ov.get("temp_c", temp)),
            precipitation_mm=precip,
            weather_source="override",
            custom_overrides=ov,
        )
    else:
        maps_key = os.getenv("GOOGLE_MAPS_API_KEY")
        if maps_key:
            try:
                async with httpx.AsyncClient(timeout=4.0) as client:
                    res = await client.get(
                        "https://weather.googleapis.com/v1/currentConditions:lookup",
                        params={"key": maps_key, "location.latitude": lat, "location.longitude": lng, "languageCode": "ja"},
                    )
                    if res.status_code == 200:
                        data = res.json()
                        base_data = dict(
                            timestamp_iso=now_iso,
                            season_and_time=season_time,
                            weather_condition=data.get("weatherCondition", {}).get("description", {}).get("text", "晴れ"),
                            temp_c=float(ov.get("temp_c", data.get("temperature", {}).get("degrees", 20.0))),
                            precipitation_mm=data.get("precipitation", {}).get("qpf", {}).get("quantity", 0.0),
                            weather_source="google-weather-api",
                            custom_overrides=ov,
                        )
            except Exception:
                pass
        if not base_data:
            try:
                async with httpx.AsyncClient(timeout=3.0) as client:
                    res = await client.get(
                        "https://api.open-meteo.com/v1/forecast",
                        params={"latitude": lat, "longitude": lng, "current": "temperature_2m,precipitation,weather_code"},
                    )
                    res.raise_for_status()
                    curr = res.json().get("current", {})
                    code = curr.get("weather_code", 0)
                    base_data = dict(
                        timestamp_iso=now_iso,
                        season_and_time=season_time,
                        weather_condition=WMO_WEATHER_MAP.get(code, "不明"),
                        temp_c=float(ov.get("temp_c", curr.get("temperature_2m", 20.0))),
                        precipitation_mm=curr.get("precipitation", 0.0),
                        weather_source="open-meteo",
                        custom_overrides=ov,
                    )
            except Exception:
                base_data = dict(
                    timestamp_iso=now_iso,
                    season_and_time=season_time,
                    weather_condition="不明",
                    temp_c=20.0,
                    precipitation_mm=0.0,
                    weather_source="unavailable",
                    custom_overrides=ov,
                )

    aq_index = aq_category = pollen_index = pollen_category = None
    env_source = None
    key = os.getenv("GOOGLE_MAPS_API_KEY")
    if key and (need_air or need_pollen):
        async with httpx.AsyncClient(timeout=4.0) as client:
            async def get_air():
                if not need_air:
                    return None
                try:
                    return await client.post(
                        "https://airquality.googleapis.com/v1/currentConditions:lookup",
                        params={"key": key},
                        json={"location": {"latitude": lat, "longitude": lng}, "universalAqi": True, "languageCode": "ja"},
                    )
                except Exception as exc:
                    logging.getLogger("uvicorn.error").warning("Air Quality lookup failed: %s", type(exc).__name__)
                    return None

            async def get_pollen():
                if not need_pollen:
                    return None
                try:
                    return await client.get(
                        "https://pollen.googleapis.com/v1/forecast:lookup",
                        params={"key": key, "location.latitude": lat, "location.longitude": lng, "days": 1, "languageCode": "ja"},
                    )
                except Exception as exc:
                    logging.getLogger("uvicorn.error").warning("Pollen lookup failed: %s", type(exc).__name__)
                    return None

            ar, pr = await asyncio.gather(get_air(), get_pollen())
            if ar is not None:
                if ar.status_code == 200:
                    indexes = ar.json().get("indexes", [])
                    aqi = next((x for x in indexes if x.get("code") == "uaqi"), {})
                    aq_index = aqi.get("aqi")
                    aq_category = aqi.get("category")
                    env_source = "Google Air Quality API"
                else:
                    logging.getLogger("uvicorn.error").warning("Air Quality lookup returned HTTP %s: %s", ar.status_code, ar.text[:300])
            if pr is not None:
                if pr.status_code == 200:
                    types = pr.json().get("dailyInfo", [{}])[0].get("pollenTypeInfo", [])
                    vals = [x.get("indexInfo", {}).get("value") for x in types if x.get("indexInfo", {}).get("value") is not None]
                    pollen_index = max(vals) if vals else None
                    pollen_category = "高" if pollen_index is not None and pollen_index >= 4 else "中" if pollen_index is not None and pollen_index >= 2 else "低" if pollen_index is not None else None
                    env_source = (env_source + " / " if env_source else "") + "Google Pollen API"
                    if not vals:
                        logging.getLogger("uvicorn.error").info("Pollen forecast returned no numeric UPI for this location/date")
                else:
                    logging.getLogger("uvicorn.error").warning("Pollen lookup returned HTTP %s: %s", pr.status_code, pr.text[:300])
    result = EnvironmentContext(
        **base_data,
        air_quality_index=aq_index,
        air_quality_category=aq_category,
        pollen_index=pollen_index,
        pollen_category=pollen_category,
        environmental_source=env_source,
    )
    _ENVIRONMENT_CACHE[cache_key] = (time.monotonic(), result.model_copy(deep=True))
    # Keep the cache bounded during long-running Cloud Run instances.
    if len(_ENVIRONMENT_CACHE) > 256:
        oldest = sorted(_ENVIRONMENT_CACHE.items(), key=lambda item: item[1][0])[:64]
        for key_to_remove, _ in oldest:
            _ENVIRONMENT_CACHE.pop(key_to_remove, None)
    return result


async def fetch_route_environment(
    routes: list[RouteCandidate], *, need_air: bool = False, need_pollen: bool = False,
    origin_environment: EnvironmentContext | None = None, origin_lat: float | None = None,
    origin_lng: float | None = None,
) -> None:
    """Fetch requested air/pollen data near each candidate's midpoint; attach it to route metrics."""
    key = os.getenv("GOOGLE_MAPS_API_KEY")
    if not key or not (need_air or need_pollen):
        return
    points: dict[tuple[float, float], list[RouteCandidate]] = {}
    for route in routes:
        path = route.metrics.path
        if not path:
            continue
        from app.services.maps import _sample_path_by_fraction
        point = _sample_path_by_fraction(path, (0.5,))[0]
        # Nearby route midpoints generally share the provider's forecast cell.
        bucket = (round(point.lat, 2), round(point.lng, 2))
        points.setdefault(bucket, []).append(route)
    now_monotonic = time.monotonic()
    for bucket in list(points):
        cache_key = (bucket, need_air, need_pollen)
        cached = _ROUTE_ENVIRONMENT_CACHE.get(cache_key)
        if cached and now_monotonic - cached[0] < _ENVIRONMENT_CACHE_TTL_SECONDS:
            aq_index, aq_category, pollen_index, pollen_category = cached[1]
            for route in points.pop(bucket):
                route.metrics.air_quality_index = aq_index
                route.metrics.air_quality_category = aq_category
                route.metrics.pollen_index = pollen_index
                route.metrics.pollen_category = pollen_category
    if not points:
        return
    async with httpx.AsyncClient(timeout=5.0, limits=httpx.Limits(max_connections=12)) as client:
        async def lookup(bucket: tuple[float, float]):
            lat, lng = bucket
            async def air():
                if not need_air:
                    return None, None
                try:
                    response = await client.post(
                        "https://airquality.googleapis.com/v1/currentConditions:lookup", params={"key": key},
                        json={"location": {"latitude": lat, "longitude": lng}, "universalAqi": True, "languageCode": "ja"},
                    )
                    if response.status_code != 200:
                        return None, None
                    indexes = response.json().get("indexes", [])
                    item = next((x for x in indexes if x.get("code") == "uaqi"), {})
                    return item.get("aqi"), item.get("category")
                except Exception as exc:
                    logging.getLogger("uvicorn.error").warning("Route Air Quality lookup failed: %s", type(exc).__name__)
                    return None, None
            async def pollen():
                if not need_pollen:
                    return None, None
                try:
                    response = await client.get(
                        "https://pollen.googleapis.com/v1/forecast:lookup",
                        params={"key": key, "location.latitude": lat, "location.longitude": lng, "days": 1, "languageCode": "ja"},
                    )
                    if response.status_code != 200:
                        return None, None
                    groups = response.json().get("dailyInfo", [{}])[0].get("pollenTypeInfo", [])
                    values = [item.get("indexInfo", {}).get("value") for item in groups if item.get("indexInfo", {}).get("value") is not None]
                    index = max(values) if values else None
                    category = "高" if index is not None and index >= 4 else "中" if index is not None and index >= 2 else "低" if index is not None else None
                    return index, category
                except Exception as exc:
                    logging.getLogger("uvicorn.error").warning("Route Pollen lookup failed: %s", type(exc).__name__)
                    return None, None
            return await asyncio.gather(air(), pollen())
        results = await asyncio.gather(*(lookup(bucket) for bucket in points))
    for bucket, result in zip(points, results):
        air_result, pollen_result = result
        values = (air_result[0], air_result[1], pollen_result[0], pollen_result[1])
        _ROUTE_ENVIRONMENT_CACHE[(bucket, need_air, need_pollen)] = (time.monotonic(), values)
        for route in points[bucket]:
            route.metrics.air_quality_index, route.metrics.air_quality_category = air_result
            route.metrics.pollen_index, route.metrics.pollen_category = pollen_result
    if len(_ROUTE_ENVIRONMENT_CACHE) > 256:
        oldest = sorted(_ROUTE_ENVIRONMENT_CACHE.items(), key=lambda item: item[1][0])[:64]
        for key_to_remove, _ in oldest:
            _ROUTE_ENVIRONMENT_CACHE.pop(key_to_remove, None)
