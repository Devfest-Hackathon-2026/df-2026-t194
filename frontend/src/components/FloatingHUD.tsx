import { UiText, useUiText } from "@/i18n/ui";
import React, { useEffect, useState, useRef } from "react";
import { computeTurnDirection, formatDuration } from "@/data/complexRoutes";
import { ComputedRoute, TurnDirectionType } from "@/types/route";
import { ThemeMode } from "@/types/theme";
import { RuneIcon } from "@/components/ui/RuneIcon";
import { ToriiIcon } from "@/components/traditional/TraditionalSvgs";
import { AppLanguage, I18N } from "./hud/hudTypes";
import { HeaderEndpointsBar } from "./hud/HeaderEndpointsBar";
import { GuidanceBottomHUD, GuidanceHUD } from "./hud/GuidanceHUD";
import { RouteCarousel } from "./hud/RouteCarousel";
import { PromptInputBar } from "./hud/PromptInputBar";
import { PersonaModal } from "./hud/PersonaModal";
import { SanpoCarousel } from "./hud/SanpoCarousel";
import { WalkRealRoutePost } from "@/types/walkreal";
import { MapFacilityPin } from "@/data/facilityPins";
import { blockMapPinTemporarily } from "@/utils/mapPinGuard";

export type { AppLanguage };

interface FloatingHUDProps {
  origin: string;
  waypoints: string[];
  destination: string;
  activeRoute: ComputedRoute;
  routeCandidates?: ComputedRoute[];
  activeRouteIndex?: number;
  isRouteActive: boolean;
  isDark: boolean;
  themeMode?: ThemeMode;
  onChangeThemeMode?: (mode: ThemeMode) => void;
  isPortrait?: boolean;
  guideStepIndex: number | null;
  autoPlayGuide: boolean;
  isLoading?: boolean;
  realThinkingStage?: string | null;
  analysisSummary?: string | null;
  language?: AppLanguage;
  onChangeLanguage?: (lang: AppLanguage) => void;
  avoidSpots?: string[];
  onChangeAvoidSpots?: (spots: string[]) => void;
  customSystemPrompt?: string | null;
  onChangeCustomSystemPrompt?: (prompt: string | null) => void;
  onSelectRouteIndex?: (index: number) => void;
  onCancelRoute: () => void;
  onOpenInsight: (tab: "answer" | "compare") => void;
  onChangeOrigin: (val: string) => void;
  onAddWaypoint: () => void;
  onChangeWaypoint: (index: number, val: string) => void;
  onRemoveWaypoint: (index: number) => void;
  onClearWaypoints?: () => void;
  onChangeDestination: (val: string) => void;
  onSwapEndpoints: () => void;
  onExploreNewRoute?: () => void;
  walkedSpotsCount?: number;
  onToggleTheme: () => void;
  onTogglePortrait?: () => void;
  onStartGuide: () => void;
  onExitGuide: () => void;
  onPrevStep: () => void;
  onNextStep: () => void;
  onToggleAutoPlay: () => void;
  onSubmitPrompt: (prompt: string) => void;
  onResetNorth?: () => void;
  onRecenter?: () => void;
  onOpenSanpoShare?: () => void;
  onShareRoute?: (route: ComputedRoute) => void;
  sanpoRouteCount?: number;
  onGenerateLoopWalk?: (minutes: number) => void;
  isPinCardOpen?: boolean;
  selectedPin?: MapFacilityPin | null;
  onClosePinCard?: () => void;
  onWalkToSpot?: (spotName: string, geo?: { lat: number; lng: number }) => void;
  onAddWaypointFromSnap?: (spotName: string, geo?: { lat: number; lng: number }) => void;
  isUiHidden?: boolean;
  onHideUi?: () => void;
  onRestoreUi?: () => void;
  mainTab?: "route" | "sanpo";
  onChangeMainTab?: (tab: "route" | "sanpo") => void;
  sanpoPosts?: WalkRealRoutePost[];
  activeSanpoPost?: WalkRealRoutePost | null;
  onSelectSanpoPost?: (post: WalkRealRoutePost) => void;
  onWalkThisSanpoRoute?: (post: WalkRealRoutePost) => void;
  onWalkThisSanpoRouteReversed?: (post: WalkRealRoutePost) => void;
  onToggleSanpoLike?: (postId: string) => void;
  onOpenCreateSanpo?: () => void;
  searchMatchInfo?: { query: string; score: number; reasons: string[] } | null;
  onClearSearchMatch?: () => void;
  routeError?: string | null;
  onClearRouteError?: () => void;
}

