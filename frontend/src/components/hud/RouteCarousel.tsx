import { UiText, useUiText } from "@/i18n/ui";
import React, { useEffect, useRef, useState } from "react";
import { formatDuration } from "@/data/complexRoutes";
import { ComputedRoute } from "@/types/route";
import { ScrollCardFrame, HankoStamp } from "@/components/traditional/TraditionalSvgs";
import { RuneIcon } from "@/components/ui/RuneIcon";
import { AppLanguage, I18N } from "./hudTypes";

interface RouteCarouselProps {
  routeCandidates?: ComputedRoute[];
  activeRoute: ComputedRoute;
  activeRouteIndex: number;
  isTraditional: boolean;
  isDark: boolean;
  language: AppLanguage;
  onSelectRouteIndex?: (index: number) => void;
  onStartGuide: () => void;
  onOpenInsight: (tab: "answer" | "compare") => void;
  onShareRoute?: (route: ComputedRoute) => void;
  onCancelRoute?: () => void;
  onSwapEndpoints?: () => void;
  onExploreNewRoute?: () => void;
  isLoading?: boolean;
}

const RouteCardFrame: React.FC<{
  isSelected: boolean;
  isTraditional: boolean;
  isDark: boolean;
  isCollapsed: boolean;
  children: React.ReactNode;
}> = ({ isSelected, isTraditional, isDark, isCollapsed, children }) => {
  if (isTraditional) {
    return (
      <ScrollCardFrame
        isSelected={isSelected}
        isDark={isDark}
        className={`p-3 select-none font-serif cursor-pointer ${
          isCollapsed
            ? isDark ? "!bg-[#1e1b18] shadow-md" : "!bg-[#faf6ed] shadow-sm"
            : "backdrop-blur-2xl"
        }`}
      >
        {children}
      </ScrollCardFrame>
    );
  }
  return (
    <div
      className={`rounded-[24px] border p-3 sm:p-3.5 transition-all select-none backdrop-blur-2xl ${
        isSelected
          ? isDark
            ? "border-white/[0.14] bg-zinc-900/90 text-zinc-50 shadow-lg"
            : "border-black/[0.1] bg-white/90 text-zinc-950 shadow-md"
          : isDark
            ? "border-white/[0.06] bg-zinc-950/75 text-zinc-400 shadow-xs hover:bg-zinc-900/80 hover:text-zinc-200"
            : "border-black/[0.05] bg-white/75 text-zinc-600 shadow-xs hover:bg-white/85 hover:text-zinc-900"
      }`}
    >
      {children}
    </div>
  );
};

