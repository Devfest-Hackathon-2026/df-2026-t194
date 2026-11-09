import { UiText, useUiText } from "@/i18n/ui";
import React from "react";
import { RuneIcon } from "@/components/ui/RuneIcon";
import { ScrollRodsHeader, ToriiIcon } from "@/components/traditional/TraditionalSvgs";
import { AppLanguage, I18N, isCurrentLocationText } from "./hudTypes";
import { ThemeMode } from "@/types/theme";
import { ComputedRoute } from "@/types/route";
import { RouteCompareLegendCard } from "./RouteCompareLegendCard";
import { blockMapPinTemporarily } from "@/utils/mapPinGuard";

interface HeaderEndpointsBarProps {
  origin: string;
  waypoints: string[];
  destination: string;
  activeRoute: ComputedRoute;
  isRouteActive: boolean;
  isTraditional: boolean;
  isDark: boolean;
  surfacePill: string;
  language: AppLanguage;
  settingsOpen: boolean;
  isToiletOn: boolean;
  setSettingsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  onChangeOrigin: (val: string) => void;
  onAddWaypoint: () => void;
  onChangeWaypoint: (index: number, val: string) => void;
  onRemoveWaypoint: (index: number) => void;
  onClearWaypoints?: () => void;
  onChangeDestination: (val: string) => void;
  onSwapEndpoints: () => void;
  onToggleTheme: () => void;
  onChangeThemeMode?: (mode: ThemeMode) => void;
  onChangeLanguage?: (lang: AppLanguage) => void;
  onOpenPersonaModal: () => void;
  onSubmitPrompt: (prompt: string) => void;
  onOpenInsight: (tab: "answer" | "compare") => void;
  onCancelRoute?: () => void;
  isLoading?: boolean;
  onHideUi?: () => void;
  mainTab?: "route" | "sanpo";
  onChangeMainTab?: (tab: "route" | "sanpo") => void;
  sanpoRouteCount?: number;
  onOpenCreateSanpo?: () => void;
  onOpenAllListModal?: () => void;
}

