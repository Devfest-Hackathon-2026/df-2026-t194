"""Bounded route repair around a measured steep segment, preserving explicit stops."""
import asyncio
import math
import httpx
from app.models import LatLng, PlaceStop, RouteCandidate
from app.services.constraints import slope_verified_below
from app.services.maps import _fetch_walk_metrics, _sample_path_by_fraction, _haversine_km, _assess_street_view, _solar_shade_percent, _measure_elevation_for_metrics, MAX_WALK_ROUTE_DISTANCE_METERS


def bypass_plans(route: RouteCandidate):
    m = route.metrics
    profile = m.elevation_profile_meters
    if len(profile) < 2 or len(m.path) < 2 or len(route.waypoints) < 2:
        return []
    segment = max(range(len(profile)-1), key=lambda i: abs(profile[i+1]-profile[i]))
    fraction = (segment + 0.5)/(len(profile)-1)
    margin = max(0.02, min(0.15, 80/max(m.distance_meters, 1)))
    before, center, after = _sample_path_by_fraction(m.path, (max(0,fraction-margin), fraction, min(1,fraction+margin)))
    cosine = max(math.cos(math.radians(center.lat)), 0.01)
    dx,dy = (after.lng-before.lng)*111320*cosine, (after.lat-before.lat)*110540
    length = math.hypot(dx,dy)
    if length < 1:
        return []
    # Find which pair of the existing stops contains the steep section.
    cumulative = [0.0]
    for a,b in zip(m.path,m.path[1:]):
        cumulative.append(cumulative[-1]+_haversine_km(a.lat,a.lng,b.lat,b.lng))
    insert = len(route.waypoints)-1
    for i, stop in enumerate(route.waypoints[1:],1):
        nearest = min(range(len(m.path)), key=lambda j: _haversine_km(stop.lat,stop.lng,m.path[j].lat,m.path[j].lng))
        if cumulative[nearest]/max(cumulative[-1],0.000001) >= fraction:
            insert=i;break
    result=[]
    for offset in (150,400,900):
        for sign in (-1,1):
            anchors=[]
            for index, point in enumerate((before,after)):
                anchors.append(PlaceStop(name=f'坂を迂回する探索点{index+1}',
                    lat=point.lat+(dx/length)*offset*sign/110540,
                    lng=point.lng-(dy/length)*offset*sign/(111320*cosine),reason='経路候補の内部探索点',tags=[]))
            stops=route.waypoints[:insert]+anchors+route.waypoints[insert:]
            if len(stops)<=27:
                result.append(stops)
    return result


async def recover_slope_routes(candidates: list[RouteCandidate], api_key: str, language: str,
                               limit: float, analyze_images: bool = True, analyze_shade: bool = False, requested_visual_target: str | None = None) -> list[RouteCandidate]:
    if any(slope_verified_below(route,limit) for route in candidates):
        return candidates
    measured=[route for route in candidates if len(route.metrics.elevation_profile_meters)>=2]
    if not measured:
        return candidates  # An unavailable elevation service cannot be repaired by more Routes calls.
    base=min(measured,key=lambda r:max(r.metrics.max_sampled_uphill_grade_percent,r.metrics.max_sampled_downhill_grade_percent))
    plans=bypass_plans(base)
    known={route.metrics.encoded_polyline for route in candidates if route.metrics.encoded_polyline}
    accepted=[]
    evaluated=[]
    # Up to six route/elevation requests, two at a time. Stop once a valid bypass is found.
    async with httpx.AsyncClient(timeout=25.0) as client:
        async def attempt(index,stops):
            metrics=await _fetch_walk_metrics(client,stops,api_key,language,measure_elevation=False,high_quality=True)
            if metrics is None or not metrics.encoded_polyline or not metrics.path or metrics.distance_meters<=0 or metrics.distance_meters > MAX_WALK_ROUTE_DISTANCE_METERS:
                return None
            if metrics.encoded_polyline in known:
                return None
            known.add(metrics.encoded_polyline)
            await _measure_elevation_for_metrics(client,metrics,api_key)
            route=base.model_copy(deep=True,update={
                'route_id':f'slope_bypass_{index+1}', 'title':'坂を避ける迂回候補',
                'concept':'観測勾配の上限を満たす迂回候補を追加探索しました。',
                'tags':['坂回避候補'], 'metrics':metrics, 'safety_note':None, 'fatigue_note':None,
                'seasonal_weather_note':None, 'street_view_assessment':[], 'street_view_images':[],
                'street_view_observations':[], 'solar_shade_percent':None})
            evaluated.append(route)
            # Keep the actual route's explicit waypoints; internal anchors are not user stops.
            return route if slope_verified_below(route,limit) else None
        for start in range(0,len(plans),2):
            batch=await asyncio.gather(*(attempt(i,plans[i]) for i in range(start,min(start+2,len(plans)))))
            accepted.extend(route for route in batch if route is not None)
            if accepted:
                break
        async def enrich(route):
            visual,shade=await asyncio.gather(
                _assess_street_view(client,route.metrics.path,api_key,language,requested_visual_target) if analyze_images else asyncio.sleep(0,result=([],[],[])),
                _solar_shade_percent(client,route.metrics.path,api_key) if analyze_shade else asyncio.sleep(0,result=None))
            route.street_view_assessment,route.street_view_images,route.street_view_observations=visual
            route.solar_shade_percent=shade
        await asyncio.gather(*(enrich(route) for route in accepted))
    return candidates+evaluated


