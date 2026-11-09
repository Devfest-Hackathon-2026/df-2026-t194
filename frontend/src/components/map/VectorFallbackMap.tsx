import React from "react";
import { CITY_BLOCKS, PARK_PATHS, ROAD_NETWORK } from "@/data/complexRoutes";
import { MapFacilityPin } from "@/data/facilityPins";
import { ComputedRoute } from "@/types/route";
import { AppLanguage, isCurrentLocationText } from "@/components/hud/hudTypes";

const MAP_LABEL_TRANSLATIONS: Record<string, { en: string; zh: string }> = {
  "富山駅北口広場": { en: "Toyama Sta. North", zh: "富山站北口广场" },
  "ブールバール通り": { en: "Boulevard Ave.", zh: "林荫大道" },
  "富岩運河プロムナード": { en: "Canal Promenade", zh: "富岩运河漫步道" },
  "環水公園 天門橋": { en: "Tenmon Bridge", zh: "环水公园 天门桥" },
  "牛島町交差点": { en: "Ushijima Jct.", zh: "牛岛町路口" },
  "駅北広場": { en: "Station North", zh: "站北广场" },
  "富山駅": { en: "Toyama Station", zh: "富山站" },
  "富岩運河環水公園": { en: "Kansui Park", zh: "环水公园" },
  "環水公園 カフェテラス": { en: "Kansui Cafe", zh: "环水公园 咖啡露台" },
  "富山県美術館": { en: "Prefectural Museum", zh: "富山县美术馆" },
  "富山城址公園": { en: "Castle Ruin Park", zh: "富山城址公园" },
  "総曲輪通り カフェ街": { en: "Sogawa Arcade", zh: "总曲轮 咖啡街" },
  "富山市ガラス美術館": { en: "Glass Art Museum", zh: "玻璃美术馆" },
  "日枝神社": { en: "Hie Shrine", zh: "日枝神社" },
  "指定した地点": { en: "Selected Point", zh: "指定地点" },
  "指定地点": { en: "Selected Point", zh: "指定地点" },
  "出発地": { en: "Start", zh: "起点" },
  "目的地": { en: "Destination", zh: "目的地" },
};

function getLocalizedStreetName(text: string, lang: AppLanguage): string {
  if (lang === "ja") return text;
  return MAP_LABEL_TRANSLATIONS[text]?.[lang] || text;
}

interface VectorFallbackMapProps {
  route: ComputedRoute;
  isDark: boolean;
  isTraditional: boolean;
  language?: AppLanguage;
  isMobile: boolean;
  isRouteActive: boolean;
  isNavMode: boolean;
  originLabel: string;
  destinationLabel: string;
  activeIdx: number;
  viewTargetX: number;
  viewTargetY: number;
  effectiveScale: number;
  camRotateDeg: number;
  camCenterX: number;
  camCenterY: number;
  segAngleDeg: number;
  isDragging: boolean;
  selectedPin?: MapFacilityPin | null;
  droppedPin?: MapFacilityPin | null;
  onSelectFacilityPin?: (pin: MapFacilityPin) => void;
}