export const FloatingHUD: React.FC<FloatingHUDProps> = ({
  origin,
  waypoints,
  destination,
  activeRoute,
  routeCandidates = [],
  activeRouteIndex = 0,
  isRouteActive,
  isDark,
  themeMode = "modern",
  onChangeThemeMode,
  guideStepIndex,
  autoPlayGuide,
  isLoading = false,
  realThinkingStage,
  language = "ja",
  onChangeLanguage,
  avoidSpots = [],
  onChangeAvoidSpots,
  customSystemPrompt = null,
  onChangeCustomSystemPrompt,
  onSelectRouteIndex,
  onCancelRoute,
  onOpenInsight,
  onChangeOrigin,
  onAddWaypoint,
  onChangeWaypoint,
  onRemoveWaypoint,
  onClearWaypoints,
  onChangeDestination,
  onSwapEndpoints,
  onExploreNewRoute,
  walkedSpotsCount = 0,
  onToggleTheme,
  onStartGuide,
  onExitGuide,
  onPrevStep,
  onNextStep,
  onToggleAutoPlay,
  onSubmitPrompt,
  onResetNorth,
  onRecenter,
  onOpenSanpoShare,
  onShareRoute,
  sanpoRouteCount = 0,
  onGenerateLoopWalk,
  isPinCardOpen = false,
  selectedPin = null,
  onClosePinCard,
  onWalkToSpot,
  onAddWaypointFromSnap,
  isUiHidden = false,
  onHideUi,
  onRestoreUi,
  mainTab = "route",
  onChangeMainTab,
  sanpoPosts = [],
  activeSanpoPost = null,
  onSelectSanpoPost,
  onWalkThisSanpoRoute,
  onWalkThisSanpoRouteReversed,
  onToggleSanpoLike,
  onOpenCreateSanpo,
  searchMatchInfo = null,
  onClearSearchMatch,
  routeError = null,
  onClearRouteError,
}) => {
  const ui = useUiText();
  const [promptText, setPromptText] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isToiletOn, setIsToiletOn] = useState(false);
  const [isNgBarOpen, setIsNgBarOpen] = useState(false);
  const [newNgInput, setNewNgInput] = useState("");
  const [isPersonaModalOpen, setIsPersonaModalOpen] = useState(false);

  const isTraditional = themeMode === "traditional";
  const t = I18N[language] ?? I18N.ja;
  const isGuiding = guideStepIndex !== null;

  const surfacePill = isTraditional
    ? isDark
      ? "border-amber-700/60 bg-[#1e1b18]/90 text-amber-50 shadow-[0_12px_40px_rgba(0,0,0,0.8)] backdrop-blur-2xl washi-pattern font-serif ring-1 ring-amber-600/30"
      : "border-amber-800/30 bg-[#faf6ed]/95 text-stone-900 shadow-[0_10px_35px_rgba(90,50,20,0.15)] backdrop-blur-2xl washi-pattern font-serif ring-1 ring-amber-900/10"
    : isDark
    ? "border-zinc-800/60 bg-zinc-950/75 text-zinc-100 shadow-[0_12px_40px_-8px_rgba(0,0,0,0.6)] backdrop-blur-2xl"
    : "border-white/50 dark:border-zinc-800/60 bg-white/75 text-zinc-900 shadow-[0_8px_32px_rgba(0,0,0,0.08)] backdrop-blur-2xl";

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = promptText.trim();
    if (isLoading) return;

    // 送信時に入力フォーカスを解除してキーボードを閉じる
    if (typeof document !== "undefined" && document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }

    if (!trimmed) {
      onSubmitPrompt("");
      return;
    }

    if (mainTab === "sanpo") {
      onSubmitPrompt(trimmed);
      setPromptText("");
      return;
    }

    let finalPrompt = trimmed;
    if (isToiletOn && !/トイレ|お手洗い|restroom|toilet|洗手间|WC/i.test(trimmed)) {
      const toiletSuffix =
        language === "en"
          ? " (include verified restroom facilities on the way)"
          : language === "zh"
          ? " (途中规划已确认设有洗手间的设施)"
          : " (途中でトイレ設備を確認できる施設に寄りたい)";
      finalPrompt = `${trimmed}${toiletSuffix}`;
    }

    onSubmitPrompt(finalPrompt);
    setPromptText("");
  };

  const handleToggleToilet = () => {
    const nextState = !isToiletOn;
    setIsToiletOn(nextState);
    if (!destination.trim()) return;

    let prompt = `${destination.trim()}まで`;
    if (nextState) {
      prompt +=
        language === "en"
          ? " (prefer route with public restrooms on the way)"
          : language === "zh"
          ? " (途中规划已确认设有洗手间的设施)"
          : " (途中でトイレ設備を確認できる施設に寄りたい)";
    }
    onSubmitPrompt(prompt);
  };

  const handleToggleNgPreset = (tag: string) => {
    if (!onChangeAvoidSpots) return;
    if (avoidSpots.includes(tag)) {
      onChangeAvoidSpots(avoidSpots.filter((s) => s !== tag));
    } else {
      onChangeAvoidSpots([...avoidSpots, tag]);
    }
  };

  const handleAddCustomNg = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newNgInput.trim();
    if (!trimmed || !onChangeAvoidSpots) return;
    if (!avoidSpots.includes(trimmed)) {
      onChangeAvoidSpots([...avoidSpots, trimmed]);
    }
    setNewNgInput("");
  };

  const handleResetRoute = () => {
    onCancelRoute();
    setPromptText("");
  };

  // 案内ステップ計算
  const segs = activeRoute.segments;
  const curIdx = guideStepIndex !== null ? Math.min(guideStepIndex, segs.length - 1) : 0;
  const curSeg = segs[curIdx];
  const nextSeg = segs[curIdx + 1] ?? null;
  const afterNextSeg = segs[curIdx + 2] ?? null;

  const turnInfo = curSeg
    ? computeTurnDirection(curSeg.from, curSeg.to, nextSeg ? nextSeg.to : null)
    : { actionText: "直進", type: "straight" as TurnDirectionType };

  const nextPreviewText = (() => {
    if (nextSeg && afterNextSeg) {
      const nextTurn = computeTurnDirection(
        nextSeg.from,
        nextSeg.to,
        afterNextSeg.to
      );
      return `${nextSeg.distanceM ?? 100}m ${nextTurn.actionText.replace("先、", "")}（${afterNextSeg.label}）`;
    }
    if (nextSeg) {
      return `${nextSeg.distanceM ?? 100}m 先で ${destination || "目的地"} 到着`;
    }
    return `まもなく ${destination || "目的地"} に到着します`;
  })();

  const totalSegmentMeters = segs.reduce((acc, s) => acc + (s.distanceM || 0), 0);
  const remainSegmentMeters = segs
    .slice(curIdx)
    .reduce((acc, s) => acc + (s.distanceM || 0), 0);
  const remainRatio =
    totalSegmentMeters > 0
      ? Math.max(0.03, remainSegmentMeters / totalSegmentMeters)
      : Math.max(0.05, (segs.length - curIdx) / Math.max(1, segs.length));

  const baseTotalMin =
    activeRoute.totalMinutes ||
    (activeRoute.apiData?.metrics?.duration_seconds
      ? Math.max(1, Math.round(activeRoute.apiData.metrics.duration_seconds / 60))
      : parseInt(activeRoute.durationText, 10) || 20);
  const baseTotalKm =
    activeRoute.totalKm ||
    (activeRoute.apiData?.metrics?.distance_meters
      ? activeRoute.apiData.metrics.distance_meters / 1000
      : parseFloat(activeRoute.distanceText) || 1.5);

  const remainMin = Math.max(1, Math.round(baseTotalMin * remainRatio));
  const remainKm = (
    totalSegmentMeters > 0 ? remainSegmentMeters / 1000 : baseTotalKm * remainRatio
  ).toFixed(1);

  return (
    <>
      {/* 1. 上部ヘッダー（モード切替タブ ＆ 地点入力／散歩概要 一体型バー） */}
      <div
        className={`pointer-events-none absolute inset-x-0 top-0 z-30 transition-all duration-300 ease-in-out ${
          isUiHidden ? "-translate-y-[calc(100%+32px)] opacity-0" : "translate-y-0 opacity-100"
        }`}
      >
        {!isGuiding ? (
          <HeaderEndpointsBar
            origin={origin}
            waypoints={waypoints}
            destination={destination}
            activeRoute={activeRoute}
            isRouteActive={isRouteActive}
            isTraditional={isTraditional}
            isDark={isDark}
            surfacePill={surfacePill}
            language={language}
            settingsOpen={settingsOpen}
            isToiletOn={isToiletOn}
            setSettingsOpen={setSettingsOpen}
            onChangeOrigin={onChangeOrigin}
            onAddWaypoint={onAddWaypoint}
            onChangeWaypoint={onChangeWaypoint}
            onRemoveWaypoint={onRemoveWaypoint}
            onClearWaypoints={onClearWaypoints}
            onChangeDestination={onChangeDestination}
            onSwapEndpoints={onSwapEndpoints}
            onToggleTheme={onToggleTheme}
            onChangeThemeMode={onChangeThemeMode}
            onChangeLanguage={onChangeLanguage}
            onOpenPersonaModal={() => setIsPersonaModalOpen(true)}
            onSubmitPrompt={onSubmitPrompt}
            onOpenInsight={onOpenInsight}
            onCancelRoute={handleResetRoute}
            isLoading={isLoading}
            onHideUi={onHideUi}
            mainTab={mainTab}
            onChangeMainTab={onChangeMainTab}
            sanpoRouteCount={sanpoPosts.length || sanpoRouteCount}
            onOpenCreateSanpo={onOpenCreateSanpo || onOpenSanpoShare || (() => {})}
            onOpenAllListModal={onOpenSanpoShare}
          />
        ) : (
          <GuidanceHUD
            activeRoute={activeRoute}
            guideStepIndex={guideStepIndex}
            autoPlayGuide={autoPlayGuide}
            destination={destination}
            isTraditional={isTraditional}
            isDark={isDark}
            surfacePill={surfacePill}
            language={language}
            turnInfo={turnInfo}
            nextPreviewText={nextPreviewText}
            remainMin={remainMin}
            remainKm={remainKm}
            onExitGuide={onExitGuide}
            onPrevStep={onPrevStep}
            onNextStep={onNextStep}
            onToggleAutoPlay={onToggleAutoPlay}
            onCompleteAndShare={() => onShareRoute?.(activeRoute)}
          />
        )}
      </div>

      {/* 2. 下部フローティングエリア（全画面時は画面下外へ退避） */}
      <section
        className={`pointer-events-none absolute inset-x-0 bottom-3 z-30 flex flex-col items-center gap-2 w-full px-0 md:bottom-5 transition-all duration-300 ease-in-out ${
          isUiHidden
            ? "translate-y-[calc(100%+48px)] opacity-0"
            : "translate-y-0 opacity-100"
        }`}
      >
        {/* スタート地点移動ボタン */}
        <div className="pointer-events-auto self-end mr-3.5 md:mr-6 flex flex-col gap-2 transition-all duration-300">
          <button
            type="button"
            onClick={onRecenter}
            title={isTraditional ? t.recenterTrad : t.recenter}
            className={`flex h-12 w-12 items-center justify-center rounded-2xl border shadow-lg backdrop-blur-2xl transition active:scale-95 ${
              isTraditional
                ? isDark
                  ? "border-amber-700/60 bg-[#1e1b18]/90 text-red-400 shadow-black/50 hover:bg-[#282420]"
                  : "border-amber-800/40 bg-[#faf6ed]/95 text-[#C73E3A] shadow-amber-950/15 hover:bg-amber-100/80"
                : isDark
                ? "border-zinc-800/60 bg-zinc-950/75 text-[#4285F4] hover:bg-zinc-900/80"
                : "border-zinc-200/60 bg-white/75 text-[#4285F4] hover:bg-zinc-100/80"
            }`}
          >
            {isTraditional ? (
              <ToriiIcon size={24} className="text-[#C73E3A]" />
            ) : (
              <RuneIcon name="tools-map-pin" size={20} className="text-[#4285F4]" />
            )}
          </button>
        </div>

        {/* ピン選択時のスポット詳細カード: ルートカード同様に中央下部（プロンプトバー直上）に表示。細身デザイン＆下部に隙間を配置 */}
        {selectedPin && !isGuiding && (
          <div className="w-full flex justify-center mb-2 sm:mb-2.5 transition-all pointer-events-auto px-3">
            <div
              data-pin-card="true"
              className={`w-[min(80vw,300px)] rounded-[26px] border p-3 transition-all backdrop-blur-2xl shadow-xl ${
                isTraditional
                  ? isDark
                    ? "border-amber-700/60 bg-[#1e1b18]/95 text-amber-50 shadow-[0_12px_40px_rgba(0,0,0,0.8)] washi-pattern font-serif ring-1 ring-amber-600/30"
                    : "border-amber-800/30 bg-[#faf6ed]/95 text-stone-900 shadow-[0_10px_35px_rgba(90,50,20,0.15)] washi-pattern font-serif ring-1 ring-amber-900/10"
                  : isDark
                  ? "border-zinc-800/60 bg-zinc-950/85 text-zinc-100 shadow-[0_12px_40px_-8px_rgba(0,0,0,0.6)]"
                  : "border-white/60 bg-white/85 text-zinc-900 shadow-[0_8px_32px_rgba(0,0,0,0.08)]"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`inline-block h-2 w-2 rounded-full ring-2 shadow-sm ${
                        selectedPin.isCustomDrop
                          ? "bg-[#EA4335] ring-[#EA4335]/20"
                          : "bg-[#4285F4] ring-[#4285F4]/20"
                      }`}
                    />
                    <span
                      className={`text-[9.5px] font-extrabold tracking-tight ${
                        isTraditional
                          ? "text-amber-700 dark:text-amber-400 font-serif"
                          : "text-zinc-500 dark:text-zinc-400"
                      }`}
                    >
                      <UiText text={selectedPin.categoryLabel} />
                    </span>
                  </div>
                  <h3 className="mt-0.5 text-[13px] font-black tracking-tight truncate">
                    <UiText text={selectedPin.name} />
                  </h3>
                  {selectedPin.description ? (
                    <p
                      className={`mt-0.5 text-[10.5px] leading-relaxed line-clamp-1 ${
                        isTraditional
                          ? "text-stone-600 dark:text-amber-200/70 font-serif"
                          : "text-zinc-500 dark:text-zinc-400"
                      }`}
                    >
                      <UiText text={selectedPin.description} />
                    </p>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={onClosePinCard}
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-500/10 hover:text-[#EA4335] transition active:scale-95 -mr-0.5"
                  aria-label={ui("閉じる")}
                >
                  <RuneIcon name="indicators-x" size={11} />
                </button>
              </div>

              <div className="mt-2.5 flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    onWalkToSpot?.(selectedPin.name, {
                      lat: selectedPin.lat,
                      lng: selectedPin.lng,
                    });
                    onClosePinCard?.();
                  }}
                  className={`flex-1 flex items-center justify-center gap-1 rounded-full py-1.5 px-2.5 text-[11px] font-bold whitespace-nowrap shadow-sm transition active:scale-95 ${
                    isTraditional
                      ? "bg-[#C73E3A] hover:bg-red-800 text-amber-100 font-serif"
                      : "bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
                  }`}
                >
                  <RuneIcon name="tools-map-pin" size={11} />
                  <span><UiText text={"目的地に設定"} /></span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onAddWaypointFromSnap?.(selectedPin.name, {
                      lat: selectedPin.lat,
                      lng: selectedPin.lng,
                    });
                    onClosePinCard?.();
                  }}
                  className={`rounded-full border py-1.5 px-2.5 text-[11px] font-bold whitespace-nowrap transition active:scale-95 shrink-0 ${
                    isTraditional
                      ? "border-amber-800/30 bg-amber-500/10 hover:bg-amber-500/20 text-amber-900 dark:text-amber-200 font-serif"
                      : "border-zinc-200 dark:border-zinc-800 bg-zinc-100/80 dark:bg-zinc-800/80 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300"
                  }`}
                >
                  <UiText text={"＋経由地"} /></button>
              </div>
            </div>
          </div>
        )}

        {/* 散歩モード時: 散歩コースカルーセル */}
        {mainTab === "sanpo" && !isPinCardOpen && !selectedPin && (
          <SanpoCarousel
            posts={sanpoPosts}
            activePost={activeSanpoPost || null}
            isTraditional={isTraditional}
            isDark={isDark}
            language={language}
            onSelectPost={onSelectSanpoPost || (() => {})}
            onWalkThisRoute={onWalkThisSanpoRoute || (() => {})}
            onWalkThisRouteReversed={onWalkThisSanpoRouteReversed}
            onToggleLike={onToggleSanpoLike || (() => {})}
            onOpenCreatePost={onOpenCreateSanpo || onOpenSanpoShare}
            isLoading={isLoading}
          />
        )}

        {/* ルートモード時: 横カルーセル（QuickActions削除分、高さを最適化して下へ配置。ピンカード展開時は退避して重なり防止） */}
        {mainTab === "route" && !isGuiding && isRouteActive && !isPinCardOpen && !selectedPin && (
          <div className="w-full flex justify-center -mb-2 sm:-mb-2.5 transition-all">
            <RouteCarousel
              routeCandidates={routeCandidates}
              activeRoute={activeRoute}
              activeRouteIndex={activeRouteIndex}
              isTraditional={isTraditional}
              isDark={isDark}
              language={language}
              onSelectRouteIndex={onSelectRouteIndex}
              onStartGuide={onStartGuide}
              onOpenInsight={onOpenInsight}
              onShareRoute={onShareRoute}
              onCancelRoute={handleResetRoute}
              onSwapEndpoints={onSwapEndpoints}
              onExploreNewRoute={onExploreNewRoute}
              isLoading={isLoading}
            />
          </div>
        )}

        {/* ルート検索失敗時のエラーカード（プロンプト窓のすぐ上に表示） */}
        {routeError && !isGuiding && (
          <div className="w-full flex justify-center pointer-events-auto px-3 sm:px-4 z-40 transition-all duration-200">
            <div
              role="alert"
              className={`flex items-start gap-2.5 rounded-2xl border px-3.5 py-2.5 text-xs sm:text-sm shadow-xl backdrop-blur-xl w-full max-w-lg transition-all ${
                isTraditional
                  ? "border-red-800/40 bg-[#2a1311]/95 text-red-200 font-serif"
                  : isDark
                  ? "border-red-900/60 bg-red-950/90 text-red-200 shadow-red-950/40"
                  : "border-red-200 bg-red-50/95 text-red-900 shadow-red-900/10"
              }`}
            >
              <span className="text-base leading-none shrink-0 mt-0.5">⚠️</span>
              <span className="flex-1 font-semibold leading-relaxed">{routeError}</span>
              {onClearRouteError && (
                <button
                  type="button"
                  onClick={onClearRouteError}
                  aria-label="エラーを閉じる"
                  className="shrink-0 rounded-full h-5 w-5 flex items-center justify-center text-sm font-bold opacity-70 hover:opacity-100 hover:bg-black/10 dark:hover:bg-white/10 transition active:scale-95"
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        )}

        {/* 統合プロンプト入力バー（AIルート & 散歩シェア両対応 ＋ 左端[＋]ボタンからオプション展開） */}
        {!isGuiding && (
          <div className="w-full flex justify-center pointer-events-none">
            <PromptInputBar
              isLoading={isLoading}
              realThinkingStage={realThinkingStage}
              isTraditional={isTraditional}
              isDark={isDark}
              isRouteActive={isRouteActive}
              language={language}
              promptText={promptText}
              setPromptText={setPromptText}
              handleSubmit={handleSubmit}
              handleResetRoute={handleResetRoute}
              mainTab={mainTab}
              isToiletOn={isToiletOn}
              handleToggleToilet={handleToggleToilet}
              avoidSpots={avoidSpots}
              handleToggleNgPreset={handleToggleNgPreset}
              handleAddCustomNg={handleAddCustomNg}
              newNgInput={newNgInput}
              setNewNgInput={setNewNgInput}
              customSystemPrompt={customSystemPrompt}
              onOpenPersonaModal={() => setIsPersonaModalOpen(true)}
              onGenerateLoopWalk={onGenerateLoopWalk}
              onExploreNewRoute={onExploreNewRoute}
              walkedSpotsCount={walkedSpotsCount}
              searchMatchInfo={searchMatchInfo}
              onClearSearchMatch={onClearSearchMatch}
            />
          </div>
        )}

        {/* 案内モード時: 下部ステータス ＆ ステップ操作ピル */}
        {isGuiding && (
          <GuidanceBottomHUD
            activeRoute={activeRoute}
            guideStepIndex={guideStepIndex}
            autoPlayGuide={autoPlayGuide}
            isTraditional={isTraditional}
            isDark={isDark}
            surfacePill={surfacePill}
            remainMin={remainMin}
            remainKm={remainKm}
            onPrevStep={onPrevStep}
            onNextStep={onNextStep}
            onToggleAutoPlay={onToggleAutoPlay}
            onCompleteAndShare={() => onShareRoute?.(activeRoute)}
          />
        )}
      </section>

      {/* 全画面イマージブマップ時の控えめなインジケーター（タップでも復帰可能） */}
      {isUiHidden && (
        <div className="pointer-events-auto fixed top-3 left-1/2 -translate-x-1/2 z-40 transition-all duration-300">
          <button
            type="button"
            onClick={() => {
              blockMapPinTemporarily(400);
              onRestoreUi?.();
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border shadow-xl backdrop-blur-xl text-[11px] font-bold tracking-tight transition active:scale-95 ${
              isTraditional
                ? isDark
                  ? "border-amber-700/60 bg-[#1e1b18]/85 text-amber-200"
                  : "border-amber-800/30 bg-[#faf6ed]/90 text-stone-800"
                : isDark
                ? "border-zinc-800/80 bg-zinc-950/80 text-zinc-300 hover:text-white"
                : "border-zinc-200/80 bg-white/85 text-zinc-700 hover:text-zinc-950"
            }`}
          >
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span><UiText text={"地図をタップしてメニューを復帰"} /></span>
          </button>
        </div>
      )}

      {/* AI設定・ペルソナモーダル */}
      <PersonaModal
        isOpen={isPersonaModalOpen}
        onClose={() => setIsPersonaModalOpen(false)}
        isTraditional={isTraditional}
        isDark={isDark}
        language={language}
        customSystemPrompt={customSystemPrompt}
        onChangeCustomSystemPrompt={onChangeCustomSystemPrompt}
        onChangeLanguage={onChangeLanguage}
      />
    </>
  );
};

export default FloatingHUD;
