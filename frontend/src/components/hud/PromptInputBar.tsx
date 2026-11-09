import { UiText, useUiText } from "@/i18n/ui";
import React, { useState, useRef, useEffect } from "react";
import LoadingState from "@/components/ui/agent/LoadingState";
import { RuneIcon } from "@/components/ui/RuneIcon";
import { HankoStamp } from "@/components/traditional/TraditionalSvgs";
import { AppLanguage, I18N, NG_PRESETS, ROUTE_SEARCH_STAGES } from "./hudTypes";

interface PromptInputBarProps {
  isLoading: boolean;
  realThinkingStage?: string | null;
  isTraditional: boolean;
  isDark: boolean;
  isRouteActive: boolean;
  language: AppLanguage;
  promptText: string;
  setPromptText: React.Dispatch<React.SetStateAction<string>>;
  handleSubmit: (e: React.FormEvent) => void;
  handleResetRoute: () => void;
  mainTab?: "route" | "sanpo";
  isToiletOn?: boolean;
  handleToggleToilet?: () => void;
  avoidSpots?: string[];
  handleToggleNgPreset?: (spot: string) => void;
  handleAddCustomNg?: (e: React.FormEvent) => void;
  newNgInput?: string;
  setNewNgInput?: React.Dispatch<React.SetStateAction<string>>;
  customSystemPrompt?: string | null;
  onOpenPersonaModal?: () => void;
  onGenerateLoopWalk?: (minutes: number) => void;
  onExploreNewRoute?: () => void;
  walkedSpotsCount?: number;
  searchMatchInfo?: { query: string; score: number; reasons: string[] } | null;
  onClearSearchMatch?: () => void;
  onFocusChange?: (isFocused: boolean) => void;
}

