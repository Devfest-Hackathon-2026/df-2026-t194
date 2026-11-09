"""Find optional facilities near the forward walking corridor, using provider facts."""
import asyncio
import math
from app.models import PlaceStop, PlannedRouteOption
from app.services.facility_preferences import FACILITIES, verified_facility


async def facility_plans(client, origin, destination, api_key, preferences, plans, language):
    from app.services.maps import _haversine_km
    if not preferences or any(s._coordinates_confirmed for p in plans for s in p.suggested_stops):
        return plans
    direct = _haversine_km(origin.lat,origin.lng,destination.lat,destination.lng)
    if direct < 0.1:
        return plans
    lat,lng = (origin.lat+destination.lat)/2,(origin.lng+destination.lng)/2
    dx=(destination.lng-origin.lng)*math.cos(math.radians(lat))
    dy=destination.lat-origin.lat
    async def search(kind):
        spec=FACILITIES[kind]
        body={'textQuery':spec['query'],'languageCode':language,'maxResultCount':10,
              'locationBias':{'circle':{'center':{'latitude':lat,'longitude':lng},'radius':min(5000,max(1000,direct*700))}}}
        if spec['type']:
            body.update(includedType=spec['type'],strictTypeFiltering=True)
        try:
            response=await client.post('https://places.googleapis.com/v1/places:searchText',json=body,
                headers={'X-Goog-Api-Key':api_key,'X-Goog-FieldMask':'places.id,places.displayName,places.location,places.types,places.currentOpeningHours.openNow'+(',places.restroom' if 'toilet' in preferences else '')})
            places=response.json().get('places',[]) if response.status_code==200 else []
        except Exception:
            return []
        found=[]
        for p in places:
            loc=p.get('location',{});plat,plng=loc.get('latitude'),loc.get('longitude')
            if plat is None or plng is None or p.get('currentOpeningHours',{}).get('openNow') is False:
                continue
            t=((plng-origin.lng)*math.cos(math.radians(lat))*dx+(plat-origin.lat)*dy)/(dx*dx+dy*dy)
            extra=_haversine_km(origin.lat,origin.lng,plat,plng)+_haversine_km(plat,plng,destination.lat,destination.lng)-direct
            if not -0.03<=t<=1.03 or extra>max(1.5 if kind=='supermarket' else 0.5,direct*(0.8 if kind=='supermarket' else 0.35)):
                continue
            types=p.get('types',[]);restroom=p.get('restroom')
            if 'public_bathroom' in types:restroom=True
            stop=PlaceStop(name=p.get('displayName',{}).get('text','施設'),lat=plat,lng=plng,
                reason='Placesで位置・施設情報を確認',place_id=p.get('id'),place_verified=True,place_types=types,
                open_now=p.get('currentOpeningHours',{}).get('openNow'),restroom=restroom,
                tags=([spec['label']] if kind!='toilet' else [])+(['トイレあり'] if restroom else []),purpose='experience')
            if not verified_facility(stop,kind):continue
            stop._provider_resolved=True
            found.append((extra,stop))
        return [stop for _,stop in sorted(found,key=lambda pair:pair[0])]
    kinds=list(preferences)
    results=dict(zip(kinds,await asyncio.gather(*(search(kind) for kind in kinds))))
    toilets=results.get('toilet',[])
    options=[]
    for index in range(max(1,len(plans)-1)):
        stops=[]
        for kind in kinds:
            if kind!='toilet' and results[kind]:
                choices=results[kind]
                stops.append(choices[index%len(choices)].model_copy(deep=True))
        if 'toilet' in preferences and not any(s.restroom is True for s in stops) and toilets:
            stops.append(toilets[index%len(toilets)].model_copy(deep=True))
        if not stops:continue
        stops.sort(key=lambda s:(s.lat-origin.lat)*dy+(s.lng-origin.lng)*math.cos(math.radians(lat))*dx)
        options.append(PlannedRouteOption(route_id=f'facility_{index}',title='施設経由',concept='進行方向の施設を経由',suggested_stops=stops))
    # Keep the direct route as an explicitly less-fulfilling comparison, never invent a facility.
    return options+[PlannedRouteOption(route_id='facility_direct',title='直行比較',concept='',suggested_stops=[])]
