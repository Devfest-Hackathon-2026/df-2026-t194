// 江戸時代・浮世絵・古地図をモチーフにした Google Maps スタイル設定

export const traditionalLightMapStyle: google.maps.MapTypeStyle[] = [
  // 1. 全体大地（和紙・鳥の子色の生成りセピア）
  {
    elementType: "geometry",
    stylers: [{ color: "#f5f0e3" }],
  },
  {
    elementType: "labels.text.stroke",
    stylers: [{ color: "#faf7f0" }, { weight: 3 }],
  },
  {
    elementType: "labels.text.fill",
    stylers: [{ color: "#3a3028" }],
  },
  // 2. 街区・行政区画
  {
    featureType: "administrative.locality",
    elementType: "labels.text.fill",
    stylers: [{ color: "#8a241c" }, { weight: 1.5 }], // 朱筆文字
  },
  {
    featureType: "administrative.neighborhood",
    elementType: "labels.text.fill",
    stylers: [{ color: "#544439" }],
  },
  // 3. 自然・公園（抹茶色・萌黄色・若草山水）
  {
    featureType: "poi.park",
    elementType: "geometry.fill",
    stylers: [{ color: "#d2dec2" }],
  },
  {
    featureType: "poi.park",
    elementType: "labels.text.fill",
    stylers: [{ color: "#3b542c" }],
  },
  {
    featureType: "poi",
    elementType: "geometry",
    stylers: [{ color: "#ebdcc9" }],
  },
  // 4. 水域（藍色・浅葱色・浮世絵の波）
  {
    featureType: "water",
    elementType: "geometry",
    stylers: [{ color: "#88adbf" }],
  },
  {
    featureType: "water",
    elementType: "labels.text.fill",
    stylers: [{ color: "#224759" }],
  },
  // 5. 道路・街道（五街道・朱赤と生成りの墨絵調）
  {
    featureType: "road",
    elementType: "geometry",
    stylers: [{ color: "#e4dac8" }],
  },
  {
    featureType: "road",
    elementType: "geometry.stroke",
    stylers: [{ color: "#c2b49e" }],
  },
  {
    featureType: "road.highway",
    elementType: "geometry",
    stylers: [{ color: "#c85244" }], // 主要街道は朱色
  },
  {
    featureType: "road.highway",
    elementType: "geometry.stroke",
    stylers: [{ color: "#993527" }],
  },
  {
    featureType: "road.highway",
    elementType: "labels.text.fill",
    stylers: [{ color: "#ffffff" }],
  },
  {
    featureType: "road.arterial",
    elementType: "geometry",
    stylers: [{ color: "#f2ebd9" }],
  },
  {
    featureType: "transit",
    elementType: "geometry",
    stylers: [{ color: "#cfc1aa" }],
  },
];

export const traditionalDarkMapStyle: google.maps.MapTypeStyle[] = [
  // 1. 全体大地（夜の江戸・濡羽色・漆黒）
  {
    elementType: "geometry",
    stylers: [{ color: "#181512" }],
  },
  {
    elementType: "labels.text.stroke",
    stylers: [{ color: "#0f0e0c" }, { weight: 2.5 }],
  },
  {
    elementType: "labels.text.fill",
    stylers: [{ color: "#d4caa7" }],
  },
  // 2. 行政区画
  {
    featureType: "administrative.locality",
    elementType: "labels.text.fill",
    stylers: [{ color: "#e06c53" }],
  },
  // 3. 自然・庭園（幽玄な夜の木々）
  {
    featureType: "poi.park",
    elementType: "geometry.fill",
    stylers: [{ color: "#1c261e" }],
  },
  {
    featureType: "poi.park",
    elementType: "labels.text.fill",
    stylers: [{ color: "#82a884" }],
  },
  // 4. 水域（深い夜の藍染め水面）
  {
    featureType: "water",
    elementType: "geometry",
    stylers: [{ color: "#16283d" }],
  },
  {
    featureType: "water",
    elementType: "labels.text.fill",
    stylers: [{ color: "#6a90b8" }],
  },
  // 5. 道路（行灯や提灯の明かりが灯る街道）
  {
    featureType: "road",
    elementType: "geometry",
    stylers: [{ color: "#28231e" }],
  },
  {
    featureType: "road.highway",
    elementType: "geometry",
    stylers: [{ color: "#8c382b" }],
  },
  {
    featureType: "road.arterial",
    elementType: "geometry",
    stylers: [{ color: "#362f27" }],
  },
];