export const RouteCarousel: React.FC<RouteCarouselProps> = ({
  routeCandidates = [],
  activeRoute,
  activeRouteIndex,
  isTraditional,
  isDark,
  language,
  onSelectRouteIndex,
  onStartGuide,
  onOpenInsight,
  onShareRoute,
  onCancelRoute,
  onSwapEndpoints,
  onExploreNewRoute,
  isLoading = false,
}) => {
  const ui = useUiText();
  const t = I18N[language] ?? I18N.ja;
  const carouselRef = useRef<HTMLDivElement>(null);
  const isProgrammaticScroll = useRef(false);
  const programmaticScrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollDebounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 専用操作ボタンまたは上下スワイプによるカード展開・格納（折りたたみ）状態
  const [isCollapsed, setIsCollapsed] = useState(false);
  const touchStartY = useRef<number | null>(null);
  const touchStartX = useRef<number | null>(null);
  const pointerStartY = useRef<number | null>(null);
  const pointerStartX = useRef<number | null>(null);

  // ルート検索終了時（isLoading: true -> false）やルート更新・検索直後は確実に展開状態にする
  const prevLoadingRef = useRef(isLoading);
  const prevDurationRef = useRef(activeRoute.durationText);
  const prevCandidatesCountRef = useRef(routeCandidates.length);
  const prevActiveRouteRef = useRef(activeRoute);

  useEffect(() => {
    const isSearchFinished = prevLoadingRef.current && !isLoading;
    const isRouteChanged =
      prevDurationRef.current !== activeRoute.durationText ||
      prevCandidatesCountRef.current !== routeCandidates.length ||
      prevActiveRouteRef.current !== activeRoute;

    if (isSearchFinished || isRouteChanged) {
      setIsCollapsed(false);
    }

    prevLoadingRef.current = isLoading;
    prevDurationRef.current = activeRoute.durationText;
    prevCandidatesCountRef.current = routeCandidates.length;
    prevActiveRouteRef.current = activeRoute;
  }, [isLoading, activeRoute, activeRoute.durationText, routeCandidates.length]);

  const displayCards =
    routeCandidates.length > 0 ? routeCandidates : [activeRoute];

  const [isDesktop, setIsDesktop] = useState(
    typeof window !== "undefined" ? window.innerWidth >= 768 : false
  );
  useEffect(() => {
    const handleResize = () => setIsDesktop(window.innerWidth >= 768);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);
  const cardWidth = isDesktop ? 340 : 308;
  const gap = 10;

  // activeRouteIndexが変わった時にカルーセルを中央へスクロール（祖先スクロールを防ぐ scrollTo を使用）
  useEffect(() => {
    if (!carouselRef.current) return;
    const el = carouselRef.current;
    const targetCard = el.children[activeRouteIndex + 1] as HTMLElement | undefined;
    if (!targetCard) return;

    isProgrammaticScroll.current = true;
    if (programmaticScrollTimerRef.current) clearTimeout(programmaticScrollTimerRef.current);

    const targetLeft = targetCard.offsetLeft - (el.clientWidth - targetCard.offsetWidth) / 2;
    el.scrollTo({
      left: targetLeft,
      behavior: "smooth",
    });

    programmaticScrollTimerRef.current = setTimeout(() => {
      isProgrammaticScroll.current = false;
    }, 600);

    return () => {
      if (programmaticScrollTimerRef.current) clearTimeout(programmaticScrollTimerRef.current);
    };
  }, [activeRouteIndex, isCollapsed]);

  // タッチスワイプ検知（縦スワイプ優先判定）
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartY.current === null) return;
    const dy = e.changedTouches[0].clientY - touchStartY.current;
    const dx = touchStartX.current !== null ? e.changedTouches[0].clientX - touchStartX.current : 0;

    // 縦方向の移動が横方向より大きく、一定量（25px）以上動いた場合
    if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 25) {
      if (dy > 25 && !isCollapsed) {
        // 下スワイプで格納
        setIsCollapsed(true);
      } else if (dy < -25 && isCollapsed) {
        // 上スワイプで展開
        setIsCollapsed(false);
      }
    }
    touchStartY.current = null;
    touchStartX.current = null;
  };

  // マウス/ポインタドラッグ検知（PCトラックパッド対応）
  const handlePointerDown = (e: React.PointerEvent) => {
    pointerStartY.current = e.clientY;
    pointerStartX.current = e.clientX;
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (pointerStartY.current === null) return;
    const dy = e.clientY - pointerStartY.current;
    const dx = pointerStartX.current !== null ? e.clientX - pointerStartX.current : 0;

    if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 30) {
      if (dy > 30 && !isCollapsed) {
        setIsCollapsed(true);
      } else if (dy < -30 && isCollapsed) {
        setIsCollapsed(false);
      }
    }
    pointerStartY.current = null;
    pointerStartX.current = null;
  };

  const handleCarouselScroll = () => {
    if (isProgrammaticScroll.current || !carouselRef.current) return;
    if (scrollDebounceTimerRef.current) clearTimeout(scrollDebounceTimerRef.current);

    // スクロールが完全に静止した後にのみ中央カード判定を行う（ピンポン・連発ループ防止）
    scrollDebounceTimerRef.current = setTimeout(() => {
      if (isProgrammaticScroll.current || !carouselRef.current) return;
      const el = carouselRef.current;
      const center = el.scrollLeft + el.clientWidth / 2;
      const children = Array.from(el.children) as HTMLElement[];
      const cardElements = children.slice(1, children.length - 1);
      if (cardElements.length === 0) return;

      let closestIndex = 0;
      let closestDist = Infinity;

      cardElements.forEach((child, idx) => {
        const childCenter = child.offsetLeft + child.offsetWidth / 2;
        const dist = Math.abs(childCenter - center);
        if (dist < closestDist) {
          closestDist = dist;
          closestIndex = idx;
        }
      });

      if (closestIndex !== activeRouteIndex && onSelectRouteIndex) {
        onSelectRouteIndex(closestIndex);
      }
    }, 150);
  };

  return (
    <div
      className="pointer-events-auto w-full flex flex-col items-center max-w-full md:max-w-4xl transition-all duration-300 ease-out select-none touch-pan-x overscroll-y-none overflow-y-hidden"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
    >
      {/* 上部操作バー: ✕ 探索終了 ＆ 展開/格納トグルボタン（統一されたガラスピル） */}
      <div className="flex items-center justify-center gap-2 w-full pb-1.5 px-4">
        {onCancelRoute && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onCancelRoute();
            }}
            title={isTraditional ? ui(ui("街道探索を終了して通常地図に戻る")) : ui(ui("ルート探索を終了して通常の地図に戻る"))}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full border shadow-sm backdrop-blur-2xl text-[11px] font-bold transition active:scale-95 ${isTraditional
                ? isDark
                  ? "border-red-500/40 bg-[#8A2422] text-amber-100 hover:bg-red-900 font-serif"
                  : "border-red-800/40 bg-[#C73E3A] text-amber-50 hover:bg-red-800 font-serif"
                : isDark
                  ? "border-red-500/40 bg-red-600/90 text-white hover:bg-red-500 shadow-red-950/40"
                  : "border-red-600/20 bg-[#EA4335] text-white hover:bg-red-600 shadow-red-500/20"
              }`}
          >
            <span className="text-[11px] leading-none opacity-90">✕</span>
            <span><UiText text={"探索を終了"} /></span>
          </button>
        )}

        {/* 展開/格納トグルボタン */}
        <button
          type="button"
          onClick={() => setIsCollapsed((c) => !c)}
          className={`group flex items-center gap-1.5 px-3 py-1 rounded-full border shadow-sm backdrop-blur-2xl text-[11px] font-bold transition active:scale-95 ${isTraditional
              ? isDark
                ? "border-amber-700/50 bg-[#1e1b18]/90 text-amber-200 hover:bg-[#282420] font-serif"
                : "border-amber-800/30 bg-[#faf6ed]/95 text-stone-800 hover:bg-amber-100/80 font-serif"
              : isDark
                ? "border-white/[0.08] bg-zinc-900/85 text-zinc-300 hover:bg-zinc-800 hover:text-white"
                : "border-black/[0.06] bg-white/85 text-zinc-700 hover:bg-white hover:text-zinc-950"
            }`}
          title={isCollapsed ? ui(ui("上へスワイプまたはタップでルートカードを展開")) : ui(ui("下へスワイプまたはタップでルートカードを格納"))}
        >
          <span
            className={`inline-block text-[9px] opacity-70 transition-transform duration-300 ease-out ${isCollapsed ? "rotate-180" : "rotate-0"
              }`}
          >
            ▼
          </span>
          <span>
            {isCollapsed
              ? (isTraditional ? <UiText text={"街道絵巻を展開"} /> : <UiText text={"ルートを展開"} />)
              : (isTraditional ? <UiText text={"地図を広く見る"} /> : <UiText text={"マップを広く見る"} />)}
          </span>
        </button>
      </div>

      {/* カルーセルラッパー（退避と展開のアニメーション対応。退避時もチラ見せヘッダーを残す） */}
      <div
        style={{
          maskImage: isCollapsed
            ? "linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 70%, rgba(0,0,0,0.4) 88%, rgba(0,0,0,0) 100%)"
            : "none",
          WebkitMaskImage: isCollapsed
            ? "linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 70%, rgba(0,0,0,0.4) 88%, rgba(0,0,0,0) 100%)"
            : "none",
        }}
        className={`relative w-full overflow-hidden transition-[max-height,opacity] duration-300 ease-out touch-pan-x overscroll-y-none ${
          isCollapsed
            ? "max-h-[56px] sm:max-h-[60px] opacity-80 cursor-pointer"
            : "max-h-[260px] sm:max-h-[280px] opacity-100"
        }`}
        onClick={() => {
          if (isCollapsed) {
            setIsCollapsed(false);
          }
        }}
      >
        <div
          ref={carouselRef}
          onScroll={handleCarouselScroll}
          className="flex w-full overflow-x-auto overflow-y-hidden no-scrollbar snap-x snap-mandatory pt-0.5 pb-2.5 gap-3 items-start justify-start scroll-smooth touch-pan-x overscroll-x-contain overscroll-y-none"
        >
          {/* 先頭カード（案1）を完全中央にするための前置スペーサー */}
          <div
            aria-hidden="true"
            className="shrink-0 pointer-events-none"
            style={{
              width: `calc(50% - ${cardWidth / 2 + gap}px)`,
            }}
          />

          {displayCards.map((r, idx) => {
            const isSelected = idx === activeRouteIndex;
            const metrics = r.apiData?.metrics;
            const baseline = r.baseline;
            const distanceDelta = metrics && baseline
              ? (metrics.distance_meters - baseline.distance_meters) / 1000
              : null;
            const durationDelta = metrics && baseline
              ? Math.round((metrics.duration_seconds - baseline.duration_seconds) / 60)
              : null;
            const viaNames = r.apiData?.waypoints.slice(1, -1).map((stop) => stop.name) ?? [];
            const formatDurationDelta = (minutes: number) => {
              const sign = minutes > 0 ? "+" : minutes < 0 ? "−" : "±";
              const abs = Math.abs(minutes);
              const hours = Math.floor(abs / 60);
              const rest = abs % 60;
              return `${sign}${hours ? `${hours}h ` : ""}${rest}m`;
            };
            const title =
              r.apiData?.title || r.modeLabel || (isTraditional ? `${idx === 0 ? "一" : idx === 1 ? "二" : "三"}之道` : `案${idx + 1}`);
            const subtitle =
              r.apiData?.concept ||
              r.callout?.text ||
              r.summaryBadge ||
              (isTraditional ? "歩行優先の推奨街道" : "歩道優先の推奨ルート");

            return (
              <div
                key={idx}
                onClick={() => {
                  if (isCollapsed) {
                    setIsCollapsed(false);
                  }
                  if (onSelectRouteIndex) onSelectRouteIndex(idx);
                }}
                style={{
                  width: `${cardWidth}px`,
                }}
                className="snap-center shrink-0 touch-pan-x select-none"
              >
                <RouteCardFrame
                  isSelected={isSelected}
                  isTraditional={isTraditional}
                  isDark={isDark}
                  isCollapsed={isCollapsed}
                >
                  {/* 1段目: 所要時間・距離 ＋ スコア ＋ 案内開始CTA（選択中のみ） */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-baseline gap-2 min-w-0">
                      <span
                        className={`text-xl sm:text-2xl font-bold tracking-tight whitespace-nowrap shrink-0 ${isTraditional ? "font-serif" : ""
                          } ${isSelected
                            ? isDark
                              ? isTraditional ? "text-amber-100" : "text-white"
                              : isTraditional ? "text-stone-900" : "text-zinc-950"
                            : isDark
                              ? isTraditional ? "text-amber-200/80" : "text-zinc-200"
                              : isTraditional ? "text-stone-700" : "text-zinc-800"
                          }`}
                      >
                        {formatDuration(r.durationText)}
                      </span>
                      <span className="text-xs font-bold text-zinc-400 flex items-center gap-1.5 whitespace-nowrap shrink-0">
                        <span className={isTraditional ? "font-serif text-stone-500 dark:text-amber-200/60" : ""}>{r.distanceText}</span>
                        {!r.apiData?.selection_role && r.apiData?.metrics?.route_score != null && (
                          isTraditional ? (
                            <span className="inline-flex items-center gap-0.5 font-serif text-[11px] font-black text-red-700 dark:text-red-400">
                              <HankoStamp text={idx === 0 ? "極" : "道"} size="sm" variant={idx === 0 ? "red" : "gold"} />
                              <span title={ui(ui("この検索内の候補を並べる参考値"))}>{Math.round(r.apiData.metrics.route_score)}</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center text-[11px] opacity-80">
                              · {Math.round(r.apiData.metrics.route_score)}<UiText text={"点"} />
                            </span>
                          )
                        )}
                      </span>
                    </div>

                    {isSelected ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onStartGuide();
                        }}
                        className={`px-3.5 py-1.5 text-xs font-bold shadow-sm transition active:scale-95 whitespace-nowrap shrink-0 ${isTraditional
                          ? "rounded-md bg-gradient-to-r from-red-700 to-amber-700 hover:from-red-800 hover:to-amber-800 text-amber-100 border border-amber-300/40 font-serif"
                          : "rounded-full bg-zinc-950 text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200"
                          }`}
                      >
                        {isTraditional ? t.startGuideTrad : t.startGuide}
                      </button>
                    ) : (
                      <span className="text-[11px] text-zinc-400 whitespace-nowrap shrink-0">
                        {isTraditional ? <UiText text={"選択"} /> : <UiText text={"タップで選択"} />}
                      </span>
                    )}
                  </div>

                  {/* 2段目: 案名（タイトル） */}
                  <div
                    className={`mt-1.5 text-xs flex justify-between w-full items-center sm:text-sm font-extrabold truncate tracking-tight ${isTraditional
                        ? isSelected
                          ? isDark
                            ? "font-serif text-amber-100"
                            : "font-serif text-stone-900"
                          : isDark
                            ? "font-serif text-amber-200/70"
                            : "font-serif text-stone-700"
                        : isSelected
                          ? "text-zinc-900 dark:text-zinc-100"
                          : "text-zinc-700 dark:text-zinc-300"
                      }`}
                  >
                    {title}
                  </div>

                  {/* 3段目: サブタイトル（メリット・コンセプト要約） */}
                  <div
                    className={`mt-0.5 text-[11px] sm:text-xs line-clamp-2 leading-snug ${isTraditional
                        ? isSelected
                          ? isDark
                            ? "font-serif text-amber-200/90"
                            : "font-serif text-stone-700"
                          : isDark
                            ? "font-serif text-stone-400"
                            : "font-serif text-stone-500"
                        : "text-zinc-500 dark:text-zinc-400"
                      }`}
                  >
                    {<UiText text={subtitle} />}
                  </div>

                  {( (distanceDelta !== null && durationDelta !== null) || viaNames.length > 0 ) && (
                    <div className={`mt-1 flex items-center gap-x-2 text-[10px] font-medium truncate transition-opacity duration-200 ${isCollapsed ? "opacity-0 pointer-events-none" : "opacity-100"
                      } ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
                      {distanceDelta !== null && durationDelta !== null && (
                        <span className="whitespace-nowrap shrink-0">
                          {language === "en" ? "vs std" : language === "zh" ? <UiText text={"较标准路线"} /> : <UiText text={"標準比"} />}{" "}
                          {<UiText text={`${distanceDelta > 0 ? "+" : distanceDelta < 0 ? "−" : "±"}${Math.abs(distanceDelta).toFixed(1)}km`} />} ({formatDurationDelta(durationDelta)})
                        </span>
                      )}
                      {viaNames.length > 0 && (
                        <span className={`truncate ${isDark ? "text-emerald-300/90" : "text-emerald-700"}`} title={viaNames.join(" → ")}>
                          {distanceDelta !== null && durationDelta !== null ? "· " : ""}
                          {viaNames.join(" → ")}
                        </span>
                      )}
                    </div>
                  )}

                  {/* 4段目（選択中カードのみ）: AI解説・逆転・未開拓 */}
                  {isSelected && (
                    <div className={`mt-2 flex items-center justify-between gap-1.5 border-t pt-2 transition-opacity duration-200 ${isCollapsed ? "opacity-0 pointer-events-none" : "opacity-100"
                      } ${isTraditional ? "border-amber-800/20 dark:border-amber-700/30 font-serif" : "border-black/[0.06] dark:border-white/[0.06]"
                      }`}>
                      <div className="flex items-center gap-1.5 min-w-0 overflow-x-auto no-scrollbar">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenInsight("answer");
                          }}
                          className={`rounded-full px-2 py-0.5 text-[11px] font-bold transition active:scale-95 flex items-center gap-1 whitespace-nowrap shrink-0 ${
                            isTraditional
                              ? "bg-red-700/10 text-red-700 dark:text-red-300"
                              : "bg-[#4285F4]/10 text-[#4285F4]"
                          }`}
                        >
                          <span>{isTraditional ? <UiText text={"📜 指南"} /> : <UiText text={"AI解説"} />}</span>
                        </button>

                        {onSwapEndpoints && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onSwapEndpoints();
                            }}
                            title={ui("出発地と目的地を入れ替えて逆転ルートを検索")}
                            className={`rounded-full px-2 py-0.5 text-[11px] font-bold transition active:scale-95 flex items-center gap-1 whitespace-nowrap shrink-0 ${
                              isTraditional
                                ? "bg-amber-800/10 text-amber-800 dark:text-amber-300"
                                : "bg-black/[0.04] dark:bg-white/[0.06] text-zinc-600 dark:text-zinc-300"
                            }`}
                          >
                            <RuneIcon name="arrows-arrow-up-down" size={10} />
                            <span><UiText text={"逆転"} /></span>
                          </button>
                        )}

                        {onExploreNewRoute && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onExploreNewRoute();
                            }}
                            title={ui("歩いた履歴や現在の経路を避けて未開拓ルートを探索")}
                            className={`rounded-full px-2 py-0.5 text-[11px] font-bold transition active:scale-95 flex items-center gap-1 whitespace-nowrap shrink-0 ${
                              isTraditional
                                ? "bg-emerald-800/10 text-emerald-800 dark:text-emerald-300"
                                : "bg-[#34A853]/10 text-[#34A853]"
                            }`}
                          >
                            <RuneIcon name="code-compass" size={10} />
                            <span><UiText text={"新ルート開拓"} /></span>
                          </button>
                        )}
                      </div>
                      <span className="text-[10px] text-zinc-400 font-mono whitespace-nowrap shrink-0">
                        {idx + 1}/{displayCards.length}
                      </span>
                    </div>
                  )}
                </RouteCardFrame>
              </div>
            );
          })}

          {/* 末尾カードを完全中央にするための後置スペーサー */}
          <div
            aria-hidden="true"
            className="shrink-0 pointer-events-none"
            style={{
              width: `calc(50% - ${cardWidth / 2 + gap}px)`,
            }}
          />
        </div>
      </div>
    </div>
  );
};
