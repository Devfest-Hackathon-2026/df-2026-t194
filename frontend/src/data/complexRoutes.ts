import { MAP_FACILITY_PINS, snapToNearestRoadXY } from "./facilityPins";
import { geoToXY, xyToGeo } from "./walkrealData";
import {
  CityBlockRect,
  ComputedRoute,
  RoadLine,
  RouteModeId,
  RouteSegment,
  SegmentColor,
  StreetLabel,
  TurnDirectionType,
  WaypointPin,
  WeatherForecast,
  CongestionStatus,
} from "@/types/route";

// ベクター座標(0..1000, 0..620)から実緯度経度へ変換するヘルパー（富山市街エリア基準: 富山駅〜環水公園〜富山城址公園〜総曲輪）
function toGeo(pt: [number, number]): { lat: number; lng: number } {
  return xyToGeo(pt);
}

function makeSegments(
  raw: Array<{
    from: [number, number];
    to: [number, number];
    color: SegmentColor;
    label: string;
    distanceM: number;
  }>
): RouteSegment[] {
  return raw.map((item) => ({
    ...item,
    fromGeo: toGeo(item.from),
    toGeo: toGeo(item.to),
  }));
}

// 連続する2区間から右折・左折・直進を判定するユーティリティ
export function computeTurnDirection(
  p1: [number, number],
  p2: [number, number],
  p3?: [number, number] | null
): {
  type: TurnDirectionType;
  actionText: string;
} {
  if (!p3) {
    return { type: "arrive", actionText: "で目的地に到着" };
  }
  const a1 = Math.atan2(p2[1] - p1[1], p2[0] - p1[0]);
  const a2 = Math.atan2(p3[1] - p2[1], p3[0] - p2[0]);
  let diff = ((a2 - a1) * 180) / Math.PI;
  while (diff > 180) diff -= 360;
  while (diff < -180) diff += 360;

  if (diff > 28) return { type: "right", actionText: "先、右折" };
  if (diff < -28) return { type: "left", actionText: "先、左折" };
  if (diff > 10) return { type: "slight_right", actionText: "先、斜め右" };
  if (diff < -10) return { type: "slight_left", actionText: "先、斜め左" };
  return { type: "straight", actionText: "先、直進" };
}

// 街区ビルブロック定義
export const CITY_BLOCKS: CityBlockRect[] = [
  { id: "b1", x: 90, y: 245, w: 45, h: 65, r: 8 },
  { id: "b2", x: 120, y: 165, w: 45, h: 50, r: 8 },
  { id: "b3", x: 215, y: 185, w: 58, h: 50, r: 8 },
  { id: "b4", x: 225, y: 255, w: 54, h: 48, r: 8 },
  { id: "b5", x: 292, y: 108, w: 48, h: 38, r: 8 },
  { id: "b6", x: 300, y: 182, w: 52, h: 48, r: 8 },
  { id: "b7", x: 368, y: 176, w: 55, h: 50, r: 8 },
  { id: "b8", x: 310, y: 265, w: 55, h: 44, r: 8 },
  { id: "b9", x: 465, y: 232, w: 50, h: 52, r: 8 },
  { id: "b10", x: 548, y: 138, w: 54, h: 44, r: 8 },
  { id: "b11", x: 678, y: 172, w: 52, h: 42, r: 8 },
  { id: "b12", x: 698, y: 238, w: 62, h: 48, r: 8 },
  { id: "b13", x: 778, y: 222, w: 48, h: 58, r: 8 },
  { id: "b14", x: 585, y: 298, w: 62, h: 38, r: 8 },
];

export const PARK_PATHS: string[] = [
  "M 80,62 L 232,62 L 205,155 L 72,145 Z",
  "M 588,200 L 662,194 L 654,288 L 596,288 Z",
];

export const ROAD_NETWORK: RoadLine[] = [
  {
    id: "rd-meiji-cat",
    pts: [
      [135, 322],
      [185, 232],
      [236, 134],
      [358, 90],
      [468, 118],
      [572, 140],
      [652, 175],
      [760, 190],
      [818, 276],
    ],
    width: 17,
  },
  {
    id: "rd-aoyama",
    pts: [
      [135, 322],
      [188, 306],
      [335, 264],
      [472, 228],
      [622, 194],
      [652, 175],
    ],
    width: 19,
  },
  {
    id: "rd-urasando",
    pts: [
      [236, 134],
      [288, 158],
      [342, 152],
      [410, 152],
      [468, 145],
      [472, 194],
      [555, 215],
      [610, 234],
      [652, 198],
      [638, 274],
      [818, 274],
      [822, 328],
    ],
    width: 16,
  },
  {
    id: "rd-roppongi",
    pts: [
      [472, 228],
      [588, 336],
      [680, 336],
      [736, 358],
      [822, 328],
    ],
    width: 17,
  },
  {
    id: "rd-conn-1",
    pts: [
      [188, 306],
      [236, 232],
      [288, 158],
    ],
    width: 13,
  },
  {
    id: "rd-conn-2",
    pts: [
      [335, 264],
      [342, 208],
      [342, 152],
    ],
    width: 13,
  },
  {
    id: "rd-conn-3",
    pts: [
      [472, 228],
      [472, 194],
      [468, 118],
    ],
    width: 14,
  },
  {
    id: "rd-conn-6",
    pts: [
      [736, 358],
      [768, 274],
      [760, 190],
    ],
    width: 13,
  },
  // 北西・美術館＆環水公園西プロムナード周回路
  {
    id: "rd-north-canal-loop",
    pts: [
      [185, 232],
      [148, 162],
      [205, 118],
      [236, 134],
      [358, 90],
      [468, 118],
    ],
    width: 14,
  },
  // 南西〜中央・神通川＆城址南外周路
  {
    id: "rd-south-castle-loop",
    pts: [
      [188, 306],
      [272, 348],
      [412, 356],
      [472, 228],
    ],
    width: 14,
  },
  // 中央〜南東・松川べり＆総曲輪アーケード周回路
  {
    id: "rd-matsukawa-loop",
    pts: [
      [335, 264],
      [412, 312],
      [588, 336],
      [615, 245],
      [652, 185],
      [572, 140],
      [468, 145],
    ],
    width: 14,
  },
  // 東側・日枝神社〜ガラス美術館〜いたち川周回路
  {
    id: "rd-east-shrine-loop",
    pts: [
      [652, 175],
      [760, 190],
      [805, 274],
      [822, 328],
      [736, 358],
      [638, 274],
    ],
    width: 14,
  },
];

// ==========================================
// 道路ネットワークグラフ探索エンジン (Dijkstra)
// 本番 (Google Routes API) と同等の動的ルーティングをベクター道路網上で実行
// ==========================================

interface GraphNode {
  id: string;
  x: number;
  y: number;
  neighbors: Map<string, number>; // neighborId -> distancePx
}

let cachedGraph: Map<string, GraphNode> | null = null;