export const PromptInputBar: React.FC<PromptInputBarProps> = ({
  isLoading,
  realThinkingStage,
  isTraditional,
  isDark,
  isRouteActive,
  language,
  promptText,
  setPromptText,
  handleSubmit,
  handleResetRoute,
  mainTab = "route",
  isToiletOn = false,
  handleToggleToilet,
  avoidSpots = [],
  handleToggleNgPreset,
  handleAddCustomNg,
  newNgInput = "",
  setNewNgInput,
  customSystemPrompt = null,
  onOpenPersonaModal,
  onGenerateLoopWalk,
  onExploreNewRoute,
  walkedSpotsCount = 0,
  searchMatchInfo = null,
  onClearSearchMatch,
  onFocusChange,
}) => {
  const ui = useUiText();
  const t = I18N[language] ?? I18N.ja;
  const [isOptionsOpen, setIsOptionsOpen] = useState(false);
  const optionsRef = useRef<HTMLDivElement>(null);

  // オプション設定があるかどうかのフラグ
  const hasActiveOptions =
    isToiletOn || avoidSpots.length > 0 || Boolean(customSystemPrompt);

  // 外側クリックでオプションメニューを閉じる
  useEffect(() => {
    if (!isOptionsOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (optionsRef.current && !optionsRef.current.contains(e.target as Node)) {
        setIsOptionsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOptionsOpen]);

  // モード別のプレースホルダー文言
  const getPlaceholder = () => {
    if (mainTab === "sanpo") {
      return isTraditional
        ? "散歩絵巻を検索（例: 寺社仏閣、甘味処、裏路地、短め）"
        : "散歩コースを検索（例: カフェ巡り、写真スポット、静かな路地）";
    }
    if (isRouteActive) {
      return isTraditional
        ? "この道を調整（例: もっと海沿い、坂を避ける）"
        : language === "en"
        ? "Refine this route (e.g. more waterfront, fewer stops)..."
        : language === "zh"
        ? "调整这条路线（例如：多走海边、减少绕路）..."
        : "この案を調整（例: もっと海沿い、寄り道を減らす）";
    }
    return isTraditional ? t.searchPlaceholderTrad : t.searchPlaceholder;
  };

  return (
    <div className="relative mx-4 flex w-[calc(100%-32px)] max-w-xl flex-col items-center">
      {/* 検索マッチ情報ピル（散歩モードでのプロンプトスコアリング結果） */}
      {searchMatchInfo && (
        <div
          className={`pointer-events-auto mb-1.5 flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-bold shadow-lg backdrop-blur-2xl transition animate-in fade-in slide-in-from-bottom-2 ${
            isTraditional
              ? isDark
                ? "border-amber-700/60 bg-[#1e1b18]/95 text-amber-200 font-serif"
                : "border-amber-800/40 bg-[#faf6ed]/95 text-stone-900 font-serif"
              : isDark
              ? "border-orange-500/50 bg-zinc-950/90 text-orange-300"
              : "border-orange-400/50 bg-white/95 text-orange-700"
          }`}
        >
          <span>🎯</span>
          <span>
            「{searchMatchInfo.query}<UiText text={"」一致度"} />{searchMatchInfo.score}%
            {searchMatchInfo.reasons.length > 0 && ` (${searchMatchInfo.reasons[0]})`}
          </span>
          {onClearSearchMatch && (
            <button
              type="button"
              onClick={onClearSearchMatch}
              title={ui(ui("検索絞り込みを解除"))}
              className="ml-1 rounded-full p-0.5 hover:bg-black/10 dark:hover:bg-white/10"
            >
              <RuneIcon name="indicators-x" size={12} />
            </button>
          )}
        </div>
      )}

      {/* ＋ボタン展開時のプロンプトオプション・ポップオーバー */}
      {isOptionsOpen && (
        <div
          ref={optionsRef}
          className={`pointer-events-auto absolute bottom-full mb-2 left-0 w-full sm:w-[420px] rounded-2xl border p-4 shadow-2xl backdrop-blur-2xl z-50 transition-all ${
            isTraditional
              ? isDark
                ? "border-amber-700/60 bg-[#1e1b18]/98 text-amber-50 shadow-black/80 washi-pattern font-serif"
                : "border-amber-800/40 bg-[#faf6ed]/98 text-stone-900 shadow-amber-950/20 washi-pattern font-serif"
              : isDark
              ? "border-white/[0.08] bg-zinc-950/95 text-zinc-100 shadow-black/70"
              : "border-black/[0.06] bg-white/95 text-zinc-900 shadow-zinc-900/15"
          }`}
        >
          <div className="flex items-center justify-between pb-2.5 mb-2.5 border-b border-black/[0.06] dark:border-white/[0.06]">
            <div className="flex items-center gap-1.5 font-bold text-xs">
              <span>{isTraditional ? <UiText text={"探索の条件設定"} /> : <UiText text={"プロンプトオプション"} />}</span>
            </div>
            <button
              type="button"
              onClick={() => setIsOptionsOpen(false)}
              className="text-xs opacity-60 hover:opacity-100 p-1"
            >
              ✕
            </button>
          </div>

          <div className="flex flex-col gap-3">
            {/* 0. おまかせ周回散歩コース */}
            {onGenerateLoopWalk && (
              <div className="flex flex-col gap-1.5 pb-2 border-b border-black/[0.06] dark:border-white/[0.06]">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-bold flex items-center gap-1.5">
                    <RuneIcon name="code-compass" size={13} />
                    <span>{isTraditional ? <UiText text={"周回散歩（発着同じコース）"} /> : <UiText text={"おまかせ周回散歩コース"} />}</span>
                  </div>
                  <span className="text-[9px] opacity-60"><UiText text={"分速80m基準"} /></span>
                </div>
                <div className="grid grid-cols-4 gap-1.5 pt-0.5">
                  {[15, 30, 45, 60].map((mins) => (
                    <button
                      key={mins}
                      type="button"
                      onClick={() => {
                        setIsOptionsOpen(false);
                        onGenerateLoopWalk(mins);
                      }}
                      className={`flex flex-col items-center justify-center py-1.5 px-1 rounded-xl text-xs font-bold transition active:scale-95 border ${
                        isTraditional
                          ? "border-amber-800/30 bg-amber-500/10 hover:bg-amber-500/20 text-amber-900 dark:text-amber-200 font-serif"
                          : "border-black/[0.06] dark:border-white/[0.08] bg-black/[0.03] dark:bg-white/[0.05] hover:bg-black/[0.08] dark:hover:bg-white/[0.1] text-zinc-800 dark:text-zinc-200"
                      }`}
                    >
                      <span>{mins}<UiText text={"分"} /></span>
                      <span className="text-[9px] opacity-60 font-normal">
                        <UiText text={"約"} />{(mins * 0.08).toFixed(1)}km
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* 0.5. 未開拓ルート開拓（歩いた履歴を自動回避） */}
            {onExploreNewRoute && (
              <div className="flex items-center justify-between gap-2 pb-2 border-b border-black/[0.06] dark:border-white/[0.06]">
                <div className="text-xs">
                  <div className="font-bold"><UiText text={"🧭 新ルート開拓"} /></div>
                  <div className="text-[10px] opacity-60">
                    <UiText text={"歩いた履歴・現在の経路を避けて未開拓の道を提案"} />
                    {walkedSpotsCount > 0 ? ` (${walkedSpotsCount})` : ""}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setIsOptionsOpen(false);
                    onExploreNewRoute();
                  }}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold transition active:scale-95 bg-[#34A853] text-white shadow-xs shrink-0"
                >
                  <span><UiText text={"開拓する"} /></span>
                </button>
              </div>
            )}

            {/* 1. トイレ寄り道優先 */}
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs">
                <div className="font-bold"><UiText text={"🚻 公衆トイレ寄り道"} /></div>
                <div className="text-[10px] opacity-60">
                  <UiText text={"トイレ設備を確認できる施設を優先"} /></div>
              </div>
              <button
                type="button"
                onClick={handleToggleToilet}
                className={`flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold transition active:scale-95 ${
                  isToiletOn
                    ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-950 shadow-xs"
                    : "bg-black/[0.04] dark:bg-white/[0.06] text-zinc-600 dark:text-zinc-300 hover:bg-black/[0.08] dark:hover:bg-white/[0.1]"
                }`}
              >
                <span>{isToiletOn ? <UiText text={"✓ 有効"} /> : <UiText text={"無効"} />}</span>
              </button>
            </div>

            {/* 2. 回避スポット（NG条件） */}
            <div className="flex flex-col gap-2 pt-2 border-t border-black/[0.06] dark:border-white/[0.06]">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold"><UiText text={"回避したい条件"} /></span>
                {avoidSpots.length > 0 && (
                  <span className="text-[10px] opacity-60 font-bold">
                    {avoidSpots.length} <UiText text={"件設定中"} /></span>
                )}
              </div>
              {/* プリセットチップ（ボーダーレス） */}
              <div className="flex flex-wrap gap-1.5">
                {NG_PRESETS.map((p) => {
                  const pLabel = p.label[language] || p.label.ja;
                  const isSelected = avoidSpots.includes(pLabel);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => handleToggleNgPreset?.(pLabel)}
                      className={`rounded-full px-2.5 py-1 text-[11px] font-bold transition active:scale-95 ${
                        isSelected
                          ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-950 shadow-xs"
                          : "bg-black/[0.04] dark:bg-white/[0.06] text-zinc-600 dark:text-zinc-300 hover:bg-black/[0.08] dark:hover:bg-white/[0.1]"
                      }`}
                    >
                      {isSelected ? `✕ ${pLabel}` : `＋ ${pLabel}`}
                    </button>
                  );
                })}
              </div>

              {/* 自由入力フォーム */}
              {handleAddCustomNg && setNewNgInput && (
                <form onSubmit={handleAddCustomNg} className="flex items-center gap-1.5 mt-0.5">
                  <input
                    type="text"
                    value={newNgInput}
                    onChange={(e) => setNewNgInput(e.target.value)}
                    placeholder={ui(ui("場所や条件を追加 (例: 歌舞伎町、急坂)"))}
                    className="flex-1 bg-black/[0.04] dark:bg-white/[0.06] rounded-xl px-3 py-1.5 text-xs focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={!newNgInput.trim()}
                    className="rounded-xl bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 px-3 py-1.5 text-xs font-bold disabled:opacity-30"
                  >
                    <UiText text={"追加"} /></button>
                </form>
              )}
            </div>

            {/* 3. AIペルソナ・設定モーダル呼び出し */}
            {onOpenPersonaModal && (
              <div className="pt-2 border-t border-black/[0.06] dark:border-white/[0.06]">
                <button
                  type="button"
                  onClick={() => {
                    setIsOptionsOpen(false);
                    onOpenPersonaModal();
                  }}
                  className="flex w-full items-center justify-between px-3 py-2 rounded-xl text-xs font-bold transition bg-black/[0.04] dark:bg-white/[0.06] hover:bg-black/[0.08] dark:hover:bg-white/[0.1] text-zinc-800 dark:text-zinc-200"
                >
                  <div className="flex items-center gap-2">
                    <span>⚙️</span>
                    <span><UiText text={"AIペルソナ・案内スタイル設定"} /></span>
                  </div>
                  <span className="text-[10px] opacity-60"><UiText text={"変更 →"} /></span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* プロンプト入力バー本体 */}
      <div
        className={`pointer-events-auto flex w-full items-center gap-2 rounded-full border px-2 py-1.5 shadow-2xl backdrop-blur-2xl transition-all ${
          isLoading
            ? isTraditional
              ? "border-amber-600/60 bg-[#faf6ed]/95 dark:bg-[#1e1b18]/90 text-stone-900 shadow-amber-950/20 ring-1 ring-amber-500/40 cursor-wait select-none"
              : isDark
              ? "border-[#4285F4]/40 bg-zinc-950/75 text-zinc-100 shadow-[#4285F4]/10 ring-1 ring-[#4285F4]/20 cursor-wait select-none"
              : "border-[#4285F4]/40 bg-white/75 text-zinc-900 shadow-[#4285F4]/10 ring-1 ring-[#4285F4]/20 cursor-wait select-none"
            : isTraditional
            ? isDark
              ? "border-amber-700/60 bg-[#1e1b18]/90 text-amber-50 shadow-black/80 washi-pattern font-serif"
              : "border-amber-800/30 bg-[#faf6ed]/95 text-stone-900 shadow-[0_10px_35px_rgba(90,50,20,0.15)] washi-pattern font-serif"
            : isDark
            ? "border-zinc-800/60 bg-zinc-950/75 text-zinc-100 shadow-black/60"
            : "border-zinc-200/60 bg-white/75 text-zinc-900 shadow-zinc-900/10"
        }`}
      >
        {isLoading ? (
          /* 思考中状態 */
          <div className="flex w-full items-center justify-between gap-2 overflow-visible pl-3 m-1">
            <div className="flex-1 min-w-0">
              <LoadingState
                label={realThinkingStage || undefined}
                stages={realThinkingStage ? undefined : ROUTE_SEARCH_STAGES}
                variant={"Dots"}
              />
            </div>
            <button
              type="button"
              onClick={handleResetRoute}
              title={isTraditional ? ui("検索中止") : ui(ui("ルート検索を中止してエージェントを停止"))}
              className={`flex items-center gap-1 shrink-0 rounded-full border px-4 py-3 text-xs font-bold transition active:scale-95 ${
                isTraditional
                  ? "border-amber-800/40 bg-[#faf6ed] text-stone-700 hover:text-[#C73E3A] hover:bg-amber-100/60 font-serif"
                  : "border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:text-[#EA4335] hover:border-[#EA4335]/40"
              }`}
            >
              <RuneIcon name="indicators-x" size={14} />
              <span className="text-[12px]"><UiText text={"中止"} /></span>
            </button>
          </div>
        ) : (
          /* 通常時: 検索フォーム */
          <form
            onSubmit={handleSubmit}
            autoComplete="off"
            data-lpignore="true"
            className="flex w-full items-center gap-2 px-1"
          >
            {/* プラスボタン（プロンプトオプション展開） */}
            <button
              type="button"
              onClick={() => setIsOptionsOpen((prev) => !prev)}
              title={ui(ui("プロンプトオプション（トイレ優先、NG回避、AI設定）"))}
              className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition ${
                hasActiveOptions
                  ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-950 shadow-xs"
                  : isTraditional
                  ? "text-amber-900 dark:text-amber-200 hover:bg-amber-500/15"
                  : "text-zinc-600 dark:text-zinc-300 hover:bg-black/[0.05] dark:hover:bg-white/[0.08]"
              }`}
            >
              <span className="text-base font-black leading-none">＋</span>
            </button>

            {/* プロンプト入力フィールド（パスワードやカード情報などの不要な自動補完提案を防止） */}
            <input
              type="search"
              name="route_prompt_search"
              id="route-prompt-input"
              value={promptText}
              disabled={isLoading}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              enterKeyHint="search"
              data-form-type="other"
              data-lpignore="true"
              aria-autocomplete="none"
              onFocus={() => {
                onFocusChange?.(true);
              }}
              onBlur={() => {
                setTimeout(() => {
                  onFocusChange?.(false);
                }, 150);
              }}
              onChange={(e) => setPromptText(e.target.value)}
              placeholder={getPlaceholder()}
              className={`h-[50px] flex-1 bg-transparent text-sm sm:text-base focus:outline-none min-w-0 [&::-webkit-search-cancel-button]:hidden [&::-webkit-search-decoration]:hidden ${
                isTraditional
                  ? "font-serif text-stone-900 dark:text-amber-50 placeholder:text-stone-400 dark:placeholder:text-amber-200/40"
                  : "text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500"
              }`}
            />

            {/* 送信ボタン */}
            <button
              type="submit"
              disabled={isLoading || !promptText.trim()}
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition active:scale-95 disabled:opacity-30 ${
                isTraditional
                  ? "bg-transparent hover:scale-105"
                  : "bg-zinc-900 text-white dark:bg-white dark:text-zinc-950 hover:bg-zinc-800 dark:hover:bg-zinc-200 shadow-xs"
              }`}
            >
              {isTraditional ? (
                <HankoStamp text={mainTab === "sanpo" ? "検索" : "出立"} size="sm" variant="red" />
              ) : (
                <RuneIcon name="arrows-arrow-up" size={14} />
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