export const VectorFallbackMap: React.FC<VectorFallbackMapProps> = ({
  route,
  isDark,
  isTraditional,
  language = "ja",
  isMobile,
  isRouteActive,
  isNavMode,
  originLabel,
  destinationLabel,
  activeIdx,
  viewTargetX,
  viewTargetY,
  effectiveScale,
  camRotateDeg,
  camCenterX,
  camCenterY,
  segAngleDeg,
  isDragging,
  selectedPin,
  droppedPin,
  onSelectFacilityPin,
}) => {
  const parkFill = isTraditional
    ? isDark
      ? "#1e2e22"
      : "#b8cca6"
    : isDark
    ? "#064e3b"
    : "#dcfce7";
  const riverStroke = isTraditional
    ? isDark
      ? "#182c42"
      : "#5a8499"
    : isDark
    ? "#0284c7"
    : "#bae6fd";
  const blockFill = isTraditional
    ? isDark
      ? "#28221c"
      : "#ebdec9"
    : isDark
    ? "#1e293b"
    : "#e2e6ed";
  const blockStroke = isTraditional
    ? isDark
      ? "#44392e"
      : "#cbbca3"
    : isDark
    ? "#334155"
    : "#d5dbe5";
  const roadCasing = isTraditional
    ? isDark
      ? "#3e3226"
      : "#9c8b78"
    : isDark
    ? "#64748b"
    : "#cbd5e1";
  const roadSurface = isTraditional
    ? isDark
      ? "#241d17"
      : "#faf4e8"
    : isDark
    ? "#334155"
    : "#ffffff";
  const labelFill = isTraditional
    ? isDark
      ? "#e6ddbe"
      : "#3a2e26"
    : isDark
    ? "#e2e8f0"
    : "#64748b";
  const labelHalo = isTraditional
    ? isDark
      ? "#181411"
      : "#f5eee0"
    : isDark
    ? "#0f172a"
    : "#eef1f6";

  const allRoutePts: [number, number][] = [
    route.segments[0].from,
    ...route.segments.map((s) => s.to),
  ];
  const fullRouteD = allRoutePts
    .map((p, i) => `${i === 0 ? "M" : "L"}${p[0]},${p[1]}`)
    .join(" ");

  const startPt = allRoutePts[0];
  const endPt = allRoutePts[allRoutePts.length - 1];
  const calloutWidth = Math.max(120, route.callout.text.length * 10.5 + 34);

  const isLoopRoute = Math.hypot(startPt[0] - endPt[0], startPt[1] - endPt[1]) < 28;

  const isOriginCurrent = isCurrentLocationText(originLabel);
  const defaultOrigin = isTraditional
    ? (language === "en" ? "Start" : language === "zh" ? "启程地" : "出立地")
    : (language === "en" ? "Current" : language === "zh" ? "当前位置" : "現在地");
  const rawOrigin = isOriginCurrent
    ? defaultOrigin
    : (getLocalizedStreetName(originLabel.trim(), language) || (language === "en" ? "Start" : "出発地"));
  const cleanOrigin = rawOrigin.slice(0, 10);

  const rawDest = destinationLabel.trim();
  const isDestEmpty = !rawDest || rawDest === "目的地" || rawDest === "Destination";
  const defaultDest = language === "en" ? "Destination" : language === "zh" ? "目的地" : (isTraditional ? "目的地" : "目的地");
  const localizedDest = isDestEmpty
    ? defaultDest
    : (rawDest.includes("指定地点") || rawDest.includes("指定した地点")
        ? (language === "en" ? "Selected" : language === "zh" ? "指定地点" : "指定した地点")
        : getLocalizedStreetName(rawDest, language));
  const cleanDest = localizedDest.slice(0, 10);

  const originBoxW = Math.max(64, cleanOrigin.length * (language === "en" ? 8 : 11) + 24);
  const destBoxW = Math.max(70, cleanDest.length * (language === "en" ? 8 : 11) + 24);

  const activeSeg = isNavMode ? route.segments[activeIdx] : null;
  const nextSeg =
    isNavMode && route.segments[activeIdx + 1]
      ? route.segments[activeIdx + 1]
      : null;

  let turnGuideArrowPath = "";
  if (isNavMode && activeSeg && nextSeg) {
    const p1 = activeSeg.from;
    const p2 = activeSeg.to;
    const p3 = nextSeg.to;
    const len1 = Math.max(1, Math.hypot(p1[0] - p2[0], p1[1] - p2[1]));
    const len2 = Math.max(1, Math.hypot(p3[0] - p2[0], p3[1] - p2[1]));
    const ax = p2[0] + ((p1[0] - p2[0]) / len1) * 18;
    const ay = p2[1] + ((p1[1] - p2[1]) / len1) * 18;
    const bx = p2[0] + ((p3[0] - p2[0]) / len2) * 22;
    const by = p2[1] + ((p3[1] - p2[1]) / len2) * 22;
    turnGuideArrowPath = `M ${ax},${ay} L ${p2[0]},${p2[1]} L ${bx},${by}`;
  }

  return (
    <svg
      viewBox={isMobile ? "70 -20 830 650" : "0 0 1000 600"}
      preserveAspectRatio="xMidYMid meet"
      className="block h-full w-full"
    >
      <defs>
        <filter id="pillShadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow
            dx="0"
            dy="2"
            stdDeviation="3"
            floodColor="#000000"
            floodOpacity="0.24"
          />
        </filter>
        <radialGradient id="navConeGrad" cx="50%" cy="100%" r="90%">
          <stop offset="0%" stopColor="#4285F4" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#4285F4" stopOpacity="0.0" />
        </radialGradient>
        {isTraditional && (
          <pattern id="traditionalSeigaiha" width="36" height="18" patternUnits="userSpaceOnUse">
            <path
              d="M0 18 A18 18 0 0 1 36 18 M6 18 A12 12 0 0 1 30 18 M12 18 A6 6 0 0 1 24 18 M-18 0 A18 18 0 0 1 18 0 M-12 0 A12 12 0 0 1 12 0 M-6 0 A6 6 0 0 1 6 0 M18 0 A18 18 0 0 1 54 0 M24 0 A12 12 0 0 1 48 0 M30 0 A6 6 0 0 1 42 0"
              fill="none"
              stroke={isDark ? "#352920" : "#d8cbba"}
              strokeWidth="0.8"
              opacity={isDark ? 0.35 : 0.45}
            />
          </pattern>
        )}
      </defs>

      {/* 和風テーマ時の青海波古地図背景 */}
      {isTraditional && (
        <rect width="100%" height="100%" fill="url(#traditionalSeigaiha)" />
      )}

      <g
        id="vector-map-world-group"
        style={{
          transition: isDragging
            ? "none"
            : "transform 0.65s cubic-bezier(0.22, 1, 0.36, 1)",
        }}
        transform={`translate(${viewTargetX}, ${viewTargetY}) scale(${effectiveScale}) rotate(${camRotateDeg}) translate(${-camCenterX}, ${-camCenterY})`}
      >
        {/* 1. 公園エリア */}
        {PARK_PATHS.map((d, i) => (
          <path
            key={`park-${i}`}
            d={d}
            fill={parkFill}
            opacity={isDark ? 0.55 : 0.85}
          />
        ))}

        {/* 2. 河川ライン */}
        <path
          d="M 135,322 L 250,425"
          fill="none"
          stroke={riverStroke}
          strokeWidth="7"
          strokeLinecap="round"
          opacity={isDark ? 0.6 : 0.9}
        />

        {/* 3. 丸角街区ビルブロック */}
        {CITY_BLOCKS.map((b) => (
          <rect
            key={b.id}
            x={b.x}
            y={b.y}
            width={b.w}
            height={b.h}
            rx={7}
            fill={blockFill}
            stroke={blockStroke}
            strokeWidth="1"
          />
        ))}

        {/* 4. 道路ネットワーク（外枠ケーシング + 道路面） */}
        {ROAD_NETWORK.map((rd) => {
          const d = rd.pts
            .map((p, i) => `${i === 0 ? "M" : "L"}${p[0]},${p[1]}`)
            .join(" ");
          return (
            <path
              key={`${rd.id}-case`}
              d={d}
              fill="none"
              stroke={roadCasing}
              strokeWidth={rd.width + 4}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          );
        })}
        {ROAD_NETWORK.map((rd) => {
          const d = rd.pts
            .map((p, i) => `${i === 0 ? "M" : "L"}${p[0]},${p[1]}`)
            .join(" ");
          return (
            <path
              key={rd.id}
              d={d}
              fill="none"
              stroke={roadSurface}
              strokeWidth={rd.width}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          );
        })}

        {/* 5. ルート描画（ルート検索実行時のみ表示） */}
        {isRouteActive && (
          <>
            {/* 比較用破線サブルート（通常時のみ表示） */}
            {!isNavMode && route.altPath.length > 1 && (
              <g>
                <path
                  d={route.altPath
                    .map((p, i) => `${i === 0 ? "M" : "L"}${p[0]},${p[1]}`)
                    .join(" ")}
                  fill="none"
                  stroke={isDark ? "#64748b" : "#94a3b8"}
                  strokeWidth="8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity="0.55"
                />
                <path
                  d={route.altPath
                    .map((p, i) => `${i === 0 ? "M" : "L"}${p[0]},${p[1]}`)
                    .join(" ")}
                  fill="none"
                  stroke={isDark ? "#cbd5e1" : "#ffffff"}
                  strokeWidth="2.6"
                  strokeDasharray="5 5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity="0.85"
                />
              </g>
            )}

            {/* 6. 動的通り名ラベル */}
            {route.mapLabels?.map((lb) => {
              const localizedLabel = getLocalizedStreetName(lb.text, language);
              return (
                <g
                  key={lb.id}
                  transform={`translate(${lb.x}, ${lb.y}) rotate(${-camRotateDeg})`}
                >
                  <text
                    x={0}
                    y={0}
                    textAnchor="middle"
                    fill={
                      lb.isPark ? (isDark ? "#6ee7b7" : "#15803d") : labelFill
                    }
                    fontSize={isNavMode ? "8" : "10.5"}
                    fontWeight="700"
                    style={{
                      paintOrder: "stroke",
                      stroke: labelHalo,
                      strokeWidth: "3px",
                      strokeLinecap: "round",
                      strokeLinejoin: "round",
                    }}
                  >
                    {localizedLabel}
                  </text>
                </g>
              );
            })}

            {/* 7. アクティブルート（ケーシング + カラーセグメント） */}
            {isDark && (
              <path
                d={fullRouteD}
                fill="none"
                stroke="#f8fafc"
                strokeWidth="13.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity="0.25"
              />
            )}
            <path
              d={fullRouteD}
              fill="none"
              stroke="#18181b"
              strokeWidth="10.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {route.segments.map((seg, idx) => {
              const isPast = isNavMode && idx < activeIdx;
              return (
                <line
                  key={`seg-${idx}`}
                  x1={seg.from[0]}
                  y1={seg.from[1]}
                  x2={seg.to[0]}
                  y2={seg.to[1]}
                  stroke={isPast ? "#64748b" : seg.color}
                  strokeWidth={isNavMode && idx === activeIdx ? "7.5" : "6.2"}
                  strokeLinecap="round"
                  opacity={isPast ? 0.45 : 1}
                />
              );
            })}

            {allRoutePts.map((pt, idx) => {
              if (idx === 0 || idx === allRoutePts.length - 1) return null;
              return (
                <circle
                  key={`joint-${idx}`}
                  cx={pt[0]}
                  cy={pt[1]}
                  r="3.4"
                  fill="#ffffff"
                  stroke="#18181b"
                  strokeWidth="1.8"
                />
              );
            })}

            {/* 8. 中継地点（経由地）Googleマップ風・洗練された丸型番号マーカー */}
            {route.waypointPins?.map((wp, idx) => {
              return (
                <g
                  key={wp.id}
                  transform={`translate(${wp.x}, ${wp.y}) rotate(${-camRotateDeg})`}
                  filter="url(#pillShadow)"
                >
                  <circle
                    r="8"
                    fill="#ffffff"
                    stroke="#18181b"
                    strokeWidth="2"
                  />
                  <circle
                    r="6.2"
                    fill="#FBBC05"
                  />
                  <text
                    x="0"
                    y="2.8"
                    textAnchor="middle"
                    fill="#18181b"
                    fontSize="8"
                    fontWeight="900"
                    fontFamily="sans-serif"
                  >
                    {idx + 1}
                  </text>
                </g>
              );
            })}

            {/* 9. 案内モード時: 次の交差点の曲がり角ガイド矢印 + 現在地ナビパック */}
            {isNavMode && activeSeg ? (
              <g>
                {turnGuideArrowPath && (
                  <>
                    <path
                      d={turnGuideArrowPath}
                      fill="none"
                      stroke="#ffffff"
                      strokeWidth="4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      filter="url(#pillShadow)"
                    />
                    <circle
                      cx={activeSeg.to[0]}
                      cy={activeSeg.to[1]}
                      r="6.5"
                      fill="#ffffff"
                      stroke="#18181b"
                      strokeWidth="2.5"
                    />
                  </>
                )}

                <g
                  transform={`translate(${camCenterX}, ${camCenterY}) rotate(${
                    segAngleDeg + 90
                  })`}
                >
                  <path
                    d="M 0,0 L -24,-48 A 34,34 0 0,1 24,-48 Z"
                    fill="url(#navConeGrad)"
                  />
                  <circle r="16" fill="#4285F4" fillOpacity="0.28" />
                  <circle r="10.5" fill="#ffffff" filter="url(#pillShadow)" />
                  <circle r="8" fill="#4285F4" />
                  <path
                    d="M 0,-5.2 L 4.2,3.8 L 0,1.8 L -4.2,3.8 Z"
                    fill="#ffffff"
                  />
                </g>
              </g>
            ) : null}

            {/* 10. 出発地ピル & 目的地ピル */}
            <g
              transform={`translate(${startPt[0]}, ${startPt[1]}) rotate(${-camRotateDeg})`}
              filter="url(#pillShadow)"
            >
              <circle
                r="7"
                fill={isTraditional ? "#faf6ed" : "#ffffff"}
                stroke={isTraditional ? "#1e1b18" : "#18181b"}
                strokeWidth="3.2"
              />
              <rect
                x={-originBoxW / 2}
                y="11"
                width={originBoxW}
                height="22"
                rx={isTraditional ? 4 : 11}
                fill={isTraditional ? "#2b2520" : "#18181b"}
                stroke={isTraditional ? "#c5a059" : "none"}
                strokeWidth={isTraditional ? 1 : 0}
              />
              <text
                x="0"
                y="25.5"
                textAnchor="middle"
                fill="#ffffff"
                fontSize="10.5"
                fontWeight="700"
                fontFamily={isTraditional ? "serif" : "sans-serif"}
              >
                {cleanOrigin}
              </text>
            </g>

            {!isLoopRoute && (
              <g
                transform={`translate(${endPt[0]}, ${endPt[1]}) rotate(${-camRotateDeg})`}
                filter="url(#pillShadow)"
              >
                <circle
                  r="22"
                  fill={isTraditional ? "#c5a059" : "#34A853"}
                  fillOpacity={isDark ? 0.22 : 0.15}
                />
                <circle
                  r="7"
                  fill={isTraditional ? "#C73E3A" : "#EA4335"}
                  stroke={isTraditional ? "#faf6ed" : "#18181b"}
                  strokeWidth="2.8"
                />
                <rect
                  x={-destBoxW / 2}
                  y="-34"
                  width={destBoxW}
                  height="22"
                  rx={isTraditional ? 4 : 11}
                  fill={isTraditional ? "#C73E3A" : "#EA4335"}
                  stroke={isTraditional ? "#c5a059" : "none"}
                  strokeWidth={isTraditional ? 1 : 0}
                />
                <text
                  x="0"
                  y="-19.5"
                  textAnchor="middle"
                  fill="#ffffff"
                  fontSize="10.5"
                  fontWeight="700"
                  fontFamily={isTraditional ? "serif" : "sans-serif"}
                >
                  {cleanDest}
                </text>
              </g>
            )}
          </>
        )}

        {/* 11. 長押し・右クリックで指したドロップピン（指した位置にそのまま表示・文字ラベルなし） */}
        {droppedPin && (
          <g
            data-facility-pin={droppedPin.id}
            transform={`translate(${droppedPin.x}, ${droppedPin.y}) rotate(${-camRotateDeg})`}
            style={{ cursor: "pointer" }}
            onClick={(e) => {
              e.stopPropagation();
              onSelectFacilityPin?.(droppedPin);
            }}
            filter="url(#pillShadow)"
          >
            <circle r="18" fill="#e11d48" fillOpacity="0.16" />
            {/* ドロップピン本体（ティアドロップ型） */}
            <path
              d="M 0,0 C -6,-8 -11,-14 -11,-20 A 11,11 0 1,1 11,-20 C 11,-14 6,-8 0,0 Z"
              fill="#e11d48"
              stroke="#ffffff"
              strokeWidth="2.2"
            />
            <circle cx="0" cy="-20" r="4" fill="#ffffff" />
          </g>
        )}
      </g>
    </svg>
  );
};