export const HeaderEndpointsBar: React.FC<HeaderEndpointsBarProps> = ({
  origin,
  waypoints,
  destination,
  activeRoute,
  isRouteActive,
  isTraditional,
  isDark,
  surfacePill,
  language,
  settingsOpen,
  isToiletOn,
  setSettingsOpen,
  onChangeOrigin,
  onAddWaypoint,
  onChangeWaypoint,
  onRemoveWaypoint,
  onClearWaypoints,
  onChangeDestination,
  onSwapEndpoints,
  onToggleTheme,
  onChangeThemeMode,
  onChangeLanguage,
  onOpenPersonaModal,
  onSubmitPrompt,
  onOpenInsight,
  onCancelRoute,
  isLoading = false,
  onHideUi,
  mainTab = "route",
  onChangeMainTab,
  sanpoRouteCount = 0,
  onOpenCreateSanpo,
  onOpenAllListModal,
}) => {
  const ui = useUiText();
  const t = I18N[language] ?? I18N.ja;
  const touchStartPos = React.useRef<{ x: number; y: number } | null>(null);
  const settingsDropdownRef = React.useRef<HTMLDivElement>(null);

  // 設定ドロップダウン展開時、メニュー外側を押した際に閉じる
  React.useEffect(() => {
    if (!settingsOpen) return;
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (settingsDropdownRef.current && !settingsDropdownRef.current.contains(e.target as Node)) {
        blockMapPinTemporarily(400);
        setSettingsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside, { passive: true });
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, [settingsOpen, setSettingsOpen]);

  const handleTouchStart = (e: React.TouchEvent | React.PointerEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest("input, button, a, textarea")) return;
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    touchStartPos.current = { x: clientX, y: clientY };
  };

  const handleTouchEnd = (e: React.TouchEvent | React.PointerEvent) => {
    if (!touchStartPos.current) return;
    const clientX = "changedTouches" in e ? e.changedTouches[0].clientX : (e as React.PointerEvent).clientX;
    const clientY = "changedTouches" in e ? e.changedTouches[0].clientY : (e as React.PointerEvent).clientY;
    const deltaX = clientX - touchStartPos.current.x;
    const deltaY = clientY - touchStartPos.current.y;
    touchStartPos.current = null;

    if (deltaY < -28 && Math.abs(deltaY) > Math.abs(deltaX)) {
      onHideUi?.();
    }
  };

  const handleDestinationChange = (val: string) => {
    onChangeDestination(val);
    if (!val.trim()) {
      onClearWaypoints?.();
      onCancelRoute?.();
    }
  };

  const handleClearDestination = () => {
    onChangeDestination("");
    onClearWaypoints?.();
    onCancelRoute?.();
  };

  const handleDestinationSubmit = () => {
    if (!destination.trim()) return;
    let prompt = `${destination.trim()}まで`;
    if (isToiletOn && !/トイレ|お手洗い|restroom|toilet|洗手间|WC/i.test(prompt)) {
      const toiletSuffix =
        language === "en"
          ? " (prefer route with public restrooms on the way)"
          : language === "zh"
          ? " (途中规划清洁公共洗手间)"
          : " (途中で清潔な公衆トイレ・お手洗いに寄りたい)";
      prompt += toiletSuffix;
    }
    onSubmitPrompt(prompt);
  };

  // 設定ドロップダウン（テーマ切替・ライト/ダーク・言語・ペルソナ）
  const renderSettingsDropdown = () => (
    <>
      {/* メニュー外側クリック/タップで閉じる全画面オーバーレイ */}
      <div
        className="pointer-events-auto fixed inset-0 z-40 bg-black/10 md:bg-transparent"
        onClick={(e) => {
          e.stopPropagation();
          blockMapPinTemporarily(400);
          setSettingsOpen(false);
        }}
        onTouchStart={(e) => {
          e.stopPropagation();
          blockMapPinTemporarily(400);
          setSettingsOpen(false);
        }}
        onPointerDown={(e) => {
          e.stopPropagation();
          blockMapPinTemporarily(400);
          setSettingsOpen(false);
        }}
      />
      <div
        ref={settingsDropdownRef}
        onClick={(e) => e.stopPropagation()}
        className={`pointer-events-auto absolute right-0 top-10 z-50 w-56 rounded-2xl border p-2.5 shadow-2xl backdrop-blur-2xl transition-all ${
          isTraditional
            ? isDark
              ? "border-amber-700/60 bg-[#1e1b18] text-amber-50 shadow-black/80 washi-pattern font-serif"
              : "border-amber-800/40 bg-[#faf6ed] text-stone-900 shadow-amber-950/20 washi-pattern font-serif"
            : isDark
            ? "border-white/[0.08] bg-zinc-950/95 text-zinc-100 shadow-black/80"
            : "border-black/[0.06] bg-white/95 text-zinc-900 shadow-zinc-900/15"
        }`}
      >
        <div className="text-[11px] font-extrabold px-2 py-1 opacity-60">
          {t.displaySettings}
        </div>

        {/* 1. 着せ替えテーマ（ミニマル ⇄ 和風絵巻） */}
        <div className="px-2 py-1">
          <div className="text-[10px] opacity-60 mb-1"><UiText text={"UI着せ替えテーマ"} /></div>
          <div className="flex gap-1 rounded-xl bg-black/[0.04] dark:bg-white/[0.06] p-0.5">
            <button
              type="button"
              onClick={() => onChangeThemeMode?.("modern")}
              className={`flex-1 rounded-lg py-1 text-[11px] font-bold text-center transition ${
                !isTraditional
                  ? "bg-white text-zinc-950 dark:bg-zinc-800 dark:text-white shadow-xs"
                  : "opacity-60 hover:opacity-100"
              }`}
            >
              <UiText text={"⚡ ミニマル"} /></button>
            <button
              type="button"
              onClick={() => onChangeThemeMode?.("traditional")}
              className={`flex-1 rounded-lg py-1 text-[11px] font-bold text-center transition ${
                isTraditional
                  ? "bg-gradient-to-r from-red-700 to-amber-700 text-amber-100 shadow-xs font-serif"
                  : "opacity-60 hover:opacity-100"
              }`}
            >
              <UiText text={"👘 和風絵巻"} /></button>
          </div>
        </div>

        <div className="h-px bg-black/[0.06] dark:bg-white/[0.06] my-1" />

        {/* 2. デイ / ナイト（ライト/ダーク） */}
        <button
          type="button"
          onClick={() => {
            onToggleTheme();
            setSettingsOpen(false);
          }}
          className="flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-xs font-bold transition hover:bg-black/5 dark:hover:bg-white/5 text-left"
        >
          <span className="flex items-center gap-1.5">
            <RuneIcon name={isDark ? "nature-moon" : "nature-sun"} size={13} />
            <span>{t.theme}</span>
          </span>
          <span className="text-[11px] opacity-60">{isDark ? <UiText text={"ナイト"} /> : <UiText text={"デイ"} />}</span>
        </button>

        {/* 3. AIペルソナ設定 */}
        <button
          type="button"
          onClick={() => {
            onOpenPersonaModal();
            setSettingsOpen(false);
          }}
          className="flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-xs font-bold transition hover:bg-black/5 dark:hover:bg-white/5 text-left"
        >
          <span className="flex items-center gap-1.5">
            <RuneIcon name="tools-sparkles" size={13} />
            <span>{t.aiPersona}</span>
          </span>
          <span className="text-[11px] opacity-60"><UiText text={"開く ➔"} /></span>
        </button>

        <div className="h-px bg-black/[0.06] dark:bg-white/[0.06] my-1" />

        {/* 4. 言語設定 */}
        <div className="text-[10px] font-extrabold px-2 py-0.5 opacity-60">
          🌐 {t.lang}
        </div>
        <div className="flex items-center gap-1 rounded-xl bg-black/[0.04] dark:bg-white/[0.06] p-0.5 mx-1 my-1">
          {(["ja", "en", "zh"] as AppLanguage[]).map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => {
                onChangeLanguage?.(l);
                setSettingsOpen(false);
              }}
              className={`flex-1 rounded-lg py-1 text-[11px] font-bold text-center transition ${
                language === l
                  ? "bg-white text-zinc-950 dark:bg-zinc-800 dark:text-white shadow-xs"
                  : "opacity-60 hover:opacity-100"
              }`}
            >
              {l.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
    </>
  );

  // 上部セグメント切替タブ（AIルート ⇄ 散歩シェア: 左右中央配置） ＆ ⚙️設定アイコン（右端） ＆ ⛶全画面ボタン（左端）
  const renderTopModeTabs = () => (
    <div className="relative flex w-full items-center justify-center mb-2">
      {/* 全画面表示 / ヘッダー・UI退避ボタン（左端配置） */}
      <div className="absolute left-0 top-1/2 -translate-y-1/2 z-50">
        <button
          type="button"
          onClick={onHideUi}
          title={isTraditional ? ui(ui("地図を全画面表示（絵巻を一時収納）")) : ui(ui("マップを全画面表示（ヘッダーとUIを隠す）"))}
          className={`flex h-8 w-8 items-center justify-center rounded-full transition active:scale-95 ${
            isTraditional
              ? "text-amber-900/70 dark:text-amber-200/70 hover:text-stone-900 dark:hover:text-amber-100 hover:bg-amber-500/15"
              : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-500/10"
          }`}
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
          </svg>
        </button>
      </div>

      {/* モード切替タブ（完全左右中央配置・ボーダーレスピル） */}
      <div
        className={`flex items-center p-0.5 rounded-full ${
          isTraditional
            ? isDark
              ? "border border-amber-700/50 bg-[#141210]/90"
              : "border border-amber-800/30 bg-[#faf6ed]/95"
            : "bg-black/[0.05] dark:bg-white/[0.07]"
        }`}
      >
        <button
          type="button"
          onClick={() => onChangeMainTab?.("route")}
          className={`flex items-center gap-1.5 px-6 sm:px-3.5 py-1 rounded-full text-xs font-bold whitespace-nowrap shrink-0 transition active:scale-95 ${
            mainTab === "route"
              ? isTraditional
                ? "bg-gradient-to-r from-red-700 to-amber-700 text-amber-100 shadow-xs border border-amber-300/30 font-serif"
                : "bg-white text-zinc-950 dark:bg-zinc-800 dark:text-white shadow-xs font-black"
              : isTraditional
              ? "text-amber-900/70 dark:text-amber-200/70 hover:text-amber-900 font-serif"
              : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
          }`}
        >
          <span>{isTraditional ? <UiText text={"街道探索"} /> : <UiText text={"AIルート"} />}</span>
        </button>

        <button
          type="button"
          onClick={() => onChangeMainTab?.("sanpo")}
          className={`flex items-center gap-1.5 px-3 sm:px-3.5 py-1 rounded-full text-xs font-bold whitespace-nowrap shrink-0 transition active:scale-95 ${
            mainTab === "sanpo"
              ? isTraditional
                ? "bg-gradient-to-r from-amber-700 to-red-800 text-amber-100 shadow-xs border border-amber-300/30 font-serif"
                : "bg-white text-zinc-950 dark:bg-zinc-800 dark:text-white shadow-xs font-black"
              : isTraditional
              ? "text-amber-900/70 dark:text-amber-200/70 hover:text-amber-900 font-serif"
              : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
          }`}
        >
          <span>{isTraditional ? <UiText text={"散歩絵巻"} /> : <UiText text={"散歩シェア"} />}</span>
          {sanpoRouteCount > 0 && (
            <span
              className={`ml-0.5 rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                isTraditional
                  ? mainTab === "sanpo"
                    ? "bg-white/30 text-white"
                    : "bg-red-700/20 text-red-700 dark:text-red-400"
                  : "bg-black/[0.06] dark:bg-white/[0.1] text-zinc-600 dark:text-zinc-300"
              }`}
            >
              {sanpoRouteCount}
            </span>
          )}
        </button>
      </div>

      {/* 設定ギアアイコン（⚙️: 右端配置） */}
      <div className="absolute right-0 top-1/2 -translate-y-1/2 z-50">
        <button
          type="button"
          onClick={() => setSettingsOpen((s) => !s)}
          title={ui(ui("表示設定（テーマ切替・ライト/ダーク・言語）"))}
          className={`flex h-8 w-8 items-center justify-center rounded-full transition active:scale-95 ${
            settingsOpen
              ? "bg-black/10 dark:bg-white/10 text-orange-500"
              : isTraditional
              ? "text-amber-900/70 dark:text-amber-200/70 hover:text-stone-900 dark:hover:text-amber-100 hover:bg-amber-500/15"
              : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-500/10"
          }`}
        >
          <RuneIcon name="tools-settings" size={16} />
        </button>

        {settingsOpen && renderSettingsDropdown()}
      </div>
    </div>
  );

  return (
    <header
      className={`pointer-events-none absolute inset-x-0 top-3 ${
        settingsOpen ? "z-50" : "z-30"
      } flex flex-col gap-2 px-3.5 sm:px-5 md:left-4 md:right-auto md:w-[460px] md:px-0 md:top-4 transition-all`}
    >
      {isTraditional ? (
        <ScrollRodsHeader isDark={isDark} className="pointer-events-auto w-full relative z-30">
          <div
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
            onPointerDown={handleTouchStart}
            onPointerUp={handleTouchEnd}
            className="flex flex-col w-full"
          >
            {/* 1. モード切替タブ ＆ 設定アイコン */}
            {renderTopModeTabs()}

            {/* 2. コンテンツエリア */}
            {mainTab === "route" ? (
              /* AIルート探索時: 出発地・経由地・目的地入力 */
              <div className="flex w-full items-center gap-2">
                <button
                  type="button"
                  onClick={onSwapEndpoints}
                  title={ui(ui("出立地と目的地を入れ替え"))}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-amber-900/60 dark:text-amber-200/60 transition hover:bg-amber-500/15 active:scale-95"
                >
                  <RuneIcon name="arrows-arrow-up-down" size={15} />
                </button>

                <div className="flex flex-col gap-2.5 flex-1 py-1 min-w-0">
                  {/* 出発地 */}
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black text-emerald-800 dark:text-emerald-300 font-serif border border-emerald-700/40 rounded px-1 py-0.2 bg-emerald-600/10 shrink-0">
                      <UiText text={"出立"} /></span>
                    <input
                      value={isCurrentLocationText(origin) ? t.originTrad : origin}
                      onChange={(e) => onChangeOrigin(e.target.value)}
                      placeholder={t.originTrad}
                      aria-label={ui("出立地点")}
                      className="w-full bg-transparent text-sm font-bold font-serif tracking-tight focus:outline-none truncate text-stone-900 dark:text-amber-50 placeholder:text-stone-400 dark:placeholder:text-amber-200/40"
                    />
                  </div>

                  {/* 経由地リスト */}
                  {waypoints.map((wp, i) => (
                    <div key={i} className="flex items-center gap-1.5 pl-0.5">
                      <span className="text-[10px] font-black text-amber-800 dark:text-amber-400 font-serif border border-amber-600/40 rounded px-1 py-0.2 bg-amber-500/10 shrink-0">
                        <UiText text={"宿場"} />{i + 1}
                      </span>
                      <input
                        value={wp}
                        onChange={(e) => onChangeWaypoint(i, e.target.value)}
                        placeholder={language === "en" ? `Stop ${i + 1}` : language === "zh" ? `驿站 ${i + 1}` : `宿場町 ${i + 1}`}
                        className="w-full bg-transparent text-sm font-semibold font-serif focus:outline-none truncate text-amber-800 dark:text-amber-300 placeholder:text-stone-400"
                      />
                      <button
                        type="button"
                        onClick={() => onRemoveWaypoint(i)}
                        title={ui(ui("この宿場町を削除"))}
                        className="flex h-5 w-5 items-center justify-center text-stone-400 hover:text-red-700 transition"
                      >
                        <RuneIcon name="indicators-x" size={11} />
                      </button>
                    </div>
                  ))}

                  <div className={`h-px w-full ${isDark ? "bg-amber-800/40" : "bg-amber-900/15"}`} />

                  {/* 目的地 */}
                  <div className="flex items-center gap-2">
                    <span className="shrink-0 flex items-center justify-center">
                      <ToriiIcon size={16} />
                    </span>
                    <input
                      value={destination}
                      onChange={(e) => handleDestinationChange(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleDestinationSubmit();
                      }}
                      placeholder={t.destPlaceholderTrad}
                      aria-label={ui("目的地")}
                      className="w-full bg-transparent text-sm font-bold font-serif tracking-tight focus:outline-none truncate text-stone-900 dark:text-amber-50 placeholder:text-stone-400 dark:placeholder:text-amber-200/40"
                    />
                    {destination.trim().length > 0 && (
                      <button
                        type="button"
                        onClick={handleClearDestination}
                        title={ui(ui("目的地を消去して検索を中止"))}
                        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-stone-400 dark:text-amber-200/40 hover:text-red-700 transition active:scale-95"
                      >
                        <RuneIcon name="indicators-x" size={11} />
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex flex-col gap-1 shrink-0">
                  {waypoints.length < 5 && (
                    <button
                      type="button"
                      onClick={onAddWaypoint}
                      title={ui(ui("宿場町（中継地）を追加"))}
                      className={`rounded-md border px-2 py-1 text-[10px] font-black font-serif whitespace-nowrap shrink-0 transition active:scale-95 ${
                        isDark
                          ? "border-amber-600/50 bg-amber-900/30 text-amber-300 hover:bg-amber-900/50"
                          : "border-amber-800/40 bg-amber-100/60 text-amber-900 hover:bg-amber-200/60"
                      }`}
                    >
                      {t.addWpTrad}
                    </button>
                  )}
                  {waypoints.length > 0 && onClearWaypoints && (
                    <button
                      type="button"
                      onClick={onClearWaypoints}
                      title={ui(ui("宿場町（中継地）をすべて解除"))}
                      className="rounded-md border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 px-1.5 py-0.5 text-[9px] font-black font-serif text-red-700 dark:text-red-400 whitespace-nowrap shrink-0 transition active:scale-95 text-center"
                    >
                      <UiText text={"全解除"} /></button>
                  )}
                </div>
              </div>
            ) : (
              /* 散歩シェアモード時: 散歩絵巻の概要 ＆ 投稿ボタン */
              <div className="flex w-full items-center justify-between gap-2 p-2 font-serif">
                <div className="min-w-0">
                  <div className="text-xs sm:text-sm font-black truncate">
                    <UiText text={"みんなの散歩絵巻"} /></div>
                  <div className="text-[11px] opacity-70 truncate">
                    <UiText text={"全"} />{sanpoRouteCount} <UiText text={"帖 · 街道スナップ巡り"} /></div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {onOpenAllListModal && (
                    <button
                      type="button"
                      onClick={onOpenAllListModal}
                      title={ui(ui("散歩絵巻一覧を開く"))}
                      className="flex h-8 items-center gap-1 rounded-full border border-amber-800/30 bg-amber-100/60 dark:bg-amber-950/40 px-2.5 text-xs font-bold whitespace-nowrap shrink-0 transition active:scale-95"
                    >
                      <span>📑</span>
                      <span><UiText text={"一覧"} /></span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={onOpenCreateSanpo}
                    className="flex h-8 sm:h-9 items-center gap-1 rounded-full bg-gradient-to-r from-red-700 to-amber-700 px-3 text-xs font-black text-amber-100 shadow-md border border-amber-300/30 whitespace-nowrap shrink-0 transition active:scale-95"
                  >
                    <span className="text-sm font-bold">＋</span>
                    <span><UiText text={"絵巻を記す"} /></span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </ScrollRodsHeader>
      ) : (
        /* 通常のモダンミニマル・ピル */
        <div
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          onPointerDown={handleTouchStart}
          onPointerUp={handleTouchEnd}
          className={`pointer-events-auto relative z-30 flex flex-col w-full rounded-[32px] border px-3 pt-2 pb-2.5 transition-colors min-w-0 ${surfacePill}`}
        >
          {/* 1. モード切替タブ ＆ 設定アイコン */}
          {renderTopModeTabs()}

          {/* 2. コンテンツエリア */}
          {mainTab === "route" ? (
            /* AIルート探索時: 出発地・経由地・目的地入力 */
            <div className="flex w-full items-center gap-2">
              <button
                type="button"
                onClick={onSwapEndpoints}
                title={ui(ui("出発地と目的地を入れ替え"))}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-zinc-400 transition hover:bg-zinc-500/10 hover:text-zinc-600 dark:hover:text-zinc-200 active:scale-95"
              >
                <RuneIcon name="arrows-arrow-up-down" size={15} />
              </button>

              <div className="flex flex-col gap-2.5 flex-1 py-1 min-w-0">
                {/* 出発地（現在地） */}
                <div className="flex items-center gap-2.5">
                  <span className="h-2 w-2 shrink-0 rounded-full bg-[#34A853]" />
                  <input
                    value={isCurrentLocationText(origin) ? t.origin : origin}
                    onChange={(e) => onChangeOrigin(e.target.value)}
                    placeholder={t.origin}
                    aria-label={ui(ui("スタート地点"))}
                    className="w-full bg-transparent text-sm font-bold tracking-tight focus:outline-none truncate text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500"
                  />
                </div>

                {/* 経由地リスト */}
                {waypoints.map((wp, i) => (
                  <div key={i} className="flex items-center gap-2 pl-0.5">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                    <input
                      value={wp}
                      onChange={(e) => onChangeWaypoint(i, e.target.value)}
                      placeholder={language === "en" ? `Stop ${i + 1}` : language === "zh" ? `经由点 ${i + 1}` : `中継地点 ${i + 1}`}
                      className="w-full bg-transparent text-xs font-semibold focus:outline-none truncate text-zinc-700 dark:text-zinc-300 placeholder:text-zinc-400"
                    />
                    <button
                      type="button"
                      onClick={() => onRemoveWaypoint(i)}
                      title={ui(ui("この中継地点を削除"))}
                      className="flex h-5 w-5 items-center justify-center text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition"
                    >
                      <RuneIcon name="indicators-x" size={12} />
                    </button>
                  </div>
                ))}

                <div className="h-px w-full bg-black/[0.06] dark:bg-white/[0.06]" />

                {/* 目的地 */}
                <div className="flex items-center gap-2.5">
                  <span className="h-2 w-2 shrink-0 rounded-full bg-[#EA4335]" />
                  <input
                    value={destination}
                    onChange={(e) => handleDestinationChange(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleDestinationSubmit();
                    }}
                    placeholder={t.destPlaceholder}
                    aria-label={ui(ui("ゴール地点"))}
                    className="w-full bg-transparent text-sm font-bold tracking-tight focus:outline-none truncate text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500"
                  />
                  {destination.trim().length > 0 && (
                    <button
                      type="button"
                      onClick={handleClearDestination}
                      title={ui(ui("目的地を消去して検索を中止"))}
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-black/5 dark:hover:bg-white/10 transition active:scale-95"
                    >
                      <RuneIcon name="indicators-x" size={11} />
                    </button>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-1 shrink-0">
                {waypoints.length < 5 && (
                  <button
                    type="button"
                    onClick={onAddWaypoint}
                    title={ui(ui("中継地点を追加"))}
                    className="rounded-full bg-black/[0.04] dark:bg-white/[0.06] hover:bg-black/[0.08] dark:hover:bg-white/[0.1] px-2.5 py-1 text-[11px] font-bold text-zinc-600 dark:text-zinc-300 whitespace-nowrap shrink-0 transition active:scale-95"
                  >
                    {t.addWp}
                  </button>
                )}
                {waypoints.length > 0 && onClearWaypoints && (
                  <button
                    type="button"
                    onClick={onClearWaypoints}
                    title={ui(ui("中継地点をすべて解除"))}
                    className="rounded-full bg-red-500/10 hover:bg-red-500/20 px-2 py-0.5 text-[10px] font-bold text-red-600 dark:text-red-400 whitespace-nowrap shrink-0 transition active:scale-95 text-center"
                  >
                    <UiText text={"全解除"} /></button>
                )}
              </div>
            </div>
          ) : (
            /* 散歩シェアモード時: 散歩シェア概要 ＆ 投稿ボタン */
            <div className="flex w-full items-center justify-between gap-2 py-2 px-3">
              <div className="min-w-0">
                <div className="text-sm sm:text-sm font-bold truncate">
                  <UiText text={"みんなの散歩シェア"} /></div>
                <div className="text-[11px] opacity-60 truncate">
                  {sanpoRouteCount} <UiText text={"コース · 写真スポットを地図で探索"} /></div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                {onOpenAllListModal && (
                  <button
                    type="button"
                    onClick={onOpenAllListModal}
                    title={ui(ui("散歩コース一覧モーダルを開く"))}
                    className="flex h-8 items-center gap-1 rounded-full bg-black/[0.04] dark:bg-white/[0.06] hover:bg-black/[0.08] dark:hover:bg-white/[0.1] px-8 text-xs font-bold text-zinc-700 dark:text-zinc-200 whitespace-nowrap shrink-0 transition active:scale-95"
                  >
                    <span><UiText text={"一覧"} /></span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={onOpenCreateSanpo}
                  className="flex h-8 sm:h-9 items-center gap-1 rounded-full bg-zinc-900 text-white dark:bg-white dark:text-zinc-950 px-3 sm:px-3.5 text-xs font-black shadow-xs whitespace-nowrap shrink-0 transition active:scale-95 hover:opacity-90"
                >
                  <span className="text-sm font-bold">＋</span>
                  <span><UiText text={"散歩を投稿"} /></span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ルート決定時: AI提案 vs Google標準ルート比較凡例カード */}
      {isRouteActive && activeRoute.baseline && (
        <div className="self-start relative z-20 pt-0.5">
          <RouteCompareLegendCard
            isRouteActive={isRouteActive}
            activeRoute={activeRoute}
            isTraditional={isTraditional}
            isDark={isDark}
            onOpenInsight={onOpenInsight}
          />
        </div>
      )}
    </header>
  );
};
