"""Explicit user constraints are feasibility checks, not weighted preferences."""
import math
import re
import unicodedata
from app.models import RouteRequest, RouteCandidate



def strict_slope_limit(req: RouteRequest) -> float | None:
    current = unicodedata.normalize('NFKC', req.prompt).lower()
    if re.search(r'坂.{0,10}(気にしない|避けなくて|許容|構わない|必須ではない|必須じゃない|緩め)|hills? (are|is) ok', current):
        return None
    # Only an explicit numerical ceiling is an exclusion rule. Qualitative hill
    # avoidance is presented as balanced / gentle / shortest tradeoffs.
    text = unicodedata.normalize('NFKC', f'{req.previous_user_prompt or ""}\n{req.prompt}').lower()
    limits=list(re.finditer(r'(?:勾配|傾斜|grade)\s*(\d+(?:\.\d+)?)\s*%\s*(?:未満|以下|まで|or less)',text))
    if limits:
        value=float(limits[-1].group(1))
        return value if 0<value<=20 else None
    return None


def slope_verified_below(route: RouteCandidate, limit: float) -> bool:
    m = route.metrics
    profile = m.elevation_profile_meters
    return (len(profile) >= 2 and all(math.isfinite(value) for value in profile)
            and math.isfinite(m.max_sampled_uphill_grade_percent)
            and math.isfinite(m.max_sampled_downhill_grade_percent)
            and 0 <= m.max_sampled_uphill_grade_percent < limit
            and 0 <= m.max_sampled_downhill_grade_percent < limit)


def slope_constraint_message(language: str, limit: float, measured: bool = True, closest_grade: float | None = None) -> str:
    if not measured:
        if language == 'en':
            return 'Elevation data could not be verified for any candidate, so strict hill avoidance cannot be checked. This is a measurement failure, not evidence that all routes are steep. Retry after checking elevation data access.'
        if language == 'zh':
            return '所有候选均未能确认高程，无法判断是否符合严格避坡条件。这是测量数据缺失，不代表所有路线都有陡坡。请确认高程数据访问后重试。'
        return '候補の標高データを取得できず、「坂を必ず避ける」を判定できませんでした。坂が多いからではなく、計測データ不足による停止です。標高データの取得状態を確認して再試行してください。'
    closest = f" The lowest observed maximum grade among the checked candidates was {closest_grade:g}%." if closest_grade is not None else ""
    if language == 'en':
        return f'No candidate met strict hill avoidance: all had sampled grades of {limit:g}% or more, or unverified elevation. No matching route was found among the candidates checked.{closest} Change the endpoints or explicitly relax hill avoidance to retry.'
    if language == 'zh':
        detail = f'已检查候选中最低的观测最大坡度为{closest_grade:g}%。' if closest_grade is not None else ''
        return f'未找到符合严格避坡要求的候选：检测坡度均达到{limit:g}%或以上，或未能确认高程。{detail}这并不代表不存在其他路线。请更改起终点或明确放宽避坡要求后重试。'
    detail = f'確認した候補で最も勾配が小さい案でも、最大約{closest_grade:g}%が観測されました。' if closest_grade is not None else ''
    return f'「坂を必ず避ける」に適合する候補が見つかりませんでした。今回の判定は観測勾配{limit:g}%未満ですが、候補にはそれ以上の坂があるか、標高を確認できていません。{detail}回避経路が存在しないという意味ではありません。出発地・目的地を変えるか、坂回避の条件を明示的に緩めて再検索してください。'
