"""Choose distinct hill/time tradeoffs, rather than inventing a universal grade ceiling."""
import math
import re
from app.models import RouteCandidate, RouteRequest


def slope_comparison_requested(req: RouteRequest) -> bool:
    current=req.prompt.lower()
    if re.search(r'坂.{0,10}(気にしない|避けなくて|許容|構わない)|hills? (are|is) ok',current):
        return False
    text=f'{req.previous_user_prompt or ""} {req.prompt}'.lower()
    return bool(re.search(r'坂|勾配|平坦|フラット|足.{0,8}(痛|疲|負担)|hill|slope|flat|坡',text))


def measured(route: RouteCandidate) -> bool:
    m=route.metrics
    return len(m.elevation_profile_meters)>=2 and all(math.isfinite(v) for v in m.elevation_profile_meters) and all(
        math.isfinite(v) for v in (m.max_sampled_uphill_grade_percent,m.max_sampled_downhill_grade_percent))


def slope_cost(route: RouteCandidate) -> float:
    m=route.metrics
    if not measured(route):
        return float('inf')
    spacing=m.distance_meters/(len(m.elevation_profile_meters)-1)
    grades=[abs(b-a)/max(spacing,1)*100 for a,b in zip(m.elevation_profile_meters,m.elevation_profile_meters[1:])]
    steep=sum(spacing for grade in grades if grade>=6)
    peak=max(m.max_sampled_uphill_grade_percent,m.max_sampled_downhill_grade_percent)
    # 6% marks a comparison band, not eligibility or a promise of accessibility.
    load=m.elevation_gain_meters+0.65*m.elevation_loss_meters+steep*0.18+max(0,peak-4)**2*8+3*(m.self_overlap_percent or 0)
    m.steep_distance_meters=round(steep,1)
    m.slope_load=round(load,2)
    return load


def materially_improves(route: RouteCandidate, base: RouteCandidate) -> bool:
    if not measured(route) or not measured(base):
        return False
    cost,original=slope_cost(route),slope_cost(base)
    peak=lambda r:max(r.metrics.max_sampled_uphill_grade_percent,r.metrics.max_sampled_downhill_grade_percent)
    return cost<original*0.9 or (peak(route)<=peak(base)-1 and cost<=original*1.1)


def select_slope_options(routes: list[RouteCandidate], language: str='ja') -> list[RouteCandidate]:
    if not routes:
        return []
    for route in routes:
        route.selection_role=None
        slope_cost(route)
    shortest=min(routes,key=lambda r:(r.metrics.duration_seconds,r.metrics.distance_meters))
    duration=max(shortest.metrics.duration_seconds,1)
    # A balanced option may add 10–20 minutes, scaled to the original walk.
    budget=max(600,min(1200,duration*0.35))
    improved=[r for r in routes if r is not shortest and materially_improves(r,shortest)]
    balanced_pool=[r for r in improved if r.metrics.duration_seconds<=duration+budget]
    def balance_cost(route):
        return slope_cost(route)/max(slope_cost(shortest),1)+1.2*max(0,route.metrics.duration_seconds-duration)/duration+0.015*(route.metrics.self_overlap_percent or 0)
    balanced=min(balanced_pool,key=balance_cost) if balanced_pool else None
    gentle_pool=improved if measured(shortest) else [r for r in routes if measured(r) and r is not shortest]
    gentle=min(gentle_pool,key=lambda r:(max(0,max(r.metrics.max_sampled_uphill_grade_percent,r.metrics.max_sampled_downhill_grade_percent)-4),slope_cost(r),r.metrics.duration_seconds)) if gentle_pool else None
    if balanced is not None and gentle is not None and gentle is not balanced and not materially_improves(gentle,balanced):
        gentle=None  # A marginally different detour is not a separate gentle option.
    options=[('balanced',balanced),('gentle',gentle),('shortest',shortest)]
    chosen=[r for _,r in options if r is not None]
    if len({id(r) for r in chosen})<3 and measured(shortest):
        from app.services.maps import _route_overlap_fraction
        candidates=[]
        for route in routes:
            if any(route is existing for existing in chosen) or not measured(route):
                continue
            m=route.metrics
            if not m.path or not shortest.metrics.path or m.encoded_polyline == shortest.metrics.encoded_polyline:
                continue
            if m.duration_seconds>duration+max(1800,duration*.75) or (m.self_overlap_percent or 0)>12:
                continue
            overlaps=[_route_overlap_fraction(m,other.metrics,threshold_m=12) for other in chosen]
            if overlaps and max(overlaps)<.8:
                candidates.append((max(overlaps)+.25*max(0,m.duration_seconds-duration)/duration+.1*slope_cost(route)/max(slope_cost(shortest),1),route))
        alternative=min(candidates,key=lambda pair:pair[0])[1] if candidates else None
        if alternative is not None:
            # With no measured improvement, retain the standard as candidate 1 and the distinct route as 2.
            options = ([('balanced',balanced),('gentle',gentle),('alternative',alternative),('shortest',shortest)]
                       if balanced is not None or gentle is not None else [('shortest',shortest),('alternative',alternative)])
    result=[]
    for role,route in options:
        if route is None or any(route is existing for existing in result):
            continue
        route.selection_role=role
        route.metrics.extra_duration_seconds=max(0,route.metrics.duration_seconds-duration)
        titles={'ja':{'balanced':'急坂と遠回りを抑える案','gentle':'遠回りして坂の負担を抑える案','shortest':'最短時間の比較案','alternative':'別経路の比較案（坂の改善は未確認）'},
                'en':{'balanced':'Balance hills and walking time','gentle':'Prioritize gentler slopes','shortest':'Quickest comparison route','alternative':'Different route; hill improvement unverified'},
                'zh':{'balanced':'兼顾坡度与绕行时间','gentle':'优先减轻坡道负担','shortest':'最短用时对比路线','alternative':'其他路线（坡度改善未确认）'}}
        route.title=titles.get(language,titles['ja'])[role]
        m=route.metrics
        if language=='ja':
            grade=f'観測最大上り{m.max_sampled_uphill_grade_percent:.1f}%・下り{m.max_sampled_downhill_grade_percent:.1f}%' if measured(route) else '勾配未確認'
            route.concept=f'{route.title}。約{round(m.duration_seconds/60)}分、最短候補より約{round(m.extra_duration_seconds/60)}分追加。{grade}。勾配は標高サンプルからの推定です。'
            if role=='alternative':
                route.concept+='経路は異なりますが、坂が少ないと確認できた案ではありません。標準案と比べて選ぶための候補です。'
            if role=='gentle' and measured(route) and max(m.max_sampled_uphill_grade_percent,m.max_sampled_downhill_grade_percent)>4:
                route.concept+='全区間が4%以下になる経路は、この候補では確認できていません。'
        result.append(route)
    return result
