import { UiLanguage } from "@/i18n/ui";
import type { RouteApiResponse } from "@/types/route";
import { UiText, useUiText } from "@/i18n/ui";
import React, { useState, useContext } from "react";
import { ComputedRoute, ContextFactor } from "@/types/route";
import { ThemeMode } from "@/types/theme";
import { RuneIcon } from "@/components/ui/RuneIcon";
import { ToolChips, ToolCallItem } from "@/components/ui/agent/ToolChips";
import { ElevationProfile } from "@/components/ElevationProfile";

export interface AgentAnswer {
  summary: string;
  factors: ContextFactor[];
  environment?: RouteApiResponse["environment"];
  environmentText: string; // 例: "11月（秋）・午後 / 曇り 13.6℃"
}

interface RouteInsightModalProps {
  isDark: boolean;
  themeMode?: ThemeMode;
  answer: AgentAnswer | null;
  route: ComputedRoute;
  userPrompt?: string | null;
  initialTab?: "answer" | "compare";
  onClose: () => void;
}

// 差分表示セル（時間・距離・登り）
function DeltaCell({ base, agent, unit }: { base: number; agent: number; unit: string }) {
  const ui = useUiText();
  const d = agent - base;
  if (Math.abs(d) < 0.05) return <span className="text-zinc-400"><UiText text={"同等"} /></span>;
  const better = d < 0;
  return (
    <span className={better ? "font-black text-[#34A853]" : "font-bold text-[#FBBC05] dark:text-[#FBBC05]"}>
      {better ? "▼" : "▲"} {Math.abs(d).toFixed(unit === "km" ? 2 : 0)}
      {<UiText text={unit} />}
    </span>
  );
}

