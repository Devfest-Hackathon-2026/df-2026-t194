import { UiText, useUiText } from "@/i18n/ui";
import React, { useEffect, useState } from "react";
import { formatDuration } from "@/data/complexRoutes";
import { ComputedRoute, TurnDirectionType } from "@/types/route";
import { RuneIcon } from "@/components/ui/RuneIcon";
import { AppLanguage, I18N, TurnArrowIcon } from "./hudTypes";

interface GuidanceHUDProps {
  activeRoute: ComputedRoute;
  guideStepIndex: number;
  autoPlayGuide: boolean;
  destination: string;
  isTraditional: boolean;
  isDark: boolean;
  surfacePill: string;
  language: AppLanguage;
  turnInfo: { actionText: string; type: TurnDirectionType };
  nextPreviewText: string;
  remainMin: number;
  remainKm: string;
  onExitGuide: () => void;
  onPrevStep: () => void;
  onNextStep: () => void;
  onToggleAutoPlay: () => void;
  onCompleteAndShare?: () => void;
}

export const GuidanceHUD: React.FC<GuidanceHUDProps> = ({
  activeRoute,
  guideStepIndex,
  isTraditional,
  isDark,
  surfacePill,
  language,
  turnInfo,
  nextPreviewText,
  onExitGuide,
}) => {
  const ui = useUiText();
  const t = I18N[language] ?? I18N.ja;
  const segs = activeRoute.segments;
  const curIdx = Math.min(guideStepIndex, segs.length - 1);
  const curSeg = segs[curIdx];
  const [voiceEnabled, setVoiceEnabled] = useState(false);

  // 音声読み上げ（Web Speech API: ステップ変化時に現在の案内文を読み上げ）
  useEffect(() => {
    if (!voiceEnabled || typeof window === "undefined" || !("speechSynthesis" in window) || !curSeg) {
      return;
    }
    try {
      window.speechSynthesis.cancel();
      const dist = curSeg.distanceM ?? 100;
      const text =
        language === "en"
          ? `In ${dist} meters, ${curSeg.label}`
          : language === "zh"
          ? `前方 ${dist} 米，${curSeg.label}`
          : `${dist}メートル${turnInfo.actionText}。${curSeg.label}`;
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = language === "en" ? "en-US" : language === "zh" ? "zh-CN" : "ja-JP";
      utter.rate = 1.05;
      window.speechSynthesis.speak(utter);
    } catch {
      // speechSynthesis unavailable
    }
    return () => {
      try {
        window.speechSynthesis?.cancel();
      } catch {}
    };
  }, [voiceEnabled, curIdx, curSeg, turnInfo.actionText, language]);

  return (
    <>
      {/* 【案内モード時】上部ナビゲーションHUD */}
      <header className="pointer-events-none absolute inset-x-0 top-3 z-30 flex flex-col gap-1.5 px-3.5 sm:px-4 md:left-1/2 md:-translate-x-1/2 md:max-w-xl md:top-4 transition-all">
        <div
          className={`pointer-events-auto flex items-center justify-between gap-2 rounded-[24px] border p-2.5 shadow-xl backdrop-blur-xl transition-colors ${surfacePill}`}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            {isTraditional ? (
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#C73E3A] text-white shadow-md border border-amber-400/40">
                <TurnArrowIcon type={turnInfo.type} />
              </div>
            ) : (
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#4285F4] text-white shadow-md">
                <TurnArrowIcon type={turnInfo.type} />
              </div>
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 whitespace-nowrap">
                <span className={`text-xs font-black shrink-0 ${isTraditional ? "text-[#C73E3A] dark:text-red-400 font-serif" : "text-[#4285F4]"}`}>
                  {curSeg?.distanceM ?? 120}m {isTraditional ? <UiText text={"道なり先"} /> : <UiText text={"先"} />}
                </span>
                <span className="text-xs font-bold text-zinc-400 truncate">
                  {<UiText text={turnInfo.actionText} />}
                </span>
              </div>
              <div className="truncate text-sm sm:text-base font-black tracking-tight">
                {<UiText text={curSeg?.label} />}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => {
                const next = !voiceEnabled;
                setVoiceEnabled(next);
                if (!next && typeof window !== "undefined" && "speechSynthesis" in window) {
                  window.speechSynthesis.cancel();
                }
              }}
              title={voiceEnabled ? ui("音声案内をオフにする") : ui("音声案内をオンにする")}
              className={`flex h-8 w-8 items-center justify-center rounded-full border text-xs transition active:scale-95 ${
                voiceEnabled
                  ? isTraditional
                    ? "border-amber-400/60 bg-amber-500/20 text-amber-200"
                    : "border-[#4285F4]/50 bg-[#4285F4]/15 text-[#4285F4]"
                  : "border-black/10 dark:border-white/10 bg-black/[0.04] dark:bg-white/[0.06] opacity-70"
              }`}
            >
              <span>{voiceEnabled ? "🔊" : "🔇"}</span>
            </button>
            <button
              type="button"
              onClick={onExitGuide}
              title={ui(ui("案内を終了"))}
              className={`rounded-full px-3 py-1.5 text-xs font-bold shadow-sm whitespace-nowrap shrink-0 transition active:scale-95 ${isTraditional
                  ? "bg-[#C73E3A] hover:bg-red-800 text-amber-100 border border-amber-300/40 font-serif"
                  : "bg-[#EA4335] text-white"
                }`}
            >
              {isTraditional ? t.exitGuideTrad : t.exitGuide}
            </button>
          </div>
        </div>

        <div className="flex w-full items-center justify-between gap-2 px-1">
          <div className={`pointer-events-auto inline-flex items-center gap-1.5 min-w-0 rounded-full border px-3 py-1 text-xs font-bold shadow-md backdrop-blur-md ${isTraditional
              ? isDark
                ? "border-amber-800/60 bg-[#1e1b18]/90 text-amber-200"
                : "border-amber-800/30 bg-[#faf6ed]/95 text-stone-800"
              : "border-zinc-700/80 bg-zinc-900/90 text-zinc-200"
            }`}>
            <span className="text-zinc-400 whitespace-nowrap shrink-0">{isTraditional ? t.stepAheadTrad : t.stepAhead}</span>
            <span className={`truncate ${isTraditional ? "font-serif text-amber-900 dark:text-amber-100" : "text-white"}`}>{nextPreviewText}</span>
          </div>
          <div
            className={`pointer-events-auto inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-bold shadow-sm backdrop-blur-md whitespace-nowrap shrink-0 ${surfacePill}`}
          >
            <span className={isTraditional ? "text-[#C73E3A]" : "text-[#4285F4]"}>▲</span>
            <span>{t.headingFixed}</span>
          </div>
        </div>
      </header>
    </>
  );
};

export const GuidanceBottomHUD: React.FC<{
  activeRoute: ComputedRoute;
  guideStepIndex: number;
  autoPlayGuide: boolean;
  isTraditional: boolean;
  isDark: boolean;
  surfacePill: string;
  remainMin: number;
  remainKm: string;
  onPrevStep: () => void;
  onNextStep: () => void;
  onToggleAutoPlay: () => void;
  onCompleteAndShare?: () => void;
}> = ({
  activeRoute,
  guideStepIndex,
  autoPlayGuide,
  isTraditional,
  isDark,
  surfacePill,
  remainMin,
  remainKm,
  onPrevStep,
  onNextStep,
  onToggleAutoPlay,
  onCompleteAndShare,
}) => {
  const ui = useUiText();
  const segs = activeRoute.segments;
  const curIdx = Math.min(guideStepIndex, segs.length - 1);
  const curSeg = segs[curIdx];
  const isLastStep = curIdx >= segs.length - 1;
  const progressPercent = segs.length > 1 ? Math.round(((curIdx + 1) / segs.length) * 100) : 100;

  return (
    <div
      className={`pointer-events-auto flex w-[calc(100%-28px)] max-w-md flex-col gap-2 rounded-[24px] border p-3 sm:p-3.5 backdrop-blur-xl ${surfacePill}`}
    >
      {/* 進捗バー */}
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
        <div
          className={`h-full rounded-full transition-all duration-300 ${
            isTraditional ? "bg-[#C73E3A]" : isLastStep ? "bg-[#34A853]" : "bg-[#4285F4]"
          }`}
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      <div className="flex w-full items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-1.5 whitespace-nowrap">
            <span className={`text-lg sm:text-xl font-extrabold shrink-0 ${isTraditional ? "text-[#C73E3A] dark:text-red-400 font-serif" : "text-[#34A853]"
              }`}>
              {isLastStep ? (
                <UiText text={"目的地付近"} />
              ) : (
                <>
                  <UiText text={"残り"} />
                  {formatDuration(remainMin)}
                </>
              )}
            </span>
            <span className="text-xs font-bold text-zinc-400 font-serif shrink-0">
              ({remainKm}km)
            </span>
          </div>
          <div className="text-[11px] font-semibold text-zinc-400 font-serif truncate">
            {isTraditional ? `第${curIdx + 1}節 / 全${segs.length}節 · ${curSeg?.label}` : `ステップ ${curIdx + 1} / ${segs.length} · ${curSeg?.label}`}
          </div>
        </div>

        {/* 右側アクション群: ゴール到達時のみ完歩/投稿 ＆ ステップ送りピル */}
        <div className="flex items-center gap-1.5 shrink-0">
          {onCompleteAndShare && isLastStep && (
            <button
              type="button"
              onClick={onCompleteAndShare}
              title={isTraditional ? ui(ui("道中記を絵巻に記す")) : ui(ui("散歩コースをSANPOSHEREに投稿・シェア"))}
              className={`flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-bold shadow-md whitespace-nowrap shrink-0 transition active:scale-95 bg-[#34A853] hover:bg-green-700 text-white animate-pulse ${
                isTraditional ? "font-serif border border-amber-300/40" : ""
              }`}
            >
              <span>{isTraditional ? <UiText text={"🏁 踏破記録"} /> : <UiText text={"🏁 完歩を投稿"} />}</span>
            </button>
          )}

          {/* ステップ送り / 自動進行切替ピル */}
          <div
            className={`flex items-center gap-1 rounded-full border p-1 shrink-0 ${isTraditional
                ? "border-amber-800/40 bg-amber-500/10"
                : isDark
                  ? "border-zinc-700 bg-zinc-800"
                  : "border-zinc-200/80 bg-zinc-100"
              }`}
          >
            <button
              type="button"
              onClick={onPrevStep}
              disabled={curIdx <= 0}
              title={ui(ui("前の曲がり角へ"))}
              className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition hover:bg-zinc-500/15 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 disabled:opacity-30 disabled:pointer-events-none"
            >
              <RuneIcon name="arrows-chevron-left" size={13} />
            </button>
            <button
              type="button"
              onClick={onToggleAutoPlay}
              title={ui("自動進行 ON/OFF")}
              className={`rounded-full px-2.5 py-1 text-[11px] font-bold whitespace-nowrap shrink-0 transition ${autoPlayGuide
                  ? isTraditional
                    ? "bg-[#C73E3A] text-amber-100 font-serif"
                    : "bg-[#4285F4] text-white"
                  : "text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
                }`}
            >
              {autoPlayGuide ? (isTraditional ? <UiText text={"道中自動"} /> : <UiText text={"自動"} />) : (isTraditional ? <UiText text={"手動"} /> : <UiText text={"手動"} />)}
            </button>
            <button
              type="button"
              onClick={onNextStep}
              disabled={isLastStep}
              title={ui(ui("次の曲がり角へ進める"))}
              className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition hover:bg-zinc-500/15 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 disabled:opacity-30 disabled:pointer-events-none"
            >
              <RuneIcon name="arrows-chevron-right" size={13} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
