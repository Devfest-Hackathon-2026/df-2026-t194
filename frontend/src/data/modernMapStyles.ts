// ミニマル・モダンテーマ向けの Google Maps ダークモードスタイル設定
// Tailwind zinc/slate (深みのあるダークスレート・チャコール) に馴染む洗練されたミニマル配色

export const modernDarkMapStyle: google.maps.MapTypeStyle[] = [
  // 1. 全体ベース（ダークチャコール #212124）
  {
    elementType: "geometry",
    stylers: [{ color: "#212124" }],
  },
  {
    elementType: "labels.icon",
    stylers: [{ visibility: "on" }],
  },
  {
    elementType: "labels.text.fill",
    stylers: [{ color: "#9ca3af" }],
  },
  {
    elementType: "labels.text.stroke",
    stylers: [{ color: "#18181b" }, { weight: 3 }],
  },
  // 2. 行政区画・市区町村
  {
    featureType: "administrative",
    elementType: "geometry",
    stylers: [{ color: "#3f3f46" }],
  },
  {
    featureType: "administrative.country",
    elementType: "labels.text.fill",
    stylers: [{ color: "#d1d5db" }],
  },
  {
    featureType: "administrative.locality",
    elementType: "labels.text.fill",
    stylers: [{ color: "#f3f4f6" }],
  },
  // 3. POI・施設・公園
  {
    featureType: "poi",
    elementType: "geometry",
    stylers: [{ color: "#27272a" }],
  },
  {
    featureType: "poi",
    elementType: "labels.text.fill",
    stylers: [{ color: "#71717a" }],
  },
  {
    featureType: "poi.park",
    elementType: "geometry.fill",
    stylers: [{ color: "#142820" }], // 落ち着いたダークフォレストグリーン
  },
  {
    featureType: "poi.park",
    elementType: "labels.text.fill",
    stylers: [{ color: "#4ade80" }, { lightness: -20 }],
  },
  // 4. 水域（深いダークネイビー #0f172a）
  {
    featureType: "water",
    elementType: "geometry",
    stylers: [{ color: "#0f172a" }],
  },
  {
    featureType: "water",
    elementType: "labels.text.fill",
    stylers: [{ color: "#64748b" }],
  },
  {
    featureType: "water",
    elementType: "labels.text.stroke",
    stylers: [{ color: "#0a0f1d" }],
  },
  // 5. 道路（ハイウェイ・幹線道路・生活道路）
  {
    featureType: "road",
    elementType: "geometry",
    stylers: [{ color: "#2d2d32" }],
  },
  {
    featureType: "road",
    elementType: "geometry.stroke",
    stylers: [{ color: "#1c1c1f" }],
  },
  {
    featureType: "road",
    elementType: "labels.text.fill",
    stylers: [{ color: "#9ca3af" }],
  },
  {
    featureType: "road.highway",
    elementType: "geometry",
    stylers: [{ color: "#3f3f46" }], // 高速は明るめのzinc-700
  },
  {
    featureType: "road.highway",
    elementType: "geometry.stroke",
    stylers: [{ color: "#27272a" }],
  },
  {
    featureType: "road.highway",
    elementType: "labels.text.fill",
    stylers: [{ color: "#e4e4e7" }],
  },
  {
    featureType: "road.arterial",
    elementType: "geometry",
    stylers: [{ color: "#323238" }],
  },
  // 6. 交通機関（鉄道・駅）
  {
    featureType: "transit",
    elementType: "geometry",
    stylers: [{ color: "#242429" }],
  },
  {
    featureType: "transit.station",
    elementType: "labels.text.fill",
    stylers: [{ color: "#a1a1aa" }],
  },
];
