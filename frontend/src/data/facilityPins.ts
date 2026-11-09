import { CITY_BLOCKS, ROAD_NETWORK } from "./complexRoutes";
import { xyToGeo } from "./walkrealData";

export type FacilityCategory =
  | "cafe"
  | "park"
  | "museum"
  | "station"
  | "shrine"
  | "landmark"
  | "custom";

export interface MapFacilityPin {
  id: string;
  name: string;
  category: FacilityCategory;
  categoryLabel: string;
  description: string;
  x: number;
  y: number;
  lat: number;
  lng: number;
  isCustomDrop?: boolean;
}

// 富山市街の主要施設ピン（Google Maps実測座標とベクター道路網座標を完全同期）
export const MAP_FACILITY_PINS: MapFacilityPin[] = [
  {
    id: "poi-toyama-sta",
    name: "富山駅",
    category: "station",
    categoryLabel: "駅・ターミナル",
    description: "北陸新幹線・あいの風とやま鉄道・路面電車が集まる富山の玄関口",
    x: 135,
    y: 322,
    lat: 36.7013,
    lng: 137.2133,
  },
  {
    id: "poi-kansui-park",
    name: "富岩運河環水公園",
    category: "park",
    categoryLabel: "水辺公園",
    description: "天門橋と立山連峰の眺望が広がる富山屈指の美しい水辺散策路",
    x: 822,
    y: 328,
    lat: 36.7088,
    lng: 137.2141,
  },
  {
    id: "poi-starbucks-kansui",
    name: "環水公園 カフェテラス",
    category: "cafe",
    categoryLabel: "カフェ・ロースタリー",
    description: "運河と芝生を眺めながらひと息つける水辺のガラス張りカフェ",
    x: 760,
    y: 190,
    lat: 36.7075,
    lng: 137.2128,
  },
  {
    id: "poi-art-museum",
    name: "富山県美術館",
    category: "museum",
    categoryLabel: "美術館・展望",
    description: "アート鑑賞と屋上庭園「オノマトペの屋上」が楽しめる人気スポット",
    x: 652,
    y: 175,
    lat: 36.7095,
    lng: 137.2085,
  },
  {
    id: "poi-toyama-castle",
    name: "富山城址公園",
    category: "landmark",
    categoryLabel: "史跡・公園",
    description: "お堀と石垣、松川べりの並木道が美しい街なかの歴史公園",
    x: 335,
    y: 264,
    lat: 36.6933,
    lng: 137.2105,
  },
  {
    id: "poi-sogawa-base",
    name: "総曲輪通り カフェ街",
    category: "cafe",
    categoryLabel: "商店街・カフェ",
    description: "屋根付きアーケードと路地裏のこだわり珈琲店が集まる散策エリア",
    x: 412,
    y: 312,
    lat: 36.6908,
    lng: 137.2135,
  },
  {
    id: "poi-glass-museum",
    name: "富山市ガラス美術館",
    category: "museum",
    categoryLabel: "美術館・図書館",
    description: "隈研吾氏設計の木のぬくもりあふれる複合文化施設（TOYAMAキラリ）",
    x: 472,
    y: 228,
    lat: 36.6915,
    lng: 137.2155,
  },
  {
    id: "poi-hie-shrine",
    name: "日枝神社",
    category: "shrine",
    categoryLabel: "神社・寺社",
    description: "街なかの静寂に包まれた歴史ある参道と境内（山王さん）",
    x: 588,
    y: 336,
    lat: 36.6898,
    lng: 137.2182,
  },
];

/**
 * ルート計算時に、指定された座標 (x, y) から最も近い道路上の座標 (snappedX, snappedY) を算出する関数
 * （ピン自体の位置は移動させず、ルートの終点のみを最寄り道路へスナップするために使用）
 */
export function snapToNearestRoadXY(
  x: number,
  y: number
): {
  snappedX: number;
  snappedY: number;
  distancePx: number;
  wasSnapped: boolean;
  isInsideBuilding: boolean;
} {
  let minDistance = Infinity;
  let bestX = x;
  let bestY = y;
  let bestRoadWidth = 16;

  for (const road of ROAD_NETWORK) {
    const pts = road.pts;
    for (let i = 0; i < pts.length - 1; i++) {
      const [x1, y1] = pts[i];
      const [x2, y2] = pts[i + 1];

      // 線分上の最近接点 (垂線の足) を計算
      const dx = x2 - x1;
      const dy = y2 - y1;
      const lenSq = dx * dx + dy * dy;

      let t = 0;
      if (lenSq > 0) {
        t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / lenSq));
      }

      const projX = x1 + t * dx;
      const projY = y1 + t * dy;
      const dist = Math.hypot(x - projX, y - projY);

      if (dist < minDistance) {
        minDistance = dist;
        bestX = projX;
        bestY = projY;
        bestRoadWidth = road.width || 16;
      }
    }
  }

  // 街区ビル内（私有地）に刺さったかの判定
  let isInsideBuilding = false;
  for (const block of CITY_BLOCKS) {
    if (
      x >= block.x &&
      x <= block.x + block.w &&
      y >= block.y &&
      y <= block.y + block.h
    ) {
      isInsideBuilding = true;
      break;
    }
  }

  // 道路幅の半分より外側にあれば「道路外（敷地内や水上など）」とみなして公道中心へスナップ
  const roadHalfWidth = bestRoadWidth / 2;
  const wasSnapped = isInsideBuilding || minDistance > roadHalfWidth + 2;

  return {
    snappedX: Math.round(bestX),
    snappedY: Math.round(bestY),
    distancePx: Math.round(minDistance),
    wasSnapped,
    isInsideBuilding,
  };
}

/**
 * 任意の長押し／右クリック地点からドロップピン情報を生成
 */
export function buildDroppedPinInfo(
  x: number,
  y: number,
  customGeo?: { lat: number; lng: number }
): MapFacilityPin {
  const geo = customGeo || xyToGeo([x, y]);

  return {
    id: `dropped-pin-${Date.now()}`,
    name: "指定した地点",
    category: "custom",
    categoryLabel: "指定した地点",
    description: `緯度 ${geo.lat.toFixed(5)} / 経度 ${geo.lng.toFixed(5)}`,
    x: Math.round(x),
    y: Math.round(y),
    lat: geo.lat,
    lng: geo.lng,
    isCustomDrop: true,
  };
}
