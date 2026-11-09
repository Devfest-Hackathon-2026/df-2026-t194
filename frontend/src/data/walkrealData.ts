import { getWalkPath, getSanpoRouteStops } from "@/services/sanpoGeometry";
import {
  WalkRealPhotoSnap,
  WalkRealRoutePost,
} from "@/types/walkreal";
import { ROAD_NETWORK } from "@/data/complexRoutes";
import {
  ComputedRoute,
  PlaceStop,
  RouteSegment,
  SegmentColor,
} from "@/types/route";

// ベクター座標(0..1000, 0..620)から実緯度経度へ変換（富山市街エリア基準）
export function xyToGeo(pt: [number, number]): { lat: number; lng: number } {
  // 富山駅[135, 322] (36.7013, 137.2133) と環水公園[822, 328] (36.7088, 137.2141) を基準にした精密変換
  const normX = (pt[0] - 135) / (822 - 135);
  const normY = (pt[1] - 322) / 300;
  const lat = 36.7013 + normX * 0.0075 - normY * 0.0105;
  const lng = 137.2133 + normX * 0.0008 + normY * 0.0035;
  return { lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)) };
}

// 実緯度経度からベクター座標(0..1000, 0..620)へ逆変換（富山市街エリア基準）
export function geoToXY(geo: { lat: number; lng: number }): [number, number] {
  const dLat = geo.lat - 36.7013;
  const dLng = geo.lng - 137.2133;
  // 逆行列計算による座標特定
  const normX = Math.max(-0.2, Math.min(1.2, (dLat * 0.0035 + dLng * 0.0105) / (0.0075 * 0.0035 + 0.0008 * 0.0105)));
  const normY = Math.max(-0.8, Math.min(1.2, (dLng * 0.0075 - dLat * 0.0008) / (0.0075 * 0.0035 + 0.0008 * 0.0105)));
  const x = Math.round(135 + normX * (822 - 135));
  const y = Math.round(322 + normY * 300);
  return [
    Math.max(40, Math.min(960, x)),
    Math.max(40, Math.min(580, y)),
  ];
}

