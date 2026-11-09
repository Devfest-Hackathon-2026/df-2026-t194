import { UiText, useUiText } from "@/i18n/ui";
import React, { useId } from "react";
import { ComputedRoute } from "@/types/route";

interface ElevationProfileProps {
  route: ComputedRoute;
  isDark: boolean;
}

// 滑らかな曲線（Catmull-Rom スプライン）の SVG パスを生成するヘルパー
function getSmoothPath(points: Array<{ x: number; y: number }>): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0].x},${points[0].y}`;
  if (points.length === 2)
    return `M ${points[0].x},${points[0].y} L ${points[1].x},${points[1].y}`;

  let d = `M ${points[0].x.toFixed(1)},${points[0].y.toFixed(1)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    d += ` C ${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
  }
  return d;
}

export const ElevationProfile: React.FC<ElevationProfileProps> = ({
  route,
  isDark,
}) => {
  const ui = useUiText();
  const gradientId = useId();

  const measuredElevs = route.apiData?.metrics.elevation_profile_meters ?? [];
  if (measuredElevs.length < 2) {
    return (
      <div className={`rounded-2xl border p-3 text-xs ${isDark ? "border-slate-700 bg-slate-900 text-slate-300" : "border-slate-200 bg-white text-slate-600"}`}>
        <UiText text={"⛰️ この検索では標高を計測していません。坂道・足への負担を指定すると、Elevation APIの実測プロファイルを表示します。"} /></div>
    );
  }

  // Elevation APIの実測プロファイル。標準ルートも実測済みの場合のみ比較する。
  const width = 360;
  const height = 64;
  const padX = 14;
  const padTop = 14;
  const padBottom = 12;
  const usableH = height - padTop - padBottom;

  const baseElevs = route.baseline?.elevation_profile_meters ?? [];
  const activeElevs = measuredElevs;

  const allElevs = activeElevs.concat(baseElevs);
  const minElev = Math.min(...allElevs);
  const maxElev = Math.max(...allElevs);
  const elevSpan = Math.max(10, maxElev - minElev);

  const toCoords = (arr: number[]) =>
    arr.map((val, i) => {
      const rawRatio = (val - minElev) / elevSpan;
      const clampedRatio = Math.min(1, Math.max(0, rawRatio));
      return {
        x: padX + (i / Math.max(1, arr.length - 1)) * (width - padX * 2),
        y: height - padBottom - clampedRatio * usableH,
        elev: val,
      };
    });

  const baseCoords = baseElevs.length > 1 ? toCoords(baseElevs) : [];
  const activeCoords = toCoords(activeElevs);

  let peakPoint = activeCoords[0];
  activeCoords.forEach((p) => {
    if (p.elev > peakPoint.elev) peakPoint = p;
  });

  const basePath = getSmoothPath(baseCoords);
  const activePath = getSmoothPath(activeCoords);

  const lastActive = activeCoords[activeCoords.length - 1];
  const firstActive = activeCoords[0];
  const areaPath = `${activePath} L ${lastActive.x.toFixed(1)},${height} L ${firstActive.x.toFixed(1)},${height} Z`;

  const primaryColor = "#34A853";
  const accentGlow = "#4ade80";

  const baseAscent = baseElevs.length >= 2 ? route.baseline?.elevation_gain_meters : undefined;
  const routeAscent = route.apiData?.metrics.elevation_gain_meters;
  const savedMeters = baseAscent !== undefined && routeAscent !== undefined
    ? Math.round(baseAscent - routeAscent)
    : null;

  return (
    <div
      className={`relative w-full overflow-hidden rounded-2xl border p-2.5 sm:p-3 backdrop-blur-2xl transition-all ${
        isDark
          ? "border-zinc-800/60 bg-zinc-900/75 shadow-[0_4px_24px_rgba(0,0,0,0.4)]"
          : "border-zinc-200/60 bg-white/75 shadow-[0_2px_12px_rgba(0,0,0,0.04)]"
      }`}
    >
      {/* ヘッダー行: 傾斜軽減ステータス ＆ 標高差バッジ */}
      <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-slate-500/15">
        <div className="flex items-center gap-2">
          <div
            className="flex h-6 w-6 items-center justify-center rounded-lg text-xs"
            style={{
              backgroundColor: `${primaryColor}20`,
              color: isDark ? accentGlow : primaryColor,
            }}
          >
            ⛰️
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-bold tracking-tight text-slate-400">
                <UiText text={"高低差プロファイル"} /></span>
              <span
                className="inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-extrabold"
                style={{
                  backgroundColor: `${primaryColor}18`,
                  color: isDark ? accentGlow : primaryColor,
                }}
              >
                {route.slopeSaveLabel || <UiText text={"坂道回避"} />}
              </span>
            </div>
          </div>
        </div>

        {/* 標高軽減メトリクス */}
        <div className="flex items-baseline gap-1.5">
          {savedMeters !== null && savedMeters > 0 && (
            <span className="inline-flex items-center gap-0.5 text-[11px] font-bold text-emerald-500 bg-emerald-500/10 rounded-md px-1.5 py-0.5">
              <UiText text={"登り"} />{savedMeters}<UiText text={"m 少ない"} /></span>
          )}
          <div className="flex items-baseline gap-1 font-mono">
            <span
              className="text-sm font-extrabold"
              style={{ color: isDark ? accentGlow : primaryColor }}
            >
              {route.newElevText} <UiText text={"· Elevation API実測"} /></span>
          </div>
        </div>
      </div>

      {/* メイン断面グラフィックス (SVG) */}
      <div className="relative mt-2 w-full">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-14 overflow-visible"
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="0%"
                stopColor={primaryColor}
                stopOpacity={isDark ? 0.45 : 0.28}
              />
              <stop offset="100%" stopColor={primaryColor} stopOpacity={0.0} />
            </linearGradient>

            <filter id={`glow-${gradientId}`} x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow
                dx="0"
                dy="2"
                stdDeviation="3"
                floodColor={primaryColor}
                floodOpacity={isDark ? 0.6 : 0.25}
              />
            </filter>
          </defs>

          {/* 水平ガイドライン */}
          <line
            x1={padX}
            y1={padTop}
            x2={width - padX}
            y2={padTop}
            stroke={isDark ? "#334155" : "#e2e8f0"}
            strokeDasharray="3 3"
            strokeWidth="0.8"
          />
          <line
            x1={padX}
            y1={height - padBottom}
            x2={width - padX}
            y2={height - padBottom}
            stroke={isDark ? "#334155" : "#e2e8f0"}
            strokeWidth="0.8"
          />

          {/* 1. 本ルートの標高グラデーション塗りつぶし */}
          <path d={areaPath} fill={`url(#${gradientId})`} />

          {/* 2. 比較用：急坂・標準ルート（赤の破線） */}
          {basePath && <path d={basePath} fill="none" stroke="#EA4335" strokeWidth="1.6" strokeDasharray="4 3" opacity={isDark ? 0.75 : 0.65} />}

          {/* 3. 本ルートのメイン曲線 */}
          <path
            d={activePath}
            fill="none"
            stroke={primaryColor}
            strokeWidth="2.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            filter={`url(#glow-${gradientId})`}
          />

          {/* 出発地ドット */}
          <circle
            cx={firstActive.x}
            cy={firstActive.y}
            r="3"
            fill={primaryColor}
            stroke="#ffffff"
            strokeWidth="1.5"
          />

          {/* 目的地ドット */}
          <circle
            cx={lastActive.x}
            cy={lastActive.y}
            r="3"
            fill={primaryColor}
            stroke="#ffffff"
            strokeWidth="1.5"
          />

          {/* 最高地点（Peak）のピンバッジ */}
          <g transform={`translate(${peakPoint.x}, ${Math.max(10, peakPoint.y - 12)})`}>
            <circle cx="0" cy="0" r="2.5" fill={primaryColor} />
            <rect
              x="-24"
              y="-12"
              width="48"
              height="14"
              rx="7"
              fill={isDark ? "#1e293b" : "#ffffff"}
              stroke={primaryColor}
              strokeWidth="1"
              className="drop-shadow-sm"
            />
            <text
              x="0"
              y="-2"
              textAnchor="middle"
              fontSize="8"
              fontWeight="800"
              fill={isDark ? "#f8fafc" : "#0f172a"}
              fontFamily="monospace"
            >
              Peak {Math.round(peakPoint.elev)}m
            </text>
          </g>
        </svg>

        {/* グラフ下部凡例＆ステップ案内 */}
        <div className="flex items-center justify-between pt-1 px-1 text-[10px] text-slate-400 font-medium">
          <div className="flex items-center gap-1">
            <span><UiText text={"● 出発"} /></span>
            <span className="font-mono text-[9px]">({Math.round(firstActive.elev)}m)</span>
          </div>

          {/* 凡例 */}
          <div className="flex items-center gap-3">
            {basePath && <span className="flex items-center gap-1 text-slate-500 dark:text-slate-400"><span className="inline-block w-3 border-b-2 border-dashed border-[#EA4335]" /><span><UiText text={"標準ルート（実測）"} /></span></span>}
            <span
              className="flex items-center gap-1 font-bold"
              style={{ color: isDark ? accentGlow : primaryColor }}
            >
              <span
                className="inline-block w-3 border-b-2"
                style={{ borderColor: primaryColor }}
              />
              <span><UiText text={"選択ルート（実測・階段は未判定）"} /></span>
            </span>
          </div>

          <div className="flex items-center gap-1">
            <span><UiText text={"到着 ●"} /></span>
            <span className="font-mono text-[9px]">({Math.round(lastActive.elev)}m)</span>
          </div>
        </div>
      </div>
    </div>
  );
};
