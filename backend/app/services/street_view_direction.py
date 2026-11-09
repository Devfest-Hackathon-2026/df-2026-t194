"""Match camera positions to route progress and look forward along the travelled path."""
import math
from app.models import LatLng


def route_position(path: list[LatLng], point: LatLng, hint: float = 0.5) -> tuple[float, float]:
    if len(path) < 2:
        return 0.0, float('inf')
    origin=path[0]
    cosine=math.cos(math.radians(origin.lat))
    def xy(p):
        return (p.lng-origin.lng)*111320*cosine,(p.lat-origin.lat)*110540
    vertices=[xy(p) for p in path]
    lengths=[math.hypot(b[0]-a[0],b[1]-a[1]) for a,b in zip(vertices,vertices[1:])]
    total=sum(lengths)
    if total < 1:
        return 0.0,float('inf')
    px,py=xy(point)
    best_distance,best_progress=float('inf'),0.0
    travelled=0.0
    for (ax,ay),(bx,by),length in zip(vertices,vertices[1:],lengths):
        dx,dy=bx-ax,by-ay
        t=max(0,min(1,((px-ax)*dx+(py-ay)*dy)/(length*length))) if length else 0
        distance=math.hypot(px-ax-t*dx,py-ay-t*dy)
        progress=(travelled+t*length)/total
        if distance < best_distance-0.5 or (abs(distance-best_distance)<=0.5 and abs(progress-hint)<abs(best_progress-hint)):
            best_distance,best_progress=distance,progress
        travelled+=length
    return best_progress,best_distance


def forward_heading(path: list[LatLng], fraction: float) -> float | None:
    # Import here to keep maps.py free to use this helper without a module cycle.
    from app.services.maps import _sample_path_by_fraction, _haversine_km
    distance=sum(_haversine_km(a.lat,a.lng,b.lat,b.lng)*1000 for a,b in zip(path,path[1:]))
    if distance < 1:
        return None
    start=min(1,max(0,fraction))
    end=min(1,start+15/distance)
    if (end-start)*distance < 1:
        start=max(0,end-15/distance)
    a,b=_sample_path_by_fraction(path,(start,end))
    lat1,lat2=math.radians(a.lat),math.radians(b.lat)
    delta=math.radians(b.lng-a.lng)
    y=math.sin(delta)*math.cos(lat2)
    x=math.cos(lat1)*math.sin(lat2)-math.sin(lat1)*math.cos(lat2)*math.cos(delta)
    if abs(x)+abs(y)<1e-12:
        return None
    return round((math.degrees(math.atan2(y,x))+360)%360,1)