function getRoadNetworkGraph(): Map<string, GraphNode> {
  if (cachedGraph) return cachedGraph;

  const graph = new Map<string, GraphNode>();
  const snapDist = 18; // 近接ノードを統合する距離しきい値

  function getOrCreateNode(pt: [number, number]): GraphNode {
    const [x, y] = pt;
    for (const node of graph.values()) {
      if (Math.hypot(node.x - x, node.y - y) <= snapDist) {
        return node;
      }
    }
    const id = `node_${Math.round(x)}_${Math.round(y)}`;
    const newNode: GraphNode = { id, x, y, neighbors: new Map() };
    graph.set(id, newNode);
    return newNode;
  }

  for (const road of ROAD_NETWORK) {
    for (let i = 0; i < road.pts.length - 1; i++) {
      const u = getOrCreateNode(road.pts[i]);
      const v = getOrCreateNode(road.pts[i + 1]);
      if (u.id !== v.id) {
        const d = Math.hypot(u.x - v.x, u.y - v.y);
        u.neighbors.set(v.id, Math.min(u.neighbors.get(v.id) || Infinity, d));
        v.neighbors.set(u.id, Math.min(v.neighbors.get(u.id) || Infinity, d));
      }
    }
  }

  cachedGraph = graph;
  return graph;
}

// 任意の座標から最も近いグラフノードを検索
function findNearestGraphNode(x: number, y: number): GraphNode {
  const graph = getRoadNetworkGraph();
  let bestNode: GraphNode | null = null;
  let minDist = Infinity;
  for (const node of graph.values()) {
    const d = Math.hypot(node.x - x, node.y - y);
    if (d < minDist) {
      minDist = d;
      bestNode = node;
    }
  }
  return bestNode || { id: "fallback", x, y, neighbors: new Map() };
}

// ダイクストラ法による道路網最短経路探索
function findShortestRoadPath(
  startXY: [number, number],
  endXY: [number, number],
  penalizedEdgeSet?: Set<string>
): [number, number][] {
  const graph = getRoadNetworkGraph();
  const startNode = findNearestGraphNode(startXY[0], startXY[1]);
  const endNode = findNearestGraphNode(endXY[0], endXY[1]);

  if (startNode.id === endNode.id) {
    return [startXY, [startNode.x, startNode.y], endXY];
  }

  const dist = new Map<string, number>();
  const prev = new Map<string, string | null>();
  const visited = new Set<string>();

  for (const id of graph.keys()) {
    dist.set(id, Infinity);
    prev.set(id, null);
  }
  dist.set(startNode.id, 0);

  while (visited.size < graph.size) {
    let currentId: string | null = null;
    let minD = Infinity;

    for (const [id, d] of dist.entries()) {
      if (!visited.has(id) && d < minD) {
        minD = d;
        currentId = id;
      }
    }

    if (!currentId || minD === Infinity || currentId === endNode.id) {
      break;
    }

    visited.add(currentId);
    const currNode = graph.get(currentId)!;

    for (const [neighborId, weight] of currNode.neighbors.entries()) {
      if (visited.has(neighborId)) continue;
      const edgeKey = currentId < neighborId ? `${currentId}_${neighborId}` : `${neighborId}_${currentId}`;
      const penalty = penalizedEdgeSet?.has(edgeKey) ? 6.0 : 1.0;
      const alt = dist.get(currentId)! + weight * penalty;
      if (alt < dist.get(neighborId)!) {
        dist.set(neighborId, alt);
        prev.set(neighborId, currentId);
      }
    }
  }

  // 経路復元
  const path: [number, number][] = [];
  let curr: string | null = endNode.id;
  if (!prev.get(curr) && curr !== startNode.id) {
    return [startXY, endXY];
  }

  while (curr) {
    const n = graph.get(curr);
    if (n) path.unshift([n.x, n.y]);
    curr = prev.get(curr) || null;
  }

  if (Math.hypot(startXY[0] - path[0][0], startXY[1] - path[0][1]) > 10) {
    path.unshift(startXY);
  }
  const last = path[path.length - 1];
  if (Math.hypot(endXY[0] - last[0], endXY[1] - last[1]) > 10) {
    path.push(endXY);
  }

  return path;
}