export const RouteInsightModal: React.FC<RouteInsightModalProps> = ({
  isDark,
  themeMode = "modern",
  answer,
  route,
  userPrompt,
  onClose,
}) => {
  const ui = useUiText();
  const language = useContext(UiLanguage);
  const environment = answer?.environment;
  const environmentText = environment && language !== "ja"
    ? `${new Date(environment.timestamp_iso).toLocaleString(language === "en" ? "en-US" : "zh-CN")} / ${ui(environment.weather_condition)} ${environment.temp_c}℃${environment.air_quality_index != null ? ` / AQI ${environment.air_quality_index}` : ""}${environment.pollen_index != null ? ` / ${ui("花粉")} ${environment.pollen_index}/5` : ""}`
    : answer?.environmentText;
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const isTraditional = themeMode === "traditional";
  const api = route.apiData;
  const baseline = route.baseline;

  const panel = isTraditional
    ? isDark
      ? "border-amber-700/50 bg-[#1e1b18] text-amber-50 shadow-[0_24px_70px_rgba(0,0,0,0.9)] washi-pattern font-serif"
      : "border-amber-800/30 bg-[#faf6ed] text-stone-900 shadow-[0_20px_60px_rgba(90,50,20,0.2)] washi-pattern font-serif"
    : isDark
      ? "border-white/[0.08] bg-zinc-950/95 text-zinc-50 shadow-[0_24px_70px_-15px_rgba(0,0,0,0.85)]"
      : "border-black/[0.06] bg-white/95 text-zinc-900 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.15)]";
  const sub = isDark ? "text-zinc-400" : "text-zinc-500";
  const softSurface = isTraditional
    ? isDark
      ? "bg-stone-900/50 font-serif"
      : "bg-amber-900/[0.04] font-serif"
    : isDark
      ? "bg-white/[0.04]"
      : "bg-black/[0.03]";

  const notes: Array<[string, string | null | undefined]> = [
    ["🛡️ 治安・安心感", api?.safety_note],
    ["🦵 坂道・足への負担", api?.fatigue_note],
    ["🌤️ 時期・天候への配慮", api?.seasonal_weather_note],
  ].filter(([, text]) => Boolean(text?.trim())) as Array<[string, string]>;

  const hasElevationData = Boolean(
    (api?.metrics.elevation_profile_meters && api.metrics.elevation_profile_meters.length >= 2) ||
    (!api && route.elevProfile && route.elevProfile.length >= 2)
  );

  // Google標準ルートとの差分数値
  const diffMinutes =
    baseline && api ? Math.round((api.metrics.duration_seconds - baseline.duration_seconds) / 60) : null;
  const diffMeters =
    baseline && api ? Math.round(api.metrics.distance_meters - baseline.distance_meters) : null;
  const diffAscent =
    baseline && api && api.metrics.elevation_gain_meters != null && baseline.elevation_gain_meters != null
      ? Math.round(api.metrics.elevation_gain_meters - baseline.elevation_gain_meters)
      : null;

  const rows =
    (api || baseline) && baseline
      ? [
        {
          label: "所要時間",
          base: baseline.duration_seconds / 60,
          agent: (api?.metrics.duration_seconds ?? ((route.totalMinutes ?? 15) * 60)) / 60,
          unit: "分",
          fmt: (v: number) => `${Math.round(v)}分`,
        },
        {
          label: "距離",
          base: baseline.distance_meters / 1000,
          agent: (api?.metrics.distance_meters ?? ((route.totalKm ?? 1.2) * 1000)) / 1000,
          unit: "km",
          fmt: (v: number) => `${v.toFixed(2)}km`,
        },
        ...(hasElevationData
          ? [
            {
              label: "累計の登り",
              base: baseline.elevation_gain_meters ?? (route.baseElevProfile?.length ? Math.round(Math.max(...route.baseElevProfile) - Math.min(...route.baseElevProfile)) : 0),
              agent: api?.metrics.elevation_gain_meters ?? (route.elevProfile?.length ? Math.round(Math.max(...route.elevProfile) - Math.min(...route.elevProfile)) : 0),
              unit: "m",
              fmt: (v: number) => `${Math.round(v)}m`,
            },
            {
              label: "累計の下り",
              base: baseline.elevation_loss_meters ?? (baseline.elevation_gain_meters ? Math.round(baseline.elevation_gain_meters * 0.75) : 0),
              agent: api?.metrics.elevation_loss_meters ?? 0,
              unit: "m",
              fmt: (v: number) => `${Math.round(v)}m`,
            },
          ]
          : []),
      ]
      : [];

  // コールされたツール群一覧
  const agentToolCalls: ToolCallItem[] = [
    {
      id: "t-routes",
      name: "Routes API",
      category: "routes",
      status: "completed",
      latencyMs: 140,
      summaryText: `${ui("実測距離")} ${api?.metrics.distance_meters ?? Math.round((route.totalKm ?? 1.2) * 1000)}m · ${ui("所要時間")} ${Math.round((api?.metrics.duration_seconds ?? ((route.totalMinutes ?? 15) * 60)) / 60)}${ui("分")}`,
    },
    ...(api?.metrics.decision_match_prob != null
      ? [
        {
          id: "t-decision",
          name: `EmbeddingGemma 2 (${(api.metrics.decision_match_prob * 100).toFixed(1)}%)`,
          category: "decision" as const,
          status: "completed" as const,
          latencyMs: Math.round(api.metrics.decision_latency_ms || 32),
          summaryText: "希望プロンプトとの相対適合度スコア",
        },
      ]
      : []),
    ...(api?.street_view_images && api.street_view_images.length > 0
      ? [
        {
          id: "t-streetview",
          name: `Street View (${api.street_view_images.length}地点)`,
          category: "streetview" as const,
          status: "completed" as const,
          latencyMs: 120,
          summaryText: "Street View 画像から道幅・明るさ・歩道の有無を査定",
        },
      ]
      : []),
    ...(hasElevationData && api?.metrics.elevation_gain_meters != null
      ? [
        {
          id: "t-elevation",
          name: `Elevation API (+${Math.round(api.metrics.elevation_gain_meters)}m)`,
          category: "elevation" as const,
          status: "completed" as const,
          latencyMs: 65,
          summaryText: "累積標高差を測定し坂道負荷を判定",
        },
      ]
      : []),

  ];

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center p-3 sm:p-5 pt-[max(env(safe-area-inset-top),1rem)] pb-[max(env(safe-area-inset-bottom),1rem)] bg-black/60 backdrop-blur-md overflow-y-auto"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className={`my-auto flex w-full max-w-lg flex-col overflow-hidden rounded-[24px] sm:rounded-[28px] border backdrop-blur-2xl shadow-2xl max-h-[min(82dvh,calc(100dvh-3.5rem),720px)] ${panel}`}
      >
        {/* モーダルヘッダー */}
        <div className="shrink-0 flex items-center justify-between px-5 py-3.5 border-b border-black/[0.06] dark:border-white/[0.06]">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-black/[0.05] dark:bg-white/[0.08] text-zinc-700 dark:text-zinc-200">
              <RuneIcon name="tools-sparkles" size={13} />
            </span>
            <div className="text-sm font-black tracking-tight">
              {isTraditional ? <UiText text={"選定理由とGoogle標準比較"} /> : <UiText text={"選定理由とGoogle標準比較"} />}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={ui(ui("閉じる"))}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition hover:bg-black/[0.05] dark:hover:bg-white/[0.08]"
          >
            <RuneIcon name="indicators-x" size={13} />
          </button>
        </div>

        {/* スクロール可能メインコンテンツ (1タブ統合・ボーダーレス階層) */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 py-4 space-y-5 text-left text-sm">
          {/* 💬 入力されたプロンプト */}
          {userPrompt?.trim() && (
            <div className={`rounded-xl px-3.5 py-2.5 ${softSurface}`}>
              <div className="text-[10px] font-bold tracking-wider text-zinc-400">
                {isTraditional ? <UiText text={"ご指定の要望"} /> : <UiText text={"入力されたプロンプト"} />}
              </div>
              <p className="mt-0.5 text-xs font-bold leading-relaxed whitespace-pre-wrap text-zinc-800 dark:text-zinc-100">
                {userPrompt.trim()}
              </p>
            </div>
          )}

          {/* ① Google標準ルートに対する主な優位点サマリー */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-bold text-zinc-400">
                <UiText text={"Google標準ルートとの違い・選定理由"} /></span>
              {baseline && (
                <div className="flex items-center gap-1.5 text-[11px] font-mono">
                  {diffMinutes !== null && (
                    <span
                      className={`px-2 py-0.5 rounded-full font-bold ${diffMinutes <= 0
                        ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                        : "bg-black/[0.05] dark:bg-white/[0.08] text-zinc-600 dark:text-zinc-300"
                        }`}
                    >
                      {diffMinutes === 0 ? <UiText text={"時間同等"} /> : diffMinutes > 0 ? `+${diffMinutes}分` : `${diffMinutes}分`}
                    </span>
                  )}
                  {diffAscent !== null && diffAscent < 0 && (
                    <span className="px-2 py-0.5 rounded-full font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                      <UiText text={"登り"} />{Math.abs(diffAscent)}<UiText text={"m軽減"} /></span>
                  )}
                </div>
              )}
            </div>

            <p className="text-[13px] leading-relaxed font-medium text-zinc-800 dark:text-zinc-100">
              {api?.concept || answer?.summary || <UiText text={"歩行者の安全性と快適性を最優先に設計した徒歩ルートです。"} />}
            </p>

            {environmentText && (
              <p className={`text-[11px] ${sub}`}>{environmentText}</p>
            )}
          </div>

          {/* ② コールされたツール群 Chips */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-zinc-400">
                <UiText text={"使用した検証ツール"} /></span>
              <span className={`text-[10px] font-mono ${sub}`}>
                {agentToolCalls.length} tools
              </span>
            </div>
            <ToolChips tools={agentToolCalls} isDark={isDark} />
          </div>

          {/* ③ Google標準との客観数値比較テーブル */}
          {rows.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-zinc-400">
                  <UiText text={"Google標準（最短直行）との比較"} /></span>
                <span className={`text-[10px] ${sub}`}>
                  <UiText text={"破線: 標準 / 実線: AI提案"} /></span>
              </div>
              <div className={`overflow-hidden rounded-xl ${softSurface} divide-y divide-black/[0.05] dark:divide-white/[0.05]`}>
                <div className={`grid grid-cols-4 gap-1 px-3.5 py-2 text-[11px] font-semibold ${sub}`}>
                  <span><UiText text={"指標"} /></span>
                  <span className="text-right"><UiText text={"Google標準"} /></span>
                  <span className="text-right"><UiText text={"AI提案"} /></span>
                  <span className="text-right"><UiText text={"差分"} /></span>
                </div>
                {rows.map((r) => (
                  <div
                    key={r.label}
                    className="grid grid-cols-4 items-center gap-1 px-3.5 py-2 text-xs"
                  >
                    <span className="font-semibold">{<UiText text={r.label} />}</span>
                    <span className={`text-right font-mono ${sub}`}>{r.fmt(r.base)}</span>
                    <span className="text-right font-mono font-bold">{r.fmt(r.agent)}</span>
                    <span className="text-right font-mono">
                      <DeltaCell base={r.base} agent={r.agent} unit={r.unit} />
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ④ 標高プロファイル比較チャート */}
          {hasElevationData && (
            <ElevationProfile route={route} isDark={isDark} />
          )}

          {/* ⑤ 歩行時の安心・快適ポイント (治安・坂道・天候) */}
          {notes.length > 0 && (
            <div className="space-y-1.5">
              <span className="text-[11px] font-bold text-zinc-400">
                <UiText text={"快適・安全のポイント"} /></span>
              <div className={`rounded-xl ${softSurface} divide-y divide-black/[0.05] dark:divide-white/[0.05]`}>
                {notes.map(([label, text]) => (
                  <div key={label} className="px-3.5 py-2.5">
                    <div className="text-xs font-bold">{<UiText text={label} />}</div>
                    <div className={`mt-0.5 text-xs leading-relaxed ${sub}`}>{<UiText text={text} />}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ⑥ 現地 Street View 画像確認 (撮影地点) */}
          {!!api?.street_view_images?.length && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-zinc-400">
                  <UiText text={"現地 Street View 確認（代表"} />{api.street_view_images.length}<UiText text={"地点）"} /></span>
                <span className={`text-[10px] ${sub}`}><UiText text={"タップで拡大"} /></span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {api.street_view_images.map((url, i) => {
                  const obs = api.street_view_observations?.find((o) => o.sample_index === i + 1);
                  const badges: string[] = [];
                  if (obs?.sidewalk === "visible") badges.push("歩道あり");
                  if (obs?.street_lighting === "visible") badges.push("街灯あり");
                  if (obs?.road_width === "wide") badges.push("大通り");
                  else if (obs?.road_width === "normal") badges.push("道幅普通");
                  if (obs?.visibility === "good") badges.push("見通し良");

                  return (
                    <div
                      key={i}
                      onClick={() => setPreviewImage(url)}
                      className={`group relative flex flex-col overflow-hidden rounded-xl ${softSurface} cursor-pointer transition hover:opacity-95`}
                    >
                      <div className="relative aspect-[4/3] w-full overflow-hidden bg-zinc-200 dark:bg-zinc-800">
                        <img
                          src={url}
                          alt={`現地 Street View ${i + 1}`}
                          className="h-full w-full object-cover transition duration-200 group-hover:scale-105"
                          loading="lazy"
                        />
                        <div className="absolute top-1.5 left-1.5 rounded-md bg-black/60 px-1.5 py-0.5 text-[9px] font-bold text-white backdrop-blur-sm">
                          <UiText text={"地点"} />{i + 1}
                        </div>
                      </div>
                      {badges.length > 0 && (
                        <div className="p-1.5 flex flex-wrap gap-1">
                          {badges.slice(0, 2).map((b, bi) => (
                            <span
                              key={bi}
                              className="rounded bg-black/[0.05] dark:bg-white/[0.08] px-1.5 py-0.5 text-[9px] font-medium text-zinc-600 dark:text-zinc-300"
                            >
                              {b}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {/* ⑦ 一番下の閉じるボタン */}
          <div className="pt-2 pb-1">
            <button
              type="button"
              onClick={onClose}
              className="w-full py-2.5 px-4 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 bg-black/[0.05] hover:bg-black/[0.08] dark:bg-white/[0.08] dark:hover:bg-white/[0.12] text-zinc-700 dark:text-zinc-200"
            >
              <RuneIcon name="indicators-x" size={12} />
              <span><UiText text={"閉じる"} /></span>
            </button>
          </div>
        </div>
      </div>

      {/* Street View 画像の拡大ライトボックス */}
      {previewImage && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/85 p-4 pt-[max(env(safe-area-inset-top),1rem)] pb-[max(env(safe-area-inset-bottom),1rem)] backdrop-blur-md overflow-y-auto"
          onClick={() => setPreviewImage(null)}
        >
          <div
            className="relative my-auto max-w-lg w-full overflow-hidden rounded-2xl border border-zinc-700 bg-zinc-950 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <img src={previewImage} alt="Street View 拡大表示" className="w-full h-auto object-contain max-h-[min(75dvh,75vh)]" />
            <button
              type="button"
              onClick={() => setPreviewImage(null)}
              aria-label={ui(ui("閉じる"))}
              className="absolute top-3 right-3 rounded-full bg-black/70 p-2 text-white hover:bg-black/90 transition shadow-lg"
            >
              <RuneIcon name="indicators-x" size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
