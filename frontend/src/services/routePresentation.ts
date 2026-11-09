import type { ComputedRoute } from '@/types/route';
import type { AppLanguage } from '@/components/hud/hudTypes';

// Narrate observable differences and tradeoffs, without claiming unverified facilities.
export function presentRoute(route: ComputedRoute, peers: ComputedRoute[], prompt: string, language: AppLanguage): ComputedRoute {
  const api = route.apiData;
  if (!api || peers.length === 0) return route;
  const m = api.metrics, observations = api.street_view_observations ?? [];
  const fastest = Math.min(...peers.map(p => p.apiData?.metrics.duration_seconds ?? Infinity));
  const extra = Math.max(0, Math.round((m.extra_duration_seconds ?? (m.duration_seconds-fastest))/60));
  const sidewalks = observations.filter(o => o.sidewalk === 'visible' && o.confidence >= 0.35).length;
  const wide = observations.filter(o => o.road_width === 'wide' && o.confidence >= 0.35).length;
  const narrow = observations.filter(o => o.road_width === 'narrow' && o.confidence >= 0.35).length;
  const sea = observations.filter(o => o.requested_feature_visibility === 'visible' && o.confidence >= 0.35).length;
  const overlap = m.self_overlap_percent ?? 0;
  const stops = api.waypoints.slice(1, -1).map(p => p.name);
  const pick = (ja: string, en: string, zh: string) => language === 'en' ? en : language === 'zh' ? zh : ja;
  const notices: Record<string, string> = {
    rain_shelter: pick('連続した雨よけ・地下道の経路検索は未対応です。この希望を満たした案ではありません。', 'Continuous rain shelter and underground routing are unsupported; this option does not establish that preference.', '暂不支持连续避雨或地下路线，不能认为本方案满足此要求。'),
    continuous_scenery: pick('景観が続く距離の最大化は未対応です。代表地点での景観を比較しています。', 'Maximizing continuous scenic distance is unsupported; scenery is compared at sampled locations.', '暂不支持最大化连续观景距离，仅比较抽样地点的景观。'),
    current_shade: pick('上空の覆いを日陰のなりやすさとして比較します。現在の日陰・連続性は未確認です。', 'Overhead cover is a proxy for potential shade; current shade and continuity are unverified.', '以头顶遮蔽物比较潜在阴凉，当前阴影及连续性尚未确认。'),
    air_quality: pick('空気質は候補差がないかデータ不足のため、順位に反映していません。', 'Air quality does not distinguish these options or data is incomplete; it did not affect ranking.', '空气质量无候选差异或数据不足，未计入排名。'),
    pollen: pick('花粉は候補差がないかデータ不足のため、順位に反映していません。', 'Pollen does not distinguish these options or data is incomplete; it did not affect ranking.', '花粉无候选差异或数据不足，未计入排名。'),
    toilet: pick('利用できるトイレ設備を確認した経由地はありません。', 'No stop has verified, potentially available restroom facilities.', '没有已确认可用厕所设施的途经地点。'),
    cafe: pick('カフェとAPIで確認できた経由地はありません。', 'No cafe stop was verified by the place provider.', '没有经地点API确认的咖啡店途经点。'),
    supermarket: pick('営業中のスーパーを経由する希望は未確認・未達です。', 'A stop at an open supermarket is unverified or unmet.', '尚未确认或未能途经营业中的超市。'),
    cafe_closed: pick('経由カフェは現在営業時間外です。', 'The cafe stop is currently closed.', '途经咖啡店当前未营业。'),
    continuous_accessibility: pick('全区間の段差・階段・通行可能性は確認できていません。', 'Steps, stairs, and accessibility along the entire route are unverified.', '全程台阶、楼梯及无障碍通行情况尚未确认。'),
  };
  const details: string[] = (m.unverified_preferences ?? []).map(code => notices[code]).filter(Boolean);
  const first = api.waypoints[0], last = api.waypoints[api.waypoints.length-1];
  const isLoop = !!first && !!last && Math.abs(first.lat-last.lat) < 0.00001 && Math.abs(first.lng-last.lng) < 0.00001;
  const timeMatches = [...prompt.matchAll(/(\d+)\s*(?:分|minutes?|min)/gi)];
  const targetMinutes = isLoop && timeMatches.length ? Number(timeMatches[timeMatches.length-1][1]) : null;
  if (stops.length) details.push(pick(`「${stops.slice(0,3).join(' → ')}」を通る構成です。寄り道の内容と歩く負担を比較して選べます。`, `This option passes ${stops.slice(0,3).join(' → ')}; weigh those stops against the walking effort.`, `本方案途经${stops.slice(0,3).join(' → ')}，可比较停留地点与步行负担。`));
  if (/広|大通り|道幅|wide|main road/i.test(prompt)) {
    details.push(wide ? pick(`広い歩行空間を画像${wide}地点で確認できたことが、この案を選ぶ利点です。`, `Wider walking space was visible at ${wide} sampled locations, supporting this option.`, `在${wide}个抽样地点看到了较宽的步行空间，这是本方案的优势。`) : pick('広い歩行空間を確認できた地点がなく、広い道を優先する希望への適合は未確認です。','No sampled image confirmed wider walking space, so the preference for wide paths remains unverified.','抽样图片尚未确认宽阔的步行空间，无法确定是否符合宽路偏好。'));
    if (narrow) details.push(pick(`一方、${narrow}地点では歩行空間が狭く見えます。`,`However, walking space appeared narrow at ${narrow} locations.`,`但有${narrow}个地点的步行空间看起来较窄。`));
  }
  if (/街灯|照明|夜道|灯り|明る|lighting|lit|light/i.test(prompt)) {
    const lights = observations.filter(o => o.street_lighting === 'visible' && o.confidence >= 0.35).length;
    details.push(lights ? pick(`同じ道路の街灯を進行方向の画像${lights}/3地点で確認できたため、街灯を重視する候補として評価しています。現在の点灯状況は未確認です。`, `Street lights were visible at ${lights}/3 forward-facing samples, supporting your lighting preference. Current illumination is unverified.`, `在${lights}/3个前进方向的抽样地点看到了同一道路的路灯，因此优先考虑。当前是否点亮尚未确认。`) : pick('進行方向の画像では街灯を確認できず、明るい道としての適合は未確認です。街灯が存在しないという意味ではありません。', 'Street lights were not confirmed in forward-facing images. This does not prove their absence or establish that the route is well lit.', '前进方向的图片尚未确认路灯，无法确定是否为明亮道路；这不代表路灯不存在。'));
  }
  if (/日陰|木陰|日差し|暑|shade|sunlight/i.test(prompt)) {
    const covers = observations.filter(o => (o.overhead_cover === 'partial' || o.overhead_cover === 'covered') && o.confidence >= 0.35).length;
    if (covers) details.push(pick(`上空の覆いを代表画像${covers}地点で確認しました。`, `Overhead cover was visible at ${covers} sampled locations.`, `在${covers}个抽样地点看到了头顶遮蔽物。`));
  }
  if (/海|川|景観|景色|view|scenic/i.test(prompt) && sea) details.push(pick(`希望する景観を代表画像${sea}地点で確認できたため、景色を楽しむ候補として比較できます。`,`The requested scenery was visible at ${sea} sampled locations, supporting a scenic walk.`,`在${sea}个抽样地点看到了所需景观，可作为观景散步的候选。`));
  if (!api.selection_role && /坂|足|平坦|slope|hill|flat/i.test(prompt) && m.elevation_profile_meters?.length) details.push(pick(`上りは約${Math.round(m.elevation_gain_meters)}mです。足への負担と寄り道の価値を比較して選べます。`,`The route climbs about ${Math.round(m.elevation_gain_meters)}m; weigh this effort against the detour.`,`累计上升约${Math.round(m.elevation_gain_meters)}米，可比较体力负担与绕行的价值。`));
  details.push(sidewalks ? pick(`歩道は代表画像${sidewalks}/3地点で確認しています。経路全体に続くかは未確認です。`,`Sidewalks were visible at ${sidewalks}/3 sampled locations; continuity along the whole route is unverified.`,`在${sidewalks}/3个代表地点看到了人行道，但全程连续性尚未确认。`) : pick('歩道を確認できる画像がなく、歩道のある道としては推奨根拠が不足しています。','Sidewalk evidence is unavailable, so this option cannot be recommended on that basis.','缺少人行道的图片依据，尚不足以据此推荐本路线。'));
  if (overlap >= 2) details.push(pick(`約${Math.round(overlap)}%は来た道を戻る可能性があり、その分は評価を下げています。`,`About ${Math.round(overlap)}% may retrace earlier sections, reducing its score.`,`约${Math.round(overlap)}%可能折返先前走过的道路，因此降低了评分。`));
  if (targetMinutes) details.push(pick(`目標${targetMinutes}分に対して約${Math.round(m.duration_seconds/60)}分で出発地点へ戻ります。`, `It returns to the start in about ${Math.round(m.duration_seconds/60)} minutes against your ${targetMinutes}-minute target.`, `目标为${targetMinutes}分钟，实际约${Math.round(m.duration_seconds/60)}分钟返回起点。`));
  else if (!api.selection_role) details.push(extra ? pick(`最短候補より約${extra}分長くなるため、この違いに時間をかけたい場合の案です。`,`It takes about ${extra} minutes longer than the quickest option; choose it if those differences justify the extra walk.`,`比最快候选多约${extra}分钟，适合愿意为这些差异多走一段路的情况。`) : pick('今回の候補では所要時間が最も短く、歩く時間を抑えたい場合に向きます。','This is the quickest of the current options, suited to keeping walking time down.','这是当前候选中用时最短的方案，适合希望减少步行时间的情况。'));
  const role = api.selection_role;
  const roleNames = {
    balanced: pick('急坂と遠回りを抑える案','Balance hills and walking time','兼顾坡度与绕行时间'),
    gentle: pick('遠回りして坂の負担を抑える案','Prioritize gentler slopes','优先减轻坡道负担'),
    alternative: pick('別経路の比較案（坂の改善は未確認）','Different route; hill improvement unverified','其他路线（坡度改善未确认）'),
    shortest: pick('最短時間の比較案','Quickest comparison route','最短用时对比路线'),
  };
  if (role) {
    const peak = Math.max(m.max_sampled_uphill_grade_percent ?? 0,m.max_sampled_downhill_grade_percent ?? 0);
    const measured = (m.elevation_profile_meters?.length ?? 0)>=2;
    const effort = measured ? pick(`観測最大勾配は上り${(m.max_sampled_uphill_grade_percent ?? 0).toFixed(1)}%・下り${(m.max_sampled_downhill_grade_percent ?? 0).toFixed(1)}%、累積上りは約${Math.round(m.elevation_gain_meters)}mです。`, `Sampled maximum grades: ${(m.max_sampled_uphill_grade_percent ?? 0).toFixed(1)}% uphill and ${(m.max_sampled_downhill_grade_percent ?? 0).toFixed(1)}% downhill; total ascent is about ${Math.round(m.elevation_gain_meters)}m.`, `抽样最大上坡${(m.max_sampled_uphill_grade_percent ?? 0).toFixed(1)}%、下坡${(m.max_sampled_downhill_grade_percent ?? 0).toFixed(1)}%，累计上升约${Math.round(m.elevation_gain_meters)}米。`) : pick('標高を取得できず、坂の負担は未確認です。','Elevation is unavailable, so hill effort is unverified.','尚未取得高程，坡道负担无法确认。');
    const why = role === 'balanced' ? pick(`最短候補より約${extra}分追加し、急坂区間や坂の負担を減らす案です。`, `Add about ${extra} minutes to reduce hill effort and steep sections.`, `比最快候选多约${extra}分钟，以减少陡坡区间和坡道负担。`) : role === 'gentle' ? pick(`最短候補より約${extra}分多く歩きますが、時間より勾配の緩さを優先して選んだ案です。`, `About ${extra} extra minutes, prioritizing gentler grades over walking time.`, `多走约${extra}分钟，优先考虑较缓的坡度。`) : role === 'alternative' ? pick(`最短案より約${extra}分多く歩く別経路です。坂の負担が減ると確認できた案ではなく、標準案と比べて選ぶ候補です。`, `A different route with about ${extra} extra minutes. Reduced hill effort is unverified; compare it with the standard option.`, `这是多走约${extra}分钟的其他路线。尚未确认坡道负担降低，请与标准方案比较。`) : pick('坂の回避を優先する案と比べるための、時間優先の経路です。坂を避けられるという意味ではありません。','A time-first route for comparison, not a claim of hill avoidance.','这是时间优先的对比路线，不表示已避开坡道。');
    const caveat = role === 'gentle' && measured && peak>4 ? pick('全体を1〜4%程度に抑えられた経路は今回の候補では確認できず、これは確認できた範囲での最も緩やかな案です。','No checked route stayed within roughly 1–4%; this is the gentlest option found, not a guarantee of that range.','已检查候选中尚未确认全程约1–4%的路线；这是目前找到的较缓方案，并非保证达到该范围。') : '';
    const noAlternative = role === 'shortest' && peers.length === 1 && measured && peak>4
      ? pick('今回の探索では坂の負担を減らす別案が見つからず、最短案だけを比較用に表示しています。', 'No hill-reducing alternative was found in this search; only the quickest route is shown for comparison.', '此次搜索未找到减轻坡道负担的其他方案，仅展示最快路线供比较。') : '';
    details.unshift(...(noAlternative ? [noAlternative] : []),why,effort,...(caveat ? [caveat] : []));
  }
  const via = stops.length ? pick(`${stops[0]}を経由`, `Via ${stops[0]}`, `途经${stops[0]}`) : pick('徒歩ルート','Walking route','步行路线');
  const title = role ? `${roleNames[role]} (${Math.round(m.duration_seconds/60)}${pick("分"," min","分钟")})` : pick(`${via}（約${Math.round(m.duration_seconds/60)}分）`,`${via} (${Math.round(m.duration_seconds/60)} min)`,`${via}（约${Math.round(m.duration_seconds/60)}分钟）`);
  return {...route, modeLabel: title, durationText: pick(`${Math.round(m.duration_seconds/60)}分`,`${Math.round(m.duration_seconds/60)} min`,`${Math.round(m.duration_seconds/60)}分钟`),
    apiData: {...api, title, concept: details.join(' '), tags: language === 'ja' ? api.tags : [pick('徒歩','Walking','步行')], metrics: {...m, score_reasons: language === 'ja' ? m.score_reasons : details}}};
}
