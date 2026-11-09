import { UiText, useUiText } from "@/i18n/ui";
import { SanpoPostActions } from "@/components/SanpoPostActions";
import React, { useEffect, useRef, useState, useMemo } from "react";
import { WalkRealRoutePost } from "@/types/walkreal";
import { reverseSanpoPost } from "@/data/walkrealData";
import { ScrollCardFrame } from "@/components/traditional/TraditionalSvgs";
import { RuneIcon } from "@/components/ui/RuneIcon";
import { AppLanguage, I18N } from "./hudTypes";
import { getSanpoIdentitySync } from "@/services/sanpoFirebase";

interface SanpoCarouselProps {
  posts: WalkRealRoutePost[];
  activePost: WalkRealRoutePost | null;
  isTraditional: boolean;
  isDark: boolean;
  language: AppLanguage;
  onSelectPost: (post: WalkRealRoutePost) => void;
  onWalkThisRoute: (post: WalkRealRoutePost) => void;
  onWalkThisRouteReversed?: (post: WalkRealRoutePost) => void;
  onToggleLike: (postId: string) => void;
  onOpenCreatePost?: () => void;
  isLoading?: boolean;
}

const SanpoCardFrame: React.FC<{
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
      className={`rounded-[24px] border p-3 sm:p-3.5 transition-all select-none backdrop-blur-2xl cursor-pointer ${
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

export const SanpoCarousel: React.FC<SanpoCarouselProps> = ({
  posts,
  activePost,
  isTraditional,
  isDark,
  language,
  onSelectPost,
  onWalkThisRoute,
  onWalkThisRouteReversed,
  onToggleLike,
  isLoading = false,
}) => {
  const ui = useUiText();
  const t = I18N[language] ?? I18N.ja;
  const carouselRef = useRef<HTMLDivElement>(null);
  const isProgrammaticScroll = useRef(false);
  const programmaticScrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollDebounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentUid = useMemo(() => getSanpoIdentitySync() || undefined, []);

  // 専用操作ボタンまたは上下スワイプによるカード展開・格納（折りたたみ）状態
  const [isCollapsed, setIsCollapsed] = useState(false);
  const touchStartY = useRef<number | null>(null);
  const touchStartX = useRef<number | null>(null);
  const pointerStartY = useRef<number | null>(null);
  const pointerStartX = useRef<number | null>(null);

  // 検索終了時（isLoading: true -> false）や投稿一覧更新時は展開状態にする
  const prevLoadingRef = useRef(isLoading);
  const prevPostsCountRef = useRef(posts.length);
  useEffect(() => {
    const isSearchFinished = prevLoadingRef.current && !isLoading;
    const isPostsChanged = prevPostsCountRef.current !== posts.length;
    if (isSearchFinished || isPostsChanged) {
      setIsCollapsed(false);
    }
    prevLoadingRef.current = isLoading;
    prevPostsCountRef.current = posts.length;
  }, [isLoading, posts.length]);
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

  const activeIndex = Math.max(
    0,
    posts.findIndex((p) => p.id === activePost?.id)
  );

  // activePostが変わった時にカルーセルを中央へスクロール（祖先スクロールを防ぐ scrollTo を使用）
  useEffect(() => {
    if (!carouselRef.current || posts.length === 0) return;
    const el = carouselRef.current;
    const targetCard = el.children[activeIndex + 1] as HTMLElement | undefined;
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
  }, [activeIndex, isCollapsed, posts.length]);

  // タッチスワイプ検知（上下スワイプで折りたたみ・展開）
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartY.current === null) return;
    const dy = e.changedTouches[0].clientY - touchStartY.current;
    const dx = touchStartX.current !== null ? e.changedTouches[0].clientX - touchStartX.current : 0;

    if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 25) {
      if (dy > 25 && !isCollapsed) {
        setIsCollapsed(true);
      } else if (dy < -25 && isCollapsed) {
        setIsCollapsed(false);
      }
    }
    touchStartY.current = null;
    touchStartX.current = null;
  };

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

      const targetPost = posts[closestIndex];
      if (targetPost && targetPost.id !== activePost?.id) {
        onSelectPost(targetPost);
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
      {/* 上部操作バー: 展開/格納トグルボタン（RouteCarouselと統一） */}
      <div className="flex items-center justify-center gap-2 w-full pb-1.5 px-4">
        <button
          type="button"
          onClick={() => setIsCollapsed((prev) => !prev)}
          title={isCollapsed ? ui(ui("上へスワイプまたはタップでルートカードを展開")) : ui(ui("下へスワイプまたはタップでルートカードを格納"))}
          className={`group flex items-center gap-1.5 px-3 py-1 rounded-full border shadow-sm backdrop-blur-2xl text-[11px] font-bold transition active:scale-95 ${
            isTraditional
              ? isDark
                ? "border-amber-700/50 bg-[#1e1b18]/90 text-amber-200 hover:bg-[#282420] font-serif"
                : "border-amber-800/30 bg-[#faf6ed]/95 text-stone-800 hover:bg-amber-100/80 font-serif"
              : isDark
              ? "border-white/[0.08] bg-zinc-900/85 text-zinc-300 hover:bg-zinc-800 hover:text-white"
              : "border-black/[0.06] bg-white/85 text-zinc-700 hover:bg-white hover:text-zinc-950"
          }`}
        >
          <span
            className={`inline-block text-[9px] opacity-70 transition-transform duration-300 ease-out ${
              isCollapsed ? "rotate-180" : "rotate-0"
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
          if (isCollapsed) setIsCollapsed(false);
        }}
      >
        <div
          ref={carouselRef}
          onScroll={handleCarouselScroll}
          className="flex w-full overflow-x-auto overflow-y-hidden no-scrollbar snap-x snap-mandatory pt-0.5 pb-1 gap-3 items-start justify-start scroll-smooth touch-pan-x overscroll-x-contain overscroll-y-none"
        >
          {/* 先頭カード中央配置用スペーサー */}
          <div
            aria-hidden="true"
            className="shrink-0 pointer-events-none"
            style={{
              width: `calc(50% - ${cardWidth / 2 + gap}px)`,
            }}
          />

          {posts.map((post, idx) => {
            const isSelected = post.id === activePost?.id;

            return (
              <div
                key={post.id}
                onClick={(e) => {
                  e.stopPropagation();
                  if (isCollapsed) {
                    setIsCollapsed(false);
                  }
                  onSelectPost(post);
                }}
                style={{ width: `${cardWidth}px` }}
                className="snap-center shrink-0 touch-pan-x select-none"
              >
                <SanpoCardFrame
                  isSelected={isSelected}
                  isTraditional={isTraditional}
                  isDark={isDark}
                  isCollapsed={isCollapsed}
                >
                  {/* 1段目: 所要時間・距離 ＋ このルートを歩くCTA（選択中のみ） */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-baseline gap-2 min-w-0">
                      <span
                        className={`text-xl sm:text-2xl font-black tracking-tight whitespace-nowrap shrink-0 ${
                          isTraditional ? "font-serif" : ""
                        } ${
                          isSelected
                            ? isDark
                              ? isTraditional ? "text-amber-100" : "text-white"
                              : isTraditional ? "text-stone-900" : "text-zinc-950"
                            : isDark
                              ? isTraditional ? "text-amber-200/80" : "text-zinc-200"
                              : isTraditional ? "text-stone-700" : "text-zinc-800"
                        }`}
                      >
                        {post.durationMin}<UiText text={"分"} /></span>
                      <span className="text-xs font-bold text-zinc-400 flex items-center gap-1.5 whitespace-nowrap shrink-0">
                        <span className={isTraditional ? "font-serif text-stone-500 dark:text-amber-200/60" : ""}>
                          {post.distanceKm} km
                        </span>
                        {post.elevationGainM > 0 && (
                          <span className="text-[11px] opacity-80">· ↗{post.elevationGainM}m</span>
                        )}
                      </span>
                    </div>

                    {isSelected ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onWalkThisRoute(post);
                        }}
                        className={`px-3 py-1.5 text-xs font-bold shadow-sm transition active:scale-95 whitespace-nowrap shrink-0 ${
                          isTraditional
                            ? "rounded-md bg-gradient-to-r from-red-700 to-amber-700 hover:from-red-800 hover:to-amber-800 text-amber-100 border border-amber-300/40 font-serif"
                            : "rounded-full bg-zinc-950 text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200"
                        }`}
                      >
                        {isTraditional ? t.startGuideTrad : <UiText text={"このルートを歩く"} />}
                      </button>
                    ) : (
                      <span className="text-[11px] text-zinc-400 whitespace-nowrap shrink-0">
                        {isTraditional ? <UiText text={"選択"} /> : <UiText text={"タップで選択"} />}
                      </span>
                    )}
                  </div>

                  {/* 2段目: コースタイトル */}
                  <div
                    className={`mt-1.5 text-xs flex justify-between w-full items-center sm:text-sm font-extrabold truncate tracking-tight ${
                      isTraditional
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
                    {<UiText text={post.title} />}
                  </div>

                  {/* 3段目: コース概要コメント */}
                  <div
                    className={`mt-0.5 text-[11px] sm:text-xs line-clamp-2 leading-snug ${
                      isTraditional
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
                    {<UiText text={post.summary} />}
                  </div>

                  {/* 投稿者・スポット数補足 */}
                  <div
                    className={`mt-1 flex items-center gap-x-2 text-[10px] font-semibold truncate transition-opacity duration-200 ${
                      isCollapsed ? "opacity-0 pointer-events-none" : "opacity-100"
                    } ${isDark ? "text-zinc-400" : "text-zinc-500"}`}
                  >
                    <span className="truncate">{post.authorName}</span>
                    <span className="shrink-0">·</span>
                    <span className="whitespace-nowrap shrink-0">{post.snaps.length}<UiText text={"ヶ所のスポット"} /></span>
                  </div>

                  {isSelected && !isCollapsed && (
                    <SanpoPostActions key={post.id} post={post} currentUid={currentUid} />
                  )}

                  {/* 4段目（選択中カードのみ）: いいねボタン・逆向き ＆ インデックス */}
                  {isSelected && (
                    <div
                      className={`mt-2 flex items-center justify-between gap-2 border-t pt-2 transition-opacity duration-200 ${
                        isCollapsed ? "opacity-0 pointer-events-none" : "opacity-100"
                      } ${
                        isTraditional
                          ? "border-amber-800/20 dark:border-amber-700/30 font-serif"
                          : "border-black/[0.06] dark:border-white/[0.06]"
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggleLike(post.id);
                          }}
                          className={`flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold whitespace-nowrap shrink-0 transition active:scale-95 ${
                            post.likedByMe
                              ? "bg-rose-500/10 text-rose-600 dark:text-rose-400"
                              : "bg-black/[0.04] dark:bg-white/[0.06] text-zinc-600 dark:text-zinc-300 hover:bg-black/[0.08] dark:hover:bg-white/[0.1]"
                          }`}
                          title={post.likedByMe ? ui(ui("いいねを取り消す")) : ui(ui("いいねする"))}
                        >
                          <span>{post.likedByMe ? "❤️" : "🤍"}</span>
                          <span>{post.likesCount}</span>
                        </button>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (onWalkThisRouteReversed) {
                              onWalkThisRouteReversed(post);
                            } else {
                              onWalkThisRoute(reverseSanpoPost(post));
                            }
                          }}
                          title={ui("逆向き（ゴールからスタート）で歩く")}
                          className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold transition active:scale-95 flex items-center gap-1 whitespace-nowrap shrink-0 ${
                            isTraditional
                              ? "bg-amber-800/10 text-amber-800 dark:text-amber-300"
                              : "bg-black/[0.04] hover:bg-black/[0.08] text-zinc-600 dark:bg-white/[0.06] dark:hover:bg-white/[0.12] dark:text-zinc-300"
                          }`}
                        >
                          <RuneIcon name="arrows-arrow-up-down" size={10} />
                          <span><UiText text={"逆向き"} /></span>
                        </button>
                      </div>

                      <span className="text-[10px] text-zinc-400 font-mono whitespace-nowrap shrink-0">
                        {idx + 1}/{posts.length}
                      </span>
                    </div>
                  )}
                </SanpoCardFrame>
              </div>
            );
          })}

          {/* 末尾カード中央配置用スペーサー */}
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