// 無加工風リアル街角スナップSVGデータURI生成（オフラインでも100%美しく表示される高精細シーン）
function makeStreetSnapSvg(opts: {
  bgGrad: [string, string, string];
  title: string;
  sub: string;
  time: string;
  accent: string;
  sceneType: "alley" | "cafe" | "park" | "tower" | "shrine" | "night" | "rooftop" | "book";
}): string {
  const { bgGrad, title, sub, time, accent, sceneType } = opts;

  let sceneDecor = "";
  if (sceneType === "alley") {
    sceneDecor = `
      <!-- 路地裏の建物シルエットと電線・看板 -->
      <polygon points="0,0 130,0 130,300 0,300" fill="#1e293b" opacity="0.78"/>
      <polygon points="270,0 400,0 400,300 270,300" fill="#0f172a" opacity="0.82"/>
      <polygon points="0,300 130,220 270,220 400,300" fill="#334155" opacity="0.9"/>
      <line x1="130" y1="220" x2="270" y2="220" stroke="#94a3b8" stroke-width="1.5" opacity="0.5"/>
      <line x1="0" y1="65" x2="400" y2="95" stroke="#0f172a" stroke-width="2" opacity="0.6"/>
      <line x1="0" y1="80" x2="400" y2="50" stroke="#0f172a" stroke-width="1.5" opacity="0.5"/>
      <rect x="92" y="110" width="32" height="58" rx="4" fill="${accent}" opacity="0.9"/>
      <rect x="276" y="130" width="28" height="44" rx="4" fill="#fbbf24" opacity="0.85"/>
      <circle cx="200" cy="175" r="26" fill="${accent}" opacity="0.22"/>
      <!-- 石畳の反射 -->
      <line x1="175" y1="245" x2="225" y2="245" stroke="#cbd5e1" stroke-width="2" opacity="0.4"/>
      <line x1="160" y1="270" x2="240" y2="270" stroke="#cbd5e1" stroke-width="2" opacity="0.35"/>
    `;
  } else if (sceneType === "cafe") {
    sceneDecor = `
      <!-- テラスカフェと観葉植物・コーヒーカップ -->
      <rect x="30" y="60" width="340" height="190" rx="18" fill="#1c1917" opacity="0.55"/>
      <circle cx="310" cy="95" r="45" fill="#fbbf24" opacity="0.25"/>
      <ellipse cx="200" cy="235" rx="115" ry="38" fill="#78350f" opacity="0.85"/>
      <ellipse cx="200" cy="230" rx="110" ry="34" fill="#b45309" opacity="0.9"/>
      <!-- コーヒーカップ -->
      <rect x="172" y="178" width="56" height="44" rx="10" fill="#ffffff"/>
      <path d="M 228,188 A 12,12 0 0,1 228,212" fill="none" stroke="#ffffff" stroke-width="6"/>
      <ellipse cx="200" cy="182" rx="22" ry="7" fill="#92400e"/>
      <path d="M 192,162 Q 198,150 192,140" fill="none" stroke="#ffffff" stroke-width="2.5" opacity="0.7" stroke-linecap="round"/>
      <path d="M 208,160 Q 214,148 208,136" fill="none" stroke="#ffffff" stroke-width="2.5" opacity="0.7" stroke-linecap="round"/>
    `;
  } else if (sceneType === "park") {
    sceneDecor = `
      <!-- 公園の並木道と木漏れ日 -->
      <circle cx="85" cy="95" r="75" fill="#15803d" opacity="0.75"/>
      <circle cx="315" cy="85" r="85" fill="#166534" opacity="0.75"/>
      <circle cx="200" cy="60" r="65" fill="#22c55e" opacity="0.55"/>
      <polygon points="155,210 245,210 330,300 70,300" fill="#d6d3d1" opacity="0.85"/>
      <circle cx="230" cy="110" r="35" fill="#fef08a" opacity="0.35"/>
      <circle cx="170" cy="145" r="18" fill="#fef08a" opacity="0.3"/>
    `;
  } else if (sceneType === "tower") {
    sceneDecor = `
      <!-- 坂道から見える東京タワー/高層ビル -->
      <polygon points="188,45 212,45 232,235 168,235" fill="#ef4444" opacity="0.88"/>
      <rect x="182" y="115" width="36" height="12" rx="3" fill="#ffffff" opacity="0.9"/>
      <rect x="174" y="175" width="52" height="14" rx="3" fill="#ffffff" opacity="0.9"/>
      <line x1="200" y1="15" x2="200" y2="45" stroke="#ffffff" stroke-width="4"/>
      <polygon points="0,140 135,140 135,300 0,300" fill="#0f172a" opacity="0.75"/>
      <polygon points="265,120 400,120 400,300 265,300" fill="#1e293b" opacity="0.8"/>
    `;
  } else if (sceneType === "shrine") {
    sceneDecor = `
      <!-- 神社・鳥居と参道の緑 -->
      <rect x="95" y="75" width="210" height="16" rx="4" fill="#dc2626"/>
      <rect x="115" y="102" width="170" height="12" rx="3" fill="#b91c1c"/>
      <rect x="130" y="85" width="16" height="165" fill="#dc2626"/>
      <rect x="254" y="85" width="16" height="165" fill="#dc2626"/>
      <circle cx="70" cy="120" r="60" fill="#065f46" opacity="0.7"/>
      <circle cx="330" cy="120" r="60" fill="#065f46" opacity="0.7"/>
    `;
  } else if (sceneType === "night") {
    sceneDecor = `
      <!-- 夜景・ネオンと街灯のボケ光 -->
      <circle cx="110" cy="130" r="32" fill="#f43f5e" opacity="0.45"/>
      <circle cx="280" cy="110" r="42" fill="#38bdf8" opacity="0.4"/>
      <circle cx="210" cy="160" r="28" fill="#fbbf24" opacity="0.5"/>
      <circle cx="155" cy="195" r="20" fill="#a855f7" opacity="0.45"/>
      <circle cx="255" cy="185" r="24" fill="#34d399" opacity="0.4"/>
      <polygon points="40,220 360,220 400,300 0,300" fill="#090d16" opacity="0.85"/>
    `;
  } else if (sceneType === "rooftop") {
    sceneDecor = `
      <!-- 夕暮れのルーフトップと都市スカイライン -->
      <circle cx="290" cy="95" r="38" fill="#fb923c" opacity="0.8"/>
      <rect x="30" y="155" width="48" height="95" fill="#1e293b" opacity="0.85"/>
      <rect x="85" y="130" width="55" height="120" fill="#0f172a" opacity="0.85"/>
      <rect x="150" y="168" width="45" height="82" fill="#334155" opacity="0.85"/>
      <rect x="210" y="142" width="60" height="108" fill="#1e293b" opacity="0.85"/>
      <rect x="280" y="160" width="85" height="90" fill="#0f172a" opacity="0.85"/>
    `;
  } else {
    sceneDecor = `
      <!-- 蔦屋書店・ギャラリー建築風 -->
      <rect x="55" y="80" width="290" height="150" rx="14" fill="#1e293b" opacity="0.8"/>
      <rect x="75" y="98" width="75" height="110" rx="6" fill="#fef3c7" opacity="0.75"/>
      <rect x="162" y="98" width="75" height="110" rx="6" fill="#fde68a" opacity="0.8"/>
      <rect x="250" y="98" width="75" height="110" rx="6" fill="#fef3c7" opacity="0.75"/>
    `;
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" width="400" height="300">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${bgGrad[0]}"/>
        <stop offset="55%" stop-color="${bgGrad[1]}"/>
        <stop offset="100%" stop-color="${bgGrad[2]}"/>
      </linearGradient>
    </defs>
    <rect width="400" height="300" fill="url(#g)"/>
    ${sceneDecor}
    <!-- BeReal風 下部グラデーションオーバーレイ -->
    <rect x="0" y="195" width="400" height="105" fill="#000000" opacity="0.52"/>
    <!-- タイムスタンプ & 無加工RAWタグ -->
    <rect x="14" y="14" width="124" height="24" rx="12" fill="#000000" opacity="0.65"/>
    <circle cx="28" cy="26" r="4.5" fill="#22c55e"/>
    <text x="38" y="30" fill="#ffffff" font-family="sans-serif" font-size="11" font-weight="bold">NO FILTER · ${time}</text>
    <!-- スポットタイトル & サブキャプション -->
    <text x="18" y="252" fill="#ffffff" font-family="sans-serif" font-size="18" font-weight="900">${title}</text>
    <text x="18" y="276" fill="#e2e8f0" font-family="sans-serif" font-size="12" font-weight="600">${sub}</text>
  </svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

// 2地点間の実地表面距離（メートル）を算出（Haversine式）
export function computeGeoDistanceMeters(
  p1: { lat: number; lng: number },
  p2: { lat: number; lng: number }
): number {
  if (!p1 || !p2 || (p1.lat === p2.lat && p1.lng === p2.lng)) return 0;
  const R = 6371000; // 地球半径(m)
  const dLat = ((p2.lat - p1.lat) * Math.PI) / 180;
  const dLng = ((p2.lng - p1.lng) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((p1.lat * Math.PI) / 180) *
      Math.cos((p2.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// 2点間または複数スナップ間を緩やかな街路風カーブで補間し、実地理座標とベクター座標の両方を自動生成する関数
export function autoConnectSnapPoints(
  snaps: Array<{ x: number; y: number; lat: number; lng: number }>
): {
  pathXY: [number, number][];
  pathGeo: { lat: number; lng: number }[];
  distanceKm: number;
  durationMin: number;
  elevationGainM: number;
} {
  if (snaps.length === 0) {
    return {
      pathXY: [],
      pathGeo: [],
      distanceKm: 0,
      durationMin: 0,
      elevationGainM: 0,
    };
  }

  if (snaps.length === 1) {
    const s0 = snaps[0];
    const geo = s0.lat && s0.lng ? { lat: s0.lat, lng: s0.lng } : xyToGeo([s0.x, s0.y]);
    return {
      pathXY: [[s0.x, s0.y]],
      pathGeo: [geo],
      distanceKm: 0.1,
      durationMin: 2,
      elevationGainM: 2,
    };
  }

  // 実座標のリストを準備
  const fullGeo: { lat: number; lng: number }[] = [];

  for (let i = 0; i < snaps.length; i++) {
    const curSnap = snaps[i];
    const curGeo =
      curSnap.lat && curSnap.lng
        ? { lat: curSnap.lat, lng: curSnap.lng }
        : xyToGeo([curSnap.x, curSnap.y]);

    fullGeo.push(curGeo);

    if (i < snaps.length - 1) {
      const nextSnap = snaps[i + 1];
      const nextGeo =
        nextSnap.lat && nextSnap.lng
          ? { lat: nextSnap.lat, lng: nextSnap.lng }
          : xyToGeo([nextSnap.x, nextSnap.y]);

      const dLat = nextGeo.lat - curGeo.lat;
      const dLng = nextGeo.lng - curGeo.lng;

      // 街区や曲がり角を模した2つの中間補間点を生成（直線ではなく実際の散歩道らしいカーブ）
      const mid1 = {
        lat: Number((curGeo.lat + dLat * 0.35 + dLng * 0.12).toFixed(6)),
        lng: Number((curGeo.lng + dLng * 0.35 - dLat * 0.12).toFixed(6)),
      };
      const mid2 = {
        lat: Number((curGeo.lat + dLat * 0.70 - dLng * 0.08).toFixed(6)),
        lng: Number((curGeo.lng + dLng * 0.70 + dLat * 0.08).toFixed(6)),
      };

      fullGeo.push(mid1, mid2);
    }
  }

  // 実緯度経度からベクターXYを逆算出
  const fullXY: [number, number][] = fullGeo.map((g) => geoToXY(g));

  // 総距離の計算（Haversine実地表面距離）
  let totalMeters = 0;
  for (let i = 0; i < fullGeo.length - 1; i++) {
    totalMeters += computeGeoDistanceMeters(fullGeo[i], fullGeo[i + 1]);
  }

  // 散歩ルートの距離（最低0.3km）と所要時間（時速4.5km = 1kmあたり約13.3分）
  const distanceKm = Number(Math.max(0.3, totalMeters / 1000).toFixed(1));
  const durationMin = Math.max(5, Math.round(distanceKm * 13.5));
  const elevationGainM = Math.max(2, Math.round(snaps.length * 3.5));

  return {
    pathXY: fullXY,
    pathGeo: fullGeo,
    distanceKm,
    durationMin,
    elevationGainM,
  };
}


// ルートの残り寿命（日数）を計算するヘルパー（基本14日 + 歩かれた数*2.5日 + いいね*0.3日 - 経過日数）
export function computeRouteTtlDays(
  daysElapsed: number,
  walkedCount: number,
  likesCount: number
): number {
  const raw = 10 + walkedCount * 1.8 + likesCount * 0.25 - daysElapsed;
  return Math.max(0, Math.min(30, Math.round(raw)));
}

// 初期散歩ルート投稿一覧（ユーザー自身が実際に追加・共有できるよう空配列で初期化）
export const INITIAL_WALKREAL_POSTS: WalkRealRoutePost[] = [];

// 新規撮影（Walk & Snap）時にワンタップで使えるリアルな無加工スナップ候補テンプレート（富山エリア）
export const SNAP_CAPTURE_TEMPLATES = [
  {
    spotName: "富山駅南口 キャノピー広場",
    caption: "新幹線改札を出てすぐ！開放的なガラス大屋根の下から散歩スタート",
    x: 475,
    y: 220,
    selfieImageUrl: "🚅😄",
    selfieLabel: "富山到着！",
    sceneType: "alley" as const,
    bgGrad: ["#0f172a", "#1e3a8a", "#38bdf8"] as [string, string, string],
    accent: "#38bdf8",
  },
  {
    spotName: "環水公園 天門橋展望デッキ",
    caption: "運河の向こうに雄大な立山連峰がくっきり！水鳥が泳ぐ癒やしの水辺",
    x: 493,
    y: 56,
    selfieImageUrl: "☕🏔️",
    selfieLabel: "絶景テラス席！",
    sceneType: "tower" as const,
    bgGrad: ["#1e1b4b", "#0369a1", "#38bdf8"] as [string, string, string],
    accent: "#38bdf8",
  },
  {
    spotName: "松川べり 彫刻の小道",
    caption: "桜並木の木漏れ日と静かなせせらぎ。川風が心地いい遊歩道",
    x: 410,
    y: 330,
    selfieImageUrl: "🌿😊",
    selfieLabel: "緑陰が涼しい",
    sceneType: "park" as const,
    bgGrad: ["#064e3b", "#059669", "#6ee7b7"] as [string, string, string],
    accent: "#34d399",
  },
  {
    spotName: "富山城址公園 千歳御門",
    caption: "前田家ゆかりの豪壮な総欅造りの御門と堀の緑がとても静か",
    x: 357,
    y: 376,
    selfieImageUrl: "🏯⛩️",
    selfieLabel: "歴史の風格！",
    sceneType: "shrine" as const,
    bgGrad: ["#451a03", "#78350f", "#d97706"] as [string, string, string],
    accent: "#f59e0b",
  },
  {
    spotName: "TOYAMAキラリ 光の吹き抜け",
    caption: "隈研吾建築の木とガラスが織りなす光の空間。圧倒的な美しさ！",
    x: 507,
    y: 461,
    selfieImageUrl: "🎨🤩",
    selfieLabel: "光が幻想的！",
    sceneType: "cafe" as const,
    bgGrad: ["#78350f", "#b45309", "#fcd34d"] as [string, string, string],
    accent: "#fbbf24",
  },
];

export function createSnapFromTemplate(
  order: number,
  templateIdx: number,
  customXY?: [number, number],
  customSpotName?: string,
  customCaption?: string
): WalkRealPhotoSnap {
  const tpl =
    SNAP_CAPTURE_TEMPLATES[templateIdx % SNAP_CAPTURE_TEMPLATES.length];
  const x = customXY ? customXY[0] : tpl.x;
  const y = customXY ? customXY[1] : tpl.y;
  const geo = xyToGeo([x, y]);

  const now = new Date();
  now.setMinutes(now.getMinutes() + (order - 1) * 14);
  const timeStr = `${String(now.getHours()).padStart(2, "0")}:${String(
    now.getMinutes()
  ).padStart(2, "0")}`;

  const spotName = customSpotName || tpl.spotName;
  const caption = customCaption || tpl.caption;

  return {
    id: `snap-user-${Date.now()}-${order}`,
    order,
    timestamp: timeStr,
    spotName,
    caption,
    x,
    y,
    lat: geo.lat,
    lng: geo.lng,
    mainImageUrl: makeStreetSnapSvg({
      bgGrad: tpl.bgGrad,
      title: `${order}. ${spotName.slice(0, 14)}`,
      sub: `${timeStr} 撮影 · GPS位置ロック済`,
      time: timeStr,
      accent: tpl.accent,
      sceneType: tpl.sceneType,
    }),
    selfieImageUrl: tpl.selfieImageUrl,
    selfieLabel: tpl.selfieLabel,
    exifInfo: `24mm f/1.8 · 無加工RAW · (${geo.lat.toFixed(4)}, ${geo.lng.toFixed(4)})`,
    weatherTag: "☀️ 21℃",
  };
}

export interface InitialDraftRoute {
  title: string;
  summary: string;
  areaLabel: string;
  distanceKm: number;
  durationMin: number;
  pathGeo: { lat: number; lng: number }[];
  snaps: WalkRealPhotoSnap[];
}

export function createDraftFromComputedRoute(
  route: ComputedRoute,
  origin: string,
  destination: string
): InitialDraftRoute {
  const title =
    route.apiData?.title ||
    route.modeLabel ||
    `${origin || "富山"}〜${destination || "目的地"} 散歩コース`;
  const summary =
    route.apiData?.concept ||
    route.summaryBadge ||
    "AIが探索・提案した散歩コースです。";
  const areaLabel = `${origin || "出発地"}〜${destination || "目的地"}`;
  const distKm =
    route.totalKm != null
      ? route.totalKm
      : Number(
          (
            (route.apiData?.metrics?.distance_meters ?? 1200) /
            1000
          ).toFixed(1)
        );
  const durMin = route.apiData?.metrics?.duration_seconds
    ? Math.max(5, Math.round(route.apiData.metrics.duration_seconds / 60))
    : route.totalMinutes || 15;

  // 経路の緯度経度リスト
  const pathGeo: { lat: number; lng: number }[] =
    route.apiData?.metrics?.path && route.apiData.metrics.path.length > 0
      ? route.apiData.metrics.path
      : route.segments.flatMap((s, idx) =>
          idx === route.segments.length - 1 && s.toGeo
            ? [s.fromGeo, s.toGeo]
            : [s.fromGeo]
        );

  // 経由地・立ち寄りスポットからスナップを自動作成（2〜5箇所）
  const stops: { name: string; lat: number; lng: number; reason?: string }[] = [];
  if (route.apiData?.waypoints && route.apiData.waypoints.length > 0) {
    route.apiData.waypoints.forEach((wp) => {
      stops.push({ name: wp.name, lat: wp.lat, lng: wp.lng, reason: wp.reason });
    });
  } else if (route.segments && route.segments.length > 0) {
    const first = route.segments[0];
    const last = route.segments[route.segments.length - 1];
    if (first.fromGeo) stops.push({ name: origin || "出発地", ...first.fromGeo });
    route.segments.forEach((seg, idx) => {
      if (idx % 2 === 1 && seg.toGeo) {
        stops.push({ name: seg.label || `道中スポット ${idx + 1}`, ...seg.toGeo });
      }
    });
    if (last.toGeo) stops.push({ name: destination || "目的地", ...last.toGeo });
  }

  // 写真スナップはダミーを勝手に生成せず、完歩後にユーザーが撮影した写真をアップロードする
  const snaps: WalkRealPhotoSnap[] = [];

  return {
    title,
    summary,
    areaLabel,
    distanceKm: distKm,
    durationMin: durMin,
    pathGeo,
    snaps,
  };
}

export function createComputedRouteFromSanpoPost(
  post: WalkRealRoutePost
): ComputedRoute {
  const waypoints: PlaceStop[] = getSanpoRouteStops(post).map((s) => ({
    name: s.name,
    lat: s.lat,
    lng: s.lng,
    reason: s.reason,
    tags: [],
    place_id: null,
    address: null,
    rating: null,
    open_now: null,
  }));

  const segments: RouteSegment[] = [];
  if (post.snaps.length >= 2) {
    for (let i = 0; i < post.snaps.length - 1; i++) {
      const s1 = post.snaps[i];
      const s2 = post.snaps[i + 1];
      segments.push({
        from: [s1.x, s1.y],
        to: [s2.x, s2.y],
        fromGeo: { lat: s1.lat, lng: s1.lng },
        toGeo: { lat: s2.lat, lng: s2.lng },
        color: (post.color as SegmentColor) || "#0284c7",
        label: s1.spotName,
        distanceM: Math.round(
          (post.distanceKm * 1000) / (post.snaps.length - 1)
        ),
      });
    }
  }

  return {
    id: "hybrid",
    modeLabel: post.title,
    durationText: `${post.durationMin}分`,
    distanceText: `${post.distanceKm.toFixed(1)}km`,
    totalKm: post.distanceKm,
    totalMinutes: post.durationMin,
    summaryBadge: post.tags.slice(0, 3).join("・") || "SANPOSHERE散歩コース",
    badgeColor: (post.color as SegmentColor) || "#0284c7",
    slopeSaveLabel: "実測散歩コース",
    oldElevText: "平坦",
    newElevText: `上り${post.elevationGainM}m`,
    callout: {
      x: 472,
      y: 180,
      text: post.title,
      dotColor: (post.color as SegmentColor) || "#0284c7",
    },
    altPath: [],
    segments,
    elevProfile: [],
    baseElevProfile: [],
    apiData: {
      route_id: post.id,
      title: post.title,
      concept: post.summary,
      travel_mode: "WALK",
      tags: post.tags,
      safety_note: null,
      fatigue_note: null,
      seasonal_weather_note: null,
      waypoints,
      metrics: {
        distance_meters: Math.round(post.distanceKm * 1000),
        duration_seconds: post.durationMin * 60,
        encoded_polyline: "",
        path: getWalkPath(post),
        elevation_gain_meters: post.elevationGainM,
        warnings: [],
        route_score: 95,
        score_reasons: ["コミュニティ公認散歩コース"],
      },
    },
    baseline: null,
  };
}

/**
 * 散歩コースの地点順序・座標列を逆順（逆向き）に反転した散歩コースを生成
 */
export function reverseSanpoPost(post: WalkRealRoutePost): WalkRealRoutePost {
  const reversedSnaps = [...post.snaps].reverse();
  const reversedPoints = post.photoPoints ? [...post.photoPoints].reverse() : undefined;
  const isAlreadyReversed = post.title.includes("（逆順）") || post.title.includes("(逆順)");
  const newTitle = isAlreadyReversed
    ? post.title.replace(/\s*[（(]逆順[）)]/, "").trim()
    : `${post.title} (逆順)`;

  return {
    ...post,
    id: post.id.endsWith("-rev") ? post.id.replace(/-rev$/, "") : `${post.id}-rev`,
    title: newTitle,
    snaps: reversedSnaps,
    ...(reversedPoints ? { photoPoints: reversedPoints } : {}),
  };
}
