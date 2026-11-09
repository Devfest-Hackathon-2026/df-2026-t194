"""Route all photo coordinates in order, batching within Routes API waypoint limits."""
import asyncio
from app.models import LatLng, PlaceStop, RouteMetrics
from app.services.maps import _fetch_walk_metrics, _haversine_km


from app.services.polyline import encode_path


async def photo_walk_metrics(client, stops: list[PlaceStop], api_key: str, language: str) -> RouteMetrics | None:
    # 25 intermediates + two endpoints, sharing the last endpoint across batches.
    chunks = [stops[i:i + 27] for i in range(0, len(stops) - 1, 26)]
    semaphore = asyncio.Semaphore(3)
    async def fetch(chunk):
        async with semaphore:
            return await _fetch_walk_metrics(client, chunk, api_key, language, measure_elevation=False, high_quality=True)
    segments = await asyncio.gather(*(fetch(chunk) for chunk in chunks))
    if any(segment is None or len(segment.path) < 2 or not segment.encoded_polyline for segment in segments):
        return None
    path = []
    for segment in segments:
        if path and _haversine_km(path[-1].lat, path[-1].lng, segment.path[0].lat, segment.path[0].lng) > 0.001:
            return None  # Never hide a disconnected route with a straight line.
        path.extend(segment.path[1:] if path and path[-1] == segment.path[0] else segment.path)
    return RouteMetrics(distance_meters=sum(s.distance_meters for s in segments),
        duration_seconds=sum(s.duration_seconds for s in segments),
        encoded_polyline=encode_path(path), path=path)