def corridor_plans(route: RouteCandidate):
    """Explore a broad parallel corridor, instead of only circling the worst point."""
    if len(route.metrics.path)<2 or len(route.waypoints)<2:
        return []
    before,center,after=_sample_path_by_fraction(route.metrics.path,(0.2,0.5,0.8))
    cosine=max(math.cos(math.radians(center.lat)),0.01)
    dx,dy=(after.lng-before.lng)*111320*cosine,(after.lat-before.lat)*110540
    length=math.hypot(dx,dy)
    if length<1:
        return []
    plans=[]
    for offset in (900,1800):
        for sign in (-1,1):
            anchors=[PlaceStop(name='迂回経路の内部探索点',lat=p.lat+dx/length*offset*sign/110540,
                lng=p.lng-dy/length*offset*sign/(111320*cosine),reason='広域の別経路を比較',tags=[]) for p in (before,after)]
            # Keep every explicit waypoint. Corridor entry is before, exit after the existing middle stops.
            stops=[route.waypoints[0],anchors[0],*route.waypoints[1:-1],anchors[1],route.waypoints[-1]]
            if len(stops)<=27:
                plans.append(stops)
    return plans


async def explore_slope_options(candidates: list[RouteCandidate],api_key: str,language: str,
                                analyze_images: bool=True,analyze_shade: bool=False,
                                requested_visual_target: str | None=None) -> list[RouteCandidate]:
    from app.services.slope_options import measured,select_slope_options,slope_cost
    from app.services.ranking import _route_self_overlap_percent
    if not candidates:
        return []
    for route in candidates:
        route.metrics.self_overlap_percent=_route_self_overlap_percent(route)
        slope_cost(route)
    base=min(candidates,key=lambda r:r.metrics.duration_seconds)
    pool=list(candidates)
    needs_search=measured(base) and max(base.metrics.max_sampled_uphill_grade_percent,base.metrics.max_sampled_downhill_grade_percent)>4
    known={r.metrics.encoded_polyline for r in pool if r.metrics.encoded_polyline}
    plans=bypass_plans(base)+corridor_plans(base) if needs_search else []
    async with httpx.AsyncClient(timeout=25) as client:
        async def attempt(index,stops):
            m=await _fetch_walk_metrics(client,stops,api_key,language,measure_elevation=False,high_quality=True)
            if m is None or not m.encoded_polyline or m.distance_meters<=0 or m.distance_meters>MAX_WALK_ROUTE_DISTANCE_METERS or m.encoded_polyline in known:
                return None
            known.add(m.encoded_polyline)
            await _measure_elevation_for_metrics(client,m,api_key)
            result=base.model_copy(deep=True,update={'route_id':f'slope_option_{index+1}','metrics':m,
                'street_view_assessment':[],'street_view_images':[],'street_view_observations':[],
                'solar_shade_percent':None,'safety_note':None,'fatigue_note':None,'seasonal_weather_note':None})
            result.metrics.self_overlap_percent=_route_self_overlap_percent(result)
            slope_cost(result)
            return result
        for start in range(0,len(plans),2):
            # Stop once a genuinely gentler option with moderate extra time exists.
            shortlisted=select_slope_options(pool,language)
            if any(r.selection_role=='balanced' and max(r.metrics.max_sampled_uphill_grade_percent,r.metrics.max_sampled_downhill_grade_percent)<=4 for r in shortlisted):
                break
            found=await asyncio.gather(*(attempt(i,plans[i]) for i in range(start,min(start+2,len(plans)))))
            pool.extend(r for r in found if r is not None)
        selected=select_slope_options(pool,language)
        async def enrich(route):
            visual,shade=await asyncio.gather(
                _assess_street_view(client,route.metrics.path,api_key,language,requested_visual_target) if analyze_images else asyncio.sleep(0,result=([],[],[])),
                _solar_shade_percent(client,route.metrics.path,api_key) if analyze_shade else asyncio.sleep(0,result=None))
            route.street_view_assessment,route.street_view_images,route.street_view_observations=visual
            route.solar_shade_percent=shade
        await asyncio.gather(*(enrich(route) for route in selected))
    return selected