// 所要時間フォーマット（59分超え・60分以上は「◯時間◯分」）
export function formatDuration(val: number | string): string {
  let mins: number;
  if (typeof val === "string") {
    if (val.includes("時間")) return val;
    const match = val.match(/\d+/);
    if (!match) return val;
    mins = parseInt(match[0], 10);
  } else {
    mins = Math.round(val);
  }
  if (mins < 60) return `${mins}分`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h}時間` : `${h}時間${m}分`;
}

// 文字列から安定したハッシュ値を生成（任意の地名からリアルな距離・標高を算出）
function hashText(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) >>> 0;
  }
  return h;
}

// 指定日時文字列から天気予報情報を算出する関数（API通信ゼロ・将来の外部天気API接続口）
export function computeWeatherForDateTime(
  dateTimeStr: string,
  locationText: string
): WeatherForecast {
  let d = new Date();
  if (dateTimeStr) {
    const parsed = new Date(dateTimeStr);
    if (!isNaN(parsed.getTime())) {
      d = parsed;
    }
  }

  const hour = d.getHours();
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const timeLabel = `${month}月${day}日 ${String(hour).padStart(2, "0")}:00`;

  // 日時と地名に基づいた決定論的ハッシュ
  const locSeed = hashText(locationText || "東京");
  const timeSeed = (d.getFullYear() * 10000 + month * 100 + day) * 24 + hour + locSeed;
  const val = (timeSeed * 9301 + 49297) % 233280;
  const rand = val / 233280;

  let weatherType: WeatherForecast["weatherType"] = "sunny";
  let weatherText = "晴れ";
  let tempC = 18;
  let rainProb = 10;
  let rainMm = 0;

  // 季節と時間帯を考慮したリアルな気温計算
  const isSummer = month >= 6 && month <= 8;
  const isWinter = month >= 12 || month <= 2;
  const baseTemp = isSummer ? 28 : isWinter ? 9 : 19;
  const hourDelta = Math.sin(((hour - 8) / 24) * 2 * Math.PI) * 4;
  tempC = Math.round(baseTemp + hourDelta + (rand * 4 - 2));

  // 天気パターンの算出
  if (rand < 0.32) {
    weatherType = "sunny";
    weatherText = "快晴";
    rainProb = Math.round(rand * 15);
    rainMm = 0;
  } else if (rand < 0.6) {
    weatherType = "cloudy";
    weatherText = "くもり";
    rainProb = Math.round(20 + rand * 25);
    rainMm = 0;
  } else if (rand < 0.88) {
    weatherType = "rainy";
    weatherText = "雨";
    rainProb = Math.round(65 + rand * 30);
    rainMm = Number((1.2 + rand * 3.8).toFixed(1));
  } else {
    weatherType = "storm";
    weatherText = "強い雨";
    rainProb = Math.round(85 + rand * 15);
    rainMm = Number((6.0 + rand * 9.5).toFixed(1));
  }

  return {
    timeLabel,
    weatherType,
    weatherText,
    tempC,
    rainProb,
    rainMm,
  };
}

// 指定日時・ルートモードから混雑度（すいている/混雑/激しい混雑）を算出する関数
export function computeCongestionForDateTime(
  dateTimeStr: string,
  modeId: RouteModeId
): CongestionStatus {
  let d = new Date();
  if (dateTimeStr) {
    const parsed = new Date(dateTimeStr);
    if (!isNaN(parsed.getTime())) {
      d = parsed;
    }
  }

  const hour = d.getHours();
  const dayOfWeek = d.getDay(); // 0:日, 6:土
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

  // 時間帯による基本混雑率（通勤ラッシュ 8:00〜9:30, 18:00〜19:30、休日昼 13:00〜16:00）
  let baseScore = 25;
  if (!isWeekend) {
    if (hour >= 8 && hour <= 9) baseScore = 82;
    else if (hour >= 17 && hour <= 19) baseScore = 78;
    else if (hour >= 12 && hour <= 13) baseScore = 55;
    else if (hour >= 22 || hour <= 5) baseScore = 12;
    else baseScore = 38;
  } else {
    if (hour >= 13 && hour <= 17) baseScore = 72;
    else if (hour >= 11 && hour <= 12) baseScore = 60;
    else if (hour >= 22 || hour <= 6) baseScore = 15;
    else baseScore = 40;
  }

  // ルート特性による混雑緩和（裏道・バイパス・坂なしは人混みを回避できる）
  if (modeId === "hybrid") {
    baseScore = Math.max(10, Math.round(baseScore * 0.58)); // 裏道経由で42%混雑軽減
  } else if (modeId === "flat") {
    baseScore = Math.max(10, Math.round(baseScore * 0.72));
  } else if (modeId === "rain") {
    // 雨天時や地下道は人が集中しやすい
    baseScore = Math.min(98, Math.round(baseScore * 1.15));
  } else if (modeId === "fast") {
    // 最短大通りは混雑が集中しやすい
    baseScore = Math.min(99, Math.round(baseScore * 1.25));
  }

  if (baseScore < 40) {
    return {
      level: "low",
      levelText: "すいている",
      scorePercent: baseScore,
      color: "#34A853",
      description: "人通りが少なくスムーズに通行可能",
    };
  } else if (baseScore < 72) {
    return {
      level: "medium",
      levelText: "やや混雑",
      scorePercent: baseScore,
      color: "#FBBC05",
      description: "適度な人通り・歩行速度は標準的",
    };
  } else {
    return {
      level: "heavy",
      levelText: "激しい混雑",
      scorePercent: baseScore,
      color: "#EA4335",
      description: "主要通路・交差点で混雑あり",
    };
  }
}

// 開始地点・中継地点リスト・終点・指定日時から、古いデモ地名を残さず動的に4モードのルートを構築する関数
export function buildDynamicRoutes(
  rawOrigin: string,
  rawWaypoints: string[],
  rawDestination: string,
  targetDateTime: string = "",
  destinationGeo?: { lat: number; lng: number } | null,
  loopMinutes?: number | null
): Record<RouteModeId, ComputedRoute> {
  const origin = rawOrigin.trim() || "出発地";
  const destination = rawDestination.trim() || "目的地";
  const validWaypoints = rawWaypoints
    .map((w) => w.trim())
    .filter((w) => w.length > 0);

  const combinedText = [origin, ...validWaypoints, destination, targetDateTime].join(" ");
  const isDefaultToyama =
    (origin === "富山駅" || origin === "現在地" || origin === "出発地") &&
    (destination === "富岩運河環水公園" || destination === "目的地" || !destination) &&
    validWaypoints.length === 0;

  const isReverseToyama =
    (origin === "富岩運河環水公園" || origin.includes("環水公園")) &&
    (destination === "富山駅" || destination === "現在地" || destination === "出発地" || destination === "目的地" || !destination) &&
    validWaypoints.length === 0;

  // 山越え・長距離判定（「富山」は山越えから除外し、立山・黒部・峠・富士など実際の山岳地名のみを対象にする）
  const textWithoutToyama = combinedText.replace(/富山/g, "");
  const isMountainOrLong =
    /(立山|黒部|有峰|峠|山|富士|軽井沢|長野|松本|白馬|高尾|箱根)/.test(
      textWithoutToyama
    ) || validWaypoints.length >= 2;

  // 周回（ループ）散歩判定
  const isLoopWalk =
    Boolean(loopMinutes && loopMinutes > 0) ||
    (origin === destination && origin !== "出発地") ||
    /(周回|ループ|一周|おまかせ|散歩コース|戻る)/.test(combinedText);

  // 周回時間の特定（引数 ＞ テキスト抽出 ＞ 30分デフォルト）
  const parsedMinMatch = combinedText.match(/(\d+)\s*分/);
  const targetLoopMin = loopMinutes || (parsedMinMatch ? parseInt(parsedMinMatch[1], 10) : 30);

  const seed = hashText(combinedText);

  // 目的地のベクター座標を特定（指定Geo ＞ 施設ピン名完全一致 ＞ 部分一致 ＞ デフォルト）
  let destXY: [number, number] = [822, 328];
  let hasMatchedMapPin = false;
  if (destinationGeo) {
    const rawXY = geoToXY(destinationGeo);
    const snapped = snapToNearestRoadXY(rawXY[0], rawXY[1]);
    destXY = [snapped.snappedX, snapped.snappedY];
    hasMatchedMapPin = true;
  } else {
    const exactFac = MAP_FACILITY_PINS.find((f) => f.name === destination);
    const partialFac =
      !exactFac &&
      destination !== "指定した地点" &&
      !destination.includes("付近の指定地点") &&
      !destination.includes("付近の道路地点")
        ? MAP_FACILITY_PINS.find(
            (f) => destination.includes(f.name) || f.name.includes(destination)
          )
        : undefined;
    const matchedFac = exactFac || partialFac;
    if (matchedFac) {
      const snapped = snapToNearestRoadXY(matchedFac.x, matchedFac.y);
      destXY = [snapped.snappedX, snapped.snappedY];
      hasMatchedMapPin = true;
    }
  }

  // 基準距離・基準時間・標高スケールの算出
  let baseKm = 1.3;
  let baseMin = 16;
  let peakElevM = 14;
  let reducedElevM = 4;

  if (isLoopWalk) {
    // Googleマップ基準の標準徒歩速度: 分速80m（時速4.8km、不動産表示・Google Maps標準）
    baseMin = Math.max(10, targetLoopMin);
    baseKm = Number((baseMin * 0.08).toFixed(1));
    peakElevM = baseMin >= 45 ? 10 : 6;
    reducedElevM = 2;
  } else if (hasMatchedMapPin && !isMountainOrLong) {
    // スタート地点[135, 322]からピン座標までの実距離に応じた徒歩スペック算出
    const pxDist = Math.hypot(destXY[0] - 135, destXY[1] - 322);
    baseKm = Number(Math.max(0.4, (pxDist / 260) * 1.15 + validWaypoints.length * 0.4).toFixed(1));
    baseMin = Math.max(5, Math.round(baseKm * 12.5));
    peakElevM = 8 + (seed % 10);
    reducedElevM = Math.max(2, Math.round(peakElevM * 0.3));
  } else if (!isDefaultToyama) {
    if (isMountainOrLong) {
      baseKm = Number((18.5 + (seed % 65) + validWaypoints.length * 8.4).toFixed(1));
      baseMin = Math.round(baseKm * 3.2);
      // 山越え発生時の標高（320m〜1,180m）
      peakElevM = 320 + (seed % 860);
      reducedElevM = Math.round(peakElevM * 0.28);
    } else {
      baseKm = Number((1.2 + (seed % 35) * 0.12 + validWaypoints.length * 0.8).toFixed(1));
      baseMin = Math.max(8, Math.round(baseKm * 12.2));
      peakElevM = 12 + (seed % 20);
      reducedElevM = Math.max(3, Math.round(peakElevM * 0.25));
    }
  }

  // 動的マップラベル（富山市街エリア基準）
  const wp1Name = validWaypoints[0] || (isDefaultToyama ? "富山駅北口" : `${origin}連絡路`);
  const wp2Name = validWaypoints[1] || (isDefaultToyama ? "牛島町" : `${destination}手前`);

  // マップ上の道路ラベル（Googleマップ同様、不自然な文字被りを防ぎ実在の主要通り名のみを控えめに表示）
  const dynamicLabels: StreetLabel[] = isLoopWalk
    ? [
        { id: "lbl-1", x: 195, y: 114, text: "富山駅北口広場", rotation: 0 },
        { id: "lbl-2", x: 372, y: 78, text: "ブールバール通り", rotation: 0 },
        { id: "lbl-4", x: 632, y: 268, text: "富岩運河プロムナード", rotation: 0, isPark: true },
        { id: "lbl-5", x: 742, y: 382, text: "環水公園 天門橋", rotation: 14 },
      ]
    : isDefaultToyama
    ? [
        { id: "lbl-1", x: 195, y: 114, text: "富山駅北口広場", rotation: 0 },
        { id: "lbl-2", x: 372, y: 78, text: "ブールバール通り", rotation: 0 },
        { id: "lbl-3", x: 372, y: 282, text: "牛島町交差点", rotation: -13 },
        { id: "lbl-4", x: 632, y: 268, text: "富岩運河プロムナード", rotation: 0, isPark: true },
        { id: "lbl-5", x: 742, y: 382, text: "環水公園 天門橋", rotation: 14 },
      ]
    : [
        { id: "lbl-1", x: 195, y: 114, text: "駅北広場", rotation: 0 },
        { id: "lbl-2", x: 372, y: 78, text: "ブールバール通り", rotation: 0 },
        { id: "lbl-4", x: 632, y: 268, text: "富岩運河プロムナード", rotation: 0, isPark: true },
        { id: "lbl-5", x: 742, y: 382, text: "環水公園 天門橋", rotation: 14 },
      ];

  // destXY は上部で算出済み

  // 終点座標に合わせて道路網に沿った自然なルートセグメントを再構築するヘルパー
  const connectToEnd = (
    rawSegs: Array<{ from: [number, number]; to: [number, number]; color: SegmentColor; label: string; distanceM: number }>,
    isFastMode = false,
    modeId: RouteModeId = "hybrid"
  ) => {
    if (rawSegs.length === 0) return rawSegs;

    // 【周回散歩モード】本番（Google Routes API）と完全に同じ動的ロジック：
    // 出発地から目標時間（分速75m）に応じた半径の経由スポットを選定し、
    // 道路ネットワークグラフ上でダイクストラ法（最短経路探索・周回ペナルティ）を実行してループを構築する
    if (isLoopWalk) {
      // 1. 出発地座標の動的特定（富山駅、現在地、指定施設ピン、または長押しスナップ位置）
      let startXY: [number, number] = [135, 322];
      if (origin === "富山駅") {
        startXY = [472, 228];
      } else {
        const exactFac = MAP_FACILITY_PINS.find((f) => f.name === origin);
        if (exactFac) {
          startXY = [exactFac.x, exactFac.y];
        }
      }

      // 2. 目標時間に応じた経由地（POI）の動的選定
      // 分速75m: 15分=1.1km, 30分=2.2km, 45分=3.4km, 60分=4.5km
      const isShort = baseMin <= 20;
      const isLong = baseMin >= 45;

      let stops: Array<{ xy: [number, number]; label: string }> = [];

      if (modeId === "hybrid") {
        // コース1: 水辺・環水公園・美術館周回（北〜北西）
        stops = isShort
          ? [
              { xy: [288, 158], label: "環水公園 カフェテラス前" },
              { xy: [342, 138], label: "富岩運河 天門橋" },
            ]
          : isLong
          ? [
              { xy: [288, 158], label: "環水公園 カフェテラス" },
              { xy: [205, 118], label: "富山県美術館 屋上庭園" },
              { xy: [358, 90], label: "運河北端 プロムナード" },
              { xy: [468, 118], label: "ブールバール 北口並木道" },
            ]
          : [
              { xy: [288, 158], label: "環水公園 カフェテラス" },
              { xy: [205, 118], label: "富山県美術館" },
              { xy: [342, 138], label: "富岩運河 天門橋" },
            ];
      } else if (modeId === "flat") {
        // コース2: 富山城址公園・松川・総曲輪カフェ街周回（中央〜南東）
        stops = isShort
          ? [
              { xy: [472, 228], label: "富山駅前 プロムナード" },
              { xy: [615, 245], label: "富山城址公園 石垣前" },
            ]
          : isLong
          ? [
              { xy: [615, 245], label: "富山城址公園 お堀沿い" },
              { xy: [652, 185], label: "総曲輪通り カフェ街" },
              { xy: [736, 348], label: "富山市ガラス美術館" },
              { xy: [588, 336], label: "松川べり 彫刻の道" },
            ]
          : [
              { xy: [615, 245], label: "富山城址公園 お堀沿い" },
              { xy: [652, 185], label: "総曲輪通り カフェ街" },
              { xy: [588, 336], label: "松川べり 緑道" },
            ];
      } else if (modeId === "rain") {
        // コース3: 総曲輪アーケード・日枝神社・ガラス美術館周回（東側・屋根付き）
        stops = isShort
          ? [
              { xy: [652, 175], label: "総曲輪 屋根付きアーケード" },
              { xy: [736, 348], label: "ガラス美術館 TOYAMAキラリ" },
            ]
          : [
              { xy: [652, 175], label: "総曲輪アーケード街" },
              { xy: [805, 274], label: "日枝神社 表参道" },
              { xy: [736, 348], label: "富山市ガラス美術館" },
              { xy: [638, 274], label: "いたち川 寺社裏通り" },
            ];
      } else {
        // コース4: 神通川リバーサイド＆大通り快走周回（西〜中央快走）
        stops = isShort
          ? [
              { xy: [272, 348], label: "神通川 リバーサイド遊歩道" },
              { xy: [358, 90], label: "ブールバール快走路" },
            ]
          : [
              { xy: [188, 306], label: "西大通り 快走区間" },
              { xy: [272, 348], label: "神通川 リバーサイド遊歩道" },
              { xy: [412, 356], label: "南大通り 快走路" },
              { xy: [468, 118], label: "ブールバール並木道" },
            ];
      }

      // 3. 【道路網ダイクストラ探索】: 各区間を出発地から経由地、そして出発地へ道路に沿って接続
      const penalizedEdges = new Set<string>();
      const routePts: [number, number][] = [startXY];
      const targetStops = [...stops.map((s) => s.xy), startXY];

      for (let s = 0; s < targetStops.length; s++) {
        const fromPt = routePts[routePts.length - 1];
        const toPt = targetStops[s];
        const subPath = findShortestRoadPath(fromPt, toPt, penalizedEdges);

        // 通過した道路エッジを記録（帰路で同じ道を往復せず、綺麗な周回ループを描くようペナルティ付与）
        for (let p = 0; p < subPath.length - 1; p++) {
          const u = findNearestGraphNode(subPath[p][0], subPath[p][1]).id;
          const v = findNearestGraphNode(subPath[p + 1][0], subPath[p + 1][1]).id;
          const eKey = u < v ? `${u}_${v}` : `${v}_${u}`;
          penalizedEdges.add(eKey);
        }

        for (let k = 1; k < subPath.length; k++) {
          routePts.push(subPath[k]);
        }
      }

      // 重複する連続頂点を整理
      const cleanPts: [number, number][] = [];
      for (let i = 0; i < routePts.length; i++) {
        if (i === 0 || Math.hypot(routePts[i][0] - routePts[i - 1][0], routePts[i][1] - routePts[i - 1][1]) > 4) {
          cleanPts.push(routePts[i]);
        }
      }

      // 4. ダイクストラで探索された道路セグメント群を生成し、実測距離を算出
      const targetTotalM = Math.round(baseKm * 1000);
      let totalPx = 0;
      for (let i = 0; i < cleanPts.length - 1; i++) {
        totalPx += Math.hypot(cleanPts[i + 1][0] - cleanPts[i][0], cleanPts[i + 1][1] - cleanPts[i][1]);
      }

      const loopBuilt: Array<{ from: [number, number]; to: [number, number]; color: SegmentColor; label: string; distanceM: number }> = [];
      for (let i = 0; i < cleanPts.length - 1; i++) {
        const p1 = cleanPts[i];
        const p2 = cleanPts[i + 1];
        const segPx = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
        const dM = Math.max(35, Math.round((segPx / Math.max(1, totalPx)) * targetTotalM));
        const color: SegmentColor =
          modeId === "fast"
            ? "#EA4335"
            : modeId === "rain"
            ? "#4285F4"
            : modeId === "flat"
            ? "#34A853"
            : i % 2 === 0
            ? "#34A853"
            : "#FBBC05";

        let segLabel = `${origin} 周回区間 ${i + 1}`;
        if (i === 0) segLabel = `${origin} 出発`;
        else if (i === cleanPts.length - 2) segLabel = `${origin} 帰着・完走`;
        else {
          const ratio = (i + 1) / cleanPts.length;
          const stopIdx = Math.min(stops.length - 1, Math.floor(ratio * stops.length));
          if (stops[stopIdx]) segLabel = stops[stopIdx].label;
        }

        loopBuilt.push({
          from: p1,
          to: p2,
          color,
          label: segLabel,
          distanceM: dM,
        });
      }
      return loopBuilt;
    }

    // デフォルト終点[822,328]に近い場合はそのまま使用
    if (Math.hypot(destXY[0] - 822, destXY[1] - 328) <= 25) {
      return rawSegs;
    }

    const startPt: [number, number] = rawSegs[0].from;
    const mainColor = rawSegs[rawSegs.length - 1].color;

    // 元のモード経路の頂点リストから、目的地へ向かう途中にある頂点だけを抽出
    const totalDirectDist = Math.hypot(destXY[0] - startPt[0], destXY[1] - startPt[1]);
    const pathPts: [number, number][] = [startPt];

    for (const seg of rawSegs) {
      const pt = seg.to;
      const distFromStart = Math.hypot(pt[0] - startPt[0], pt[1] - startPt[1]);
      const distToDest = Math.hypot(destXY[0] - pt[0], destXY[1] - pt[1]);
      // 目的地を通り過ぎず、かつ目的地に近づいている経路ノードのみを経由
      if (distFromStart < totalDirectDist * 0.92 && distToDest < totalDirectDist * 0.95) {
        pathPts.push(pt);
      } else {
        break;
      }
    }

    const lastNode = pathPts[pathPts.length - 1];
    // 最後のノードと目的地の間が離れている場合は、道路風の中間折れ点を1つ挟んで自然に接続
    if (Math.hypot(destXY[0] - lastNode[0], destXY[1] - lastNode[1]) > 75) {
      const bendX = Math.round(
        isFastMode
          ? (lastNode[0] + destXY[0]) / 2
          : lastNode[0] + (destXY[0] - lastNode[0]) * 0.65
      );
      const bendY = Math.round(
        isFastMode
          ? (lastNode[1] + destXY[1]) / 2
          : destXY[1] + (lastNode[1] - destXY[1]) * 0.25
      );
      pathPts.push([bendX, bendY]);
    }

    pathPts.push(destXY);

    // 頂点列からセグメント配列を生成
    const built: Array<{ from: [number, number]; to: [number, number]; color: SegmentColor; label: string; distanceM: number }> = [];
    for (let i = 0; i < pathPts.length - 1; i++) {
      const p1 = pathPts[i];
      const p2 = pathPts[i + 1];
      const segPx = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
      const dM = Math.max(45, Math.round(segPx * 2.5));
      const isLast = i === pathPts.length - 2;
      const origSeg = rawSegs[Math.min(i, rawSegs.length - 1)];
      built.push({
        from: p1,
        to: p2,
        color: isFastMode ? "#EA4335" : origSeg.color || mainColor,
        label: isLast ? `${destination} 到着` : origSeg.label,
        distanceM: dM,
      });
    }
    return built;
  };

  // 各モードの経路上に中継地点ピンを配置するヘルパー
  const buildWaypointPins = (segs: RouteSegment[], modeId: RouteModeId = "hybrid"): WaypointPin[] => {
    if (isLoopWalk && validWaypoints.length === 0) {
      const pts = segs.map((s) => s.to);
      const mid1 = pts[Math.max(1, Math.floor(pts.length * 0.3))] || [288, 158];
      const mid2 = pts[Math.max(2, Math.floor(pts.length * 0.65))] || [468, 145];
      if (modeId === "hybrid") {
        return [
          { id: "loop-wp-1", name: "富岩運河環水公園", x: mid1[0], y: mid1[1] },
          { id: "loop-wp-2", name: "環水公園 カフェテラス", x: mid2[0], y: mid2[1] },
        ];
      } else if (modeId === "flat") {
        return [
          { id: "loop-wp-1", name: "富山城址公園", x: mid1[0], y: mid1[1] },
          { id: "loop-wp-2", name: "総曲輪通り カフェ街", x: mid2[0], y: mid2[1] },
        ];
      } else if (modeId === "rain") {
        return [
          { id: "loop-wp-1", name: "総曲輪アーケード", x: mid1[0], y: mid1[1] },
          { id: "loop-wp-2", name: "日枝神社・裏通り", x: mid2[0], y: mid2[1] },
        ];
      } else {
        return [
          { id: "loop-wp-1", name: "神通川プロムナード", x: mid1[0], y: mid1[1] },
          { id: "loop-wp-2", name: "ブールバール並木道", x: mid2[0], y: mid2[1] },
        ];
      }
    }
    if (validWaypoints.length === 0) return [];
    const pts = segs.map((s) => s.to);
    return validWaypoints.map((name, idx) => {
      const targetIdx = Math.min(
        pts.length - 2,
        Math.max(1, Math.round(((idx + 1) / (validWaypoints.length + 1)) * (pts.length - 1)))
      );
      const pt = pts[targetIdx] || [468, 145];
      return {
        id: `wp-${idx}`,
        name,
        x: pt[0],
        y: pt[1],
      };
    });
  };

  // 区間距離スケール
  const segScale = baseKm / 3.1;
  const sc = (m: number) => Math.max(40, Math.round(m * segScale));

  // 山越え・長距離でも破綻しない標高断面配列生成
  const baseElevArr = [
    14,
    Math.round(14 + peakElevM * 0.35),
    Math.round(14 + peakElevM * 0.85),
    Math.round(14 + peakElevM * 0.78),
    Math.round(14 + peakElevM * 0.42),
    Math.round(14 + peakElevM * 0.72),
    14 + peakElevM,
    Math.round(14 + peakElevM * 0.65),
  ];

  const lowElevArr = [
    14,
    14 + Math.round(reducedElevM * 0.2),
    14 + Math.round(reducedElevM * 0.35),
    14 + Math.round(reducedElevM * 0.55),
    14 + Math.round(reducedElevM * 0.75),
    14 + Math.round(reducedElevM * 0.85),
    14 + reducedElevM,
    14 + Math.round(reducedElevM * 0.9),
  ];

  // 1. 複合モード (hybrid)
  const hybridSegments = makeSegments(connectToEnd([
    {
      from: [135, 322],
      to: [188, 306],
      color: "#4285F4",
      label: `${origin} 地下・屋根連絡路`,
      distanceM: sc(110),
    },
    {
      from: [188, 306],
      to: [236, 232],
      color: "#4285F4",
      label: isMountainOrLong ? "第1トンネル連絡路" : `${origin}東 シェルター通路`,
      distanceM: sc(180),
    },
    {
      from: [236, 232],
      to: [288, 158],
      color: "#FBBC05",
      label: validWaypoints[0] ? `${validWaypoints[0]} アプローチ路` : "緩勾配バイパス裏道",
      distanceM: sc(210),
    },
    {
      from: [288, 158],
      to: [468, 145],
      color: "#FBBC05",
      label: validWaypoints[0] ? `${validWaypoints[0]} 周辺フラット路` : "フラット遊歩道区間",
      distanceM: sc(340),
    },
    {
      from: [468, 145],
      to: [472, 194],
      color: "#4285F4",
      label: isMountainOrLong ? "山岳シェルター回廊" : "中央屋内コンコース",
      distanceM: sc(130),
    },
    {
      from: [472, 194],
      to: [610, 234],
      color: "#FBBC05",
      label: validWaypoints[1] ? `${validWaypoints[1]} 連絡通り` : "静穏フラット裏通り",
      distanceM: sc(290),
    },
    {
      from: [610, 234],
      to: [652, 198],
      color: "#FBBC05",
      label: "勾配緩和スロープ区間",
      distanceM: sc(120),
    },
    {
      from: [652, 198],
      to: [638, 274],
      color: "#FBBC05",
      label: "緑地公園脇フラット路",
      distanceM: sc(190),
    },
    {
      from: [638, 274],
      to: [818, 274],
      color: "#34A853",
      label: `${destination}前 坂回避デッキ`,
      distanceM: sc(420),
    },
    {
      from: [818, 274],
      to: [822, 328],
      color: "#34A853",
      label: `${destination} 到着`,
      distanceM: sc(90),
    },
  ], false, "hybrid"));

  // 2. 坂なしモード (flat)
  const flatSegments = makeSegments(connectToEnd([
    {
      from: [135, 322],
      to: [185, 232],
      color: "#34A853",
      label: `${origin} 平坦大通り`,
      distanceM: sc(190),
    },
    {
      from: [185, 232],
      to: [236, 134],
      color: "#34A853",
      label: "緩勾配スロープ遊歩道",
      distanceM: sc(240),
    },
    {
      from: [236, 134],
      to: [358, 90],
      color: "#34A853",
      label: validWaypoints[0] ? `${validWaypoints[0]} 平坦迂回路` : "山越え回避フラット道",
      distanceM: sc(310),
    },
    {
      from: [358, 90],
      to: [468, 118],
      color: "#34A853",
      label: "エレベーター・スロープ連絡口",
      distanceM: sc(260),
    },
    {
      from: [468, 118],
      to: [652, 175],
      color: "#34A853",
      label: validWaypoints[1] ? `${validWaypoints[1]} 広幅平坦歩道` : "広幅フラットプロムナード",
      distanceM: sc(410),
    },
    {
      from: [652, 175],
      to: [760, 190],
      color: "#34A853",
      label: "高架下フラット連絡路",
      distanceM: sc(270),
    },
    {
      from: [760, 190],
      to: [818, 274],
      color: "#34A853",
      label: `${destination}北 フラットデッキ`,
      distanceM: sc(230),
    },
    {
      from: [818, 274],
      to: [822, 328],
      color: "#34A853",
      label: `${destination} 到着`,
      distanceM: sc(90),
    },
  ], false, "flat"));

  // 3. 雨よけモード (rain)
  const rainSegments = makeSegments(connectToEnd([
    {
      from: [135, 322],
      to: [188, 306],
      color: "#4285F4",
      label: `${origin} 地下コンコース`,
      distanceM: sc(120),
    },
    {
      from: [188, 306],
      to: [335, 264],
      color: "#4285F4",
      label: "屋内アーバンコア連絡通路",
      distanceM: sc(320),
    },
    {
      from: [335, 264],
      to: [472, 228],
      color: "#4285F4",
      label: validWaypoints[0] ? `${validWaypoints[0]} アーケード街` : "屋根付きアーケード歩道",
      distanceM: sc(310),
    },
    {
      from: [472, 228],
      to: [472, 194],
      color: "#4285F4",
      label: "中央地下連絡通路",
      distanceM: sc(90),
    },
    {
      from: [472, 194],
      to: [555, 215],
      color: "#4285F4",
      label: "地下シェルター回廊",
      distanceM: sc(220),
    },
    {
      from: [555, 215],
      to: [638, 274],
      color: "#4285F4",
      label: validWaypoints[1] ? `${validWaypoints[1]} 地下歩道` : "雨よけドーム通路",
      distanceM: sc(250),
    },
    {
      from: [638, 274],
      to: [818, 274],
      color: "#4285F4",
      label: `${destination} 直結地下プロムナード`,
      distanceM: sc(420),
    },
    {
      from: [818, 274],
      to: [822, 328],
      color: "#4285F4",
      label: `${destination} 直結口到着`,
      distanceM: sc(80),
    },
  ], false, "rain"));

  // 4. 最短モード (fast)
  const fastSegments = makeSegments(connectToEnd([
    {
      from: [135, 322],
      to: [188, 306],
      color: "#EA4335",
      label: `${origin} 直進入口`,
      distanceM: sc(110),
    },
    {
      from: [188, 306],
      to: [335, 264],
      color: "#EA4335",
      label: isMountainOrLong ? "急勾配・峠直登区間" : "急坂直登ショートカット",
      distanceM: sc(340),
    },
    {
      from: [335, 264],
      to: [472, 228],
      color: "#EA4335",
      label: validWaypoints[0] ? `${validWaypoints[0]} 最短直進路` : "幹線通り最短直進",
      distanceM: sc(320),
    },
    {
      from: [472, 228],
      to: [588, 336],
      color: "#EA4335",
      label: "バイパス最短合流路",
      distanceM: sc(310),
    },
    {
      from: [588, 336],
      to: [680, 336],
      color: "#EA4335",
      label: validWaypoints[1] ? `${validWaypoints[1]} 直進区間` : "高速直進区間",
      distanceM: sc(240),
    },
    {
      from: [680, 336],
      to: [736, 358],
      color: "#EA4335",
      label: `${destination}手前 登坂路`,
      distanceM: sc(160),
    },
    {
      from: [736, 358],
      to: [822, 328],
      color: "#EA4335",
      label: `${destination} 正門到着`,
      distanceM: sc(210),
    },
  ], true, "fast"));

  const wpBadgeSuffix =
    validWaypoints.length > 0 ? `・経由${validWaypoints.length}` : "";

  // 逆転（環水公園→富山駅など）の場合のセグメント反転ヘルパー
  const reverseBuiltSegments = (segs: RouteSegment[]): RouteSegment[] => {
    return segs.slice().reverse().map((s, idx) => ({
      from: s.to,
      to: s.from,
      fromGeo: s.toGeo,
      toGeo: s.fromGeo,
      color: s.color,
      label: idx === 0
        ? `${origin} 出発`
        : idx === segs.length - 1
        ? `${destination} 到着`
        : s.label,
      distanceM: s.distanceM,
    }));
  };

  const finalHybridSegments = isReverseToyama ? reverseBuiltSegments(hybridSegments) : hybridSegments;
  const finalFlatSegments = isReverseToyama ? reverseBuiltSegments(flatSegments) : flatSegments;
  const finalRainSegments = isReverseToyama ? reverseBuiltSegments(rainSegments) : rainSegments;
  const finalFastSegments = isReverseToyama ? reverseBuiltSegments(fastSegments) : fastSegments;

  const effectiveElev = isReverseToyama ? lowElevArr.slice().reverse() : lowElevArr;
  const effectiveBaseElev = isReverseToyama ? baseElevArr.slice().reverse() : baseElevArr;

  const weather = computeWeatherForDateTime(targetDateTime, combinedText);

  const baselinePathGeo = finalFastSegments
    .map((s) => s.fromGeo)
    .concat([finalFastSegments[finalFastSegments.length - 1].toGeo]);

  // 比較用破線サブルート(altPath)も目的地座標に合わせて動的に生成
  const dynamicAltPath: [number, number][] = [
    finalFastSegments[0].from,
    ...finalFastSegments.map((s) => s.to),
  ];

  const getMidCalloutPos = (segs: RouteSegment[], offsetY = -22): { x: number; y: number } => {
    const midSeg = segs[Math.floor(segs.length / 2)] || segs[0];
    return {
      x: Math.round((midSeg.from[0] + midSeg.to[0]) / 2),
      y: Math.max(45, Math.round((midSeg.from[1] + midSeg.to[1]) / 2 + offsetY)),
    };
  };
  const hybridCalloutPos = getMidCalloutPos(finalHybridSegments, -24);
  const flatCalloutPos = getMidCalloutPos(finalFlatSegments, 24);
  const rainCalloutPos = getMidCalloutPos(finalRainSegments, -22);
  const fastCalloutPos = getMidCalloutPos(finalFastSegments, 22);

  const baselineMetrics = {
    distance_meters: Math.round(baseKm * 0.82 * 1000),
    duration_seconds: Math.max(8, Math.round(baseMin * 0.8)) * 60,
    encoded_polyline: "",
    path: baselinePathGeo,
    elevation_gain_meters: peakElevM,
    warnings: [],
  };

  return {
    hybrid: {
      id: "hybrid",
      modeLabel: isLoopWalk ? `水辺・環水公園周回` : "複合",
      durationText: formatDuration(baseMin),
      totalMinutes: baseMin,
      distanceText: `${baseKm.toFixed(1)}km`,
      totalKm: baseKm,
      summaryBadge: isLoopWalk
        ? `${origin}発着・運河と美術館をめぐる${baseMin}分ループ`
        : `${isMountainOrLong ? "トンネル＋緩坂" : "地下＋裏道＋EV"}${wpBadgeSuffix}`,
      badgeColor: "#34A853",
      slopeSaveLabel: isLoopWalk ? "分速75m基準・平坦" : isMountainOrLong ? "山越え勾配72%減" : "1/4に軽減",
      oldElevText: `${peakElevM}m`,
      newElevText: `${reducedElevM}m`,
      callout: {
        x: hybridCalloutPos.x,
        y: hybridCalloutPos.y,
        text: isLoopWalk
          ? "コース1: 水辺・環水公園・美術館周回"
          : validWaypoints.length > 0
          ? `${validWaypoints.join("・")} 経由＋坂回避`
          : isMountainOrLong
          ? "トンネル＋緩勾配バイパス"
          : "地下＋裏道＋坂回避EV",
        dotColor: "#34A853",
      },
      altPath: dynamicAltPath,
      segments: finalHybridSegments,
      waypointPins: buildWaypointPins(finalHybridSegments, "hybrid"),
      mapLabels: dynamicLabels,
      elevProfile: effectiveElev,
      baseElevProfile: effectiveBaseElev,
      weatherForecast: weather,
      congestionStatus: computeCongestionForDateTime(targetDateTime, "hybrid"),
      baseline: baselineMetrics,
    },
    flat: {
      id: "flat",
      modeLabel: isLoopWalk ? `城址公園・カフェ街周回` : "坂なし",
      durationText: formatDuration(isLoopWalk ? baseMin + 2 : Math.round(baseMin * 1.08)),
      totalMinutes: isLoopWalk ? baseMin + 2 : Math.round(baseMin * 1.08),
      distanceText: `${(isLoopWalk ? baseKm * 1.05 : baseKm * 1.06).toFixed(1)}km`,
      totalKm: Number((isLoopWalk ? baseKm * 1.05 : baseKm * 1.06).toFixed(1)),
      summaryBadge: isLoopWalk
        ? `${origin}発着・お堀沿いと総曲輪カフェをめぐる一周`
        : `完全フラット優先${wpBadgeSuffix}`,
      badgeColor: "#34A853",
      slopeSaveLabel: isLoopWalk ? "ゆったり散策ペース" : isMountainOrLong ? "峠道を完全迂回" : "1/5に軽減",
      oldElevText: `${peakElevM}m`,
      newElevText: `${Math.max(5, Math.round(reducedElevM * 0.78))}m`,
      callout: {
        x: flatCalloutPos.x,
        y: flatCalloutPos.y,
        text: isLoopWalk
          ? "コース2: 富山城址公園・松川・カフェ街周回"
          : isMountainOrLong
          ? "山越え回避・平坦バイパス"
          : "遊歩道＋スロープ＋EV直結",
        dotColor: "#34A853",
      },
      altPath: dynamicAltPath,
      segments: finalFlatSegments,
      waypointPins: buildWaypointPins(finalFlatSegments, "flat"),
      mapLabels: dynamicLabels,
      elevProfile: effectiveElev.map((v) => Math.max(14, Math.round(v * 0.85))),
      baseElevProfile: effectiveBaseElev,
      weatherForecast: weather,
      congestionStatus: computeCongestionForDateTime(targetDateTime, "flat"),
      baseline: baselineMetrics,
    },
    rain: {
      id: "rain",
      modeLabel: isLoopWalk ? `アーケード・寺社裏通り周回` : "雨よけ",
      durationText: formatDuration(isLoopWalk ? Math.max(12, baseMin - 1) : Math.max(10, Math.round(baseMin * 0.96))),
      totalMinutes: isLoopWalk ? Math.max(12, baseMin - 1) : Math.max(10, Math.round(baseMin * 0.96)),
      distanceText: `${(isLoopWalk ? baseKm * 0.96 : baseKm * 0.95).toFixed(1)}km`,
      totalKm: Number((isLoopWalk ? baseKm * 0.96 : baseKm * 0.95).toFixed(1)),
      summaryBadge: isLoopWalk
        ? `${origin}発着・屋根付き商店街と日枝神社・ガラス美術館一周`
        : `地下・屋根85%${wpBadgeSuffix}`,
      badgeColor: "#4285F4",
      slopeSaveLabel: isLoopWalk ? "雨の日・日差し対策にも最適" : "雨濡れ85%減",
      oldElevText: `${peakElevM}m`,
      newElevText: `${Math.round(reducedElevM * 1.25)}m`,
      callout: {
        x: rainCalloutPos.x,
        y: rainCalloutPos.y,
        text: isLoopWalk
          ? "コース3: 総曲輪アーケード・日枝神社周回"
          : `${origin}〜${destination} 地下・屋根連絡`,
        dotColor: "#4285F4",
      },
      altPath: dynamicAltPath,
      segments: finalRainSegments,
      waypointPins: buildWaypointPins(finalRainSegments, "rain"),
      mapLabels: dynamicLabels,
      elevProfile: effectiveElev.map((v) => Math.round(v * 1.1)),
      baseElevProfile: effectiveBaseElev,
      weatherForecast: weather,
      congestionStatus: computeCongestionForDateTime(targetDateTime, "rain"),
      baseline: baselineMetrics,
    },
    fast: {
      id: "fast",
      modeLabel: isLoopWalk ? `リバーサイド・大通り快走周回` : "最短",
      durationText: formatDuration(isLoopWalk ? Math.max(10, Math.round(baseMin * 0.88)) : Math.max(8, Math.round(baseMin * 0.8))),
      totalMinutes: isLoopWalk ? Math.max(10, Math.round(baseMin * 0.88)) : Math.max(8, Math.round(baseMin * 0.8)),
      distanceText: `${(isLoopWalk ? baseKm * 0.92 : baseKm * 0.82).toFixed(1)}km`,
      totalKm: Number((isLoopWalk ? baseKm * 0.92 : baseKm * 0.82).toFixed(1)),
      summaryBadge: isLoopWalk
        ? `${origin}発着・信号が少なく見通しの良い広幅歩道ループ`
        : `最短直進ルート${wpBadgeSuffix}`,
      badgeColor: "#EA4335",
      slopeSaveLabel: isLoopWalk ? "分速80m・早歩き運動向け" : `最短 -${Math.max(3, Math.round(baseMin * 0.2))}分短縮`,
      oldElevText: `${peakElevM}m`,
      newElevText: `${peakElevM}m`,
      callout: {
        x: fastCalloutPos.x,
        y: fastCalloutPos.y,
        text: isLoopWalk
          ? "コース4: 神通川・ブールバール大通り快走周回"
          : `${origin}〜${destination} 最短直進`,
        dotColor: "#EA4335",
      },
      altPath: dynamicAltPath,
      segments: finalFastSegments,
      waypointPins: buildWaypointPins(finalFastSegments, "fast"),
      mapLabels: dynamicLabels,
      elevProfile: effectiveBaseElev,
      baseElevProfile: lowElevArr,
      weatherForecast: weather,
      congestionStatus: computeCongestionForDateTime(targetDateTime, "fast"),
      baseline: baselineMetrics,
    },
  };
}

export const ROUTE_MODES: Record<RouteModeId, ComputedRoute> = buildDynamicRoutes(
  "富山駅",
  [],
  "富岩運河環水公園"
);

/**
 * 任意のComputedRoute（AI提案ルート、動的ルート等）の経路セグメント・地点列を前後逆転したルートを生成
 */
export function reverseComputedRoute(route: ComputedRoute): ComputedRoute {
  const reversedSegments: RouteSegment[] = route.segments.slice().reverse().map((seg, idx) => ({
    ...seg,
    from: seg.to,
    to: seg.from,
    fromGeo: seg.toGeo,
    toGeo: seg.fromGeo,
    label: idx === 0
      ? `${route.modeLabel}（逆順）出発`
      : idx === route.segments.length - 1
      ? `${route.modeLabel}（逆順）到着`
      : seg.label,
  }));

  const reversedWaypoints = route.apiData?.waypoints
    ? [...route.apiData.waypoints].reverse()
    : undefined;

  const reversedPath = route.apiData?.metrics?.path
    ? [...route.apiData.metrics.path].reverse()
    : undefined;

  return {
    ...route,
    segments: reversedSegments,
    elevProfile: route.elevProfile ? [...route.elevProfile].reverse() : route.elevProfile,
    baseElevProfile: route.baseElevProfile ? [...route.baseElevProfile].reverse() : route.baseElevProfile,
    apiData: route.apiData
      ? {
          ...route.apiData,
          waypoints: reversedWaypoints || route.apiData.waypoints,
          metrics: {
            ...route.apiData.metrics,
            path: reversedPath || route.apiData.metrics.path,
          },
        }
      : undefined,
  };
}


