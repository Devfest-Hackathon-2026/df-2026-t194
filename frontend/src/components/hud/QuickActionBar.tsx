import { UiText, useUiText } from "@/i18n/ui";
import React from "react";
import { RuneIcon } from "@/components/ui/RuneIcon";
import { AppLanguage, I18N, NG_PRESETS } from "./hudTypes";

interface QuickActionBarProps {
  isRouteActive: boolean;
  isTraditional: boolean;
  isDark: boolean;
  surfacePill: string;
  language: AppLanguage;
  isToiletOn: boolean;
  avoidSpots: string[];
  customSystemPrompt: string | null;
  isLoading: boolean;
  isNgBarOpen: boolean;
  setIsNgBarOpen: React.Dispatch<React.SetStateAction<boolean>>;
  newNgInput: string;
  setNewNgInput: React.Dispatch<React.SetStateAction<string>>;
  handleResetRoute: () => void;
  handleToggleToilet: () => void;
  handleToggleNgPreset: (spot: string) => void;
  handleAddCustomNg: (e: React.FormEvent) => void;
  onOpenPersonaModal: () => void;
  onGenerateLoopWalk?: (minutes: number) => void;
}

export const QuickActionBar: React.FC<QuickActionBarProps> = ({
  isRouteActive,
  isTraditional,
  isDark,
  surfacePill,
  language,
  isToiletOn,
  avoidSpots,
  customSystemPrompt,
  isLoading,
  isNgBarOpen,
  setIsNgBarOpen,
  newNgInput,
  setNewNgInput,
  handleResetRoute,
  handleToggleToilet,
  handleToggleNgPreset,
  handleAddCustomNg,
  onOpenPersonaModal,
  onGenerateLoopWalk,
}) => {
  const ui = useUiText();
  const [isLoopMenuOpen, setIsLoopMenuOpen] = React.useState(false);
  const t = I18N[language] ?? I18N.ja;

  return (
    <>
      <div className="pointer-events-auto flex items-center gap-1.5 px-4 no-scrollbar overflow-x-scroll max-w-xl w-full justify-start sm:justify-center">
        {/* ルート中または検索中: クイックルート解除・中止 */}
        {isRouteActive && (
          <button
            type="button"
            onClick={handleResetRoute}
            title={isTraditional ? t.cancelRouteTrad : ui(ui("ルート検索を中止して待機状態に戻る"))}
            className={`flex items-center gap-1 rounded-full border px-3 py-1 text-sm shadow-sm backdrop-blur-xl transition active:scale-95 shrink-0 ${isTraditional
                ? "border-amber-800/40 bg-[#faf6ed]/95 dark:bg-[#1e1b18]/90 text-stone-700 dark:text-amber-200 hover:text-[#C73E3A] font-serif"
                : isDark
                  ? "border-zinc-800/60 bg-zinc-950/75 text-zinc-400 hover:text-[#EA4335] hover:border-[#EA4335]/40"
                  : "border-zinc-200/60 bg-white/75 text-zinc-600 hover:text-[#EA4335] hover:border-[#EA4335]/40"
              }`}
          >
            <RuneIcon name="indicators-x" size={16} />
            <span>{isTraditional ? t.cancelRouteTrad : t.cancelRoute}</span>
          </button>
        )}

        {/* おまかせ周回散歩ボタン（他のクイックアクションと同じ控えめなトーン＆RuneIconに統一） */}
        <div className="relative shrink-0">
          <button
            type="button"
            onClick={() => setIsLoopMenuOpen((v) => !v)}
            title={ui(ui("出発地に戻ってくるおまかせ周回・ループ散歩コースを作成"))}
            className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold shadow-sm backdrop-blur-xl transition active:scale-95 shrink-0 ${
              isLoopMenuOpen
                ? isTraditional
                  ? "border-amber-500 bg-amber-500/20 text-amber-800 dark:text-amber-200 font-serif"
                  : isDark
                  ? "border-zinc-600 bg-zinc-800 text-zinc-100"
                  : "border-zinc-400 bg-zinc-100 text-zinc-900"
                : isTraditional
                ? "border-amber-800/30 bg-[#faf6ed]/95 dark:bg-[#1e1b18]/90 text-stone-700 dark:text-amber-200 hover:bg-amber-100/60 font-serif"
                : isDark
                ? "border-zinc-800/60 bg-zinc-950/75 text-zinc-300 hover:bg-zinc-900/80 hover:border-zinc-700"
                : "border-zinc-200/60 bg-white/75 text-zinc-700 hover:bg-zinc-100/80 hover:border-zinc-300"
            }`}
          >
            <RuneIcon name="code-compass" size={12} />
            <span>{isTraditional ? <UiText text={"周回散歩"} /> : <UiText text={"おまかせ周回"} />}</span>
          </button>

          {/* 周回時間選択ポップオーバー */}
          {isLoopMenuOpen && (
            <>
              <div
                className="fixed inset-0 z-30"
                onClick={() => setIsLoopMenuOpen(false)}
              />
              <div
                className={`absolute bottom-full mb-2 left-0 z-40 flex flex-col gap-1 rounded-2xl border p-2 shadow-2xl backdrop-blur-2xl min-w-[185px] ${
                  isTraditional
                    ? "border-amber-800/40 bg-[#faf6ed] dark:bg-[#1e1b18] text-stone-900 dark:text-amber-100 font-serif"
                    : isDark
                    ? "border-zinc-800 bg-zinc-950 text-zinc-100 shadow-black/80"
                    : "border-zinc-200 bg-white text-zinc-900 shadow-xl"
                }`}
              >
                <div className="px-2 pt-1 pb-0.5 flex items-center justify-between">
                  <span className="text-[10px] font-black text-zinc-400">
                    {isTraditional ? <UiText text={"何刻の道中（周回）？"} /> : <UiText text={"周回散歩の時間（4コース生成）"} />}
                  </span>
                </div>
                <div className="px-2 pb-1 text-[9px] text-zinc-400 border-b border-zinc-200/60 dark:border-zinc-800/60">
                  <UiText text={"歩行速度: Googleマップ基準 分速80m（時速4.8km）"} /></div>
                {[15, 30, 45, 60].map((mins) => (
                  <button
                    key={mins}
                    type="button"
                    onClick={() => {
                      setIsLoopMenuOpen(false);
                      onGenerateLoopWalk?.(mins);
                    }}
                    className={`flex items-center justify-between rounded-xl px-2.5 py-1.5 text-xs font-bold transition text-left ${
                      isTraditional
                        ? "hover:bg-amber-500/15 text-amber-900 dark:text-amber-200"
                        : isDark
                        ? "hover:bg-zinc-800 text-zinc-200"
                        : "hover:bg-zinc-100 text-zinc-800"
                    }`}
                  >
                    <span>{mins}<UiText text={"分コース"} /></span>
                    <span className="text-[10px] text-zinc-400 font-normal">
                      <UiText text={"約"} />{(mins * 0.08).toFixed(1)}km
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* トイレ寄り道トグルボタン */}
        <button
          type="button"
          onClick={handleToggleToilet}
          title={ui(ui("ルート途中の公衆トイレ・お手洗いを検索して経由地に設定（ON/OFF）"))}
          className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm shadow-sm backdrop-blur-xl transition active:scale-95 shrink-0 ${isToiletOn
              ? isTraditional
                ? "border-amber-500 bg-[#C73E3A] text-amber-100 shadow-sm"
                : "border-[#4285F4] bg-[#4285F4] text-white shadow-sm shadow-[#4285F4]/30"
              : isTraditional
                ? "border-amber-800/30 bg-[#faf6ed]/95 dark:bg-[#1e1b18]/90 text-stone-700 dark:text-amber-200 hover:bg-amber-100/60 font-serif"
                : isDark
                  ? "border-zinc-800/60 bg-zinc-950/75 text-zinc-300 hover:bg-zinc-900/80 hover:border-zinc-700"
                  : "border-zinc-200/60 bg-white/75 text-zinc-700 hover:bg-zinc-100/80 hover:border-zinc-300"
            }`}
        >
          {isToiletOn ? (
            <RuneIcon name="indicators-check" size={11} className="text-white" />
          ) : (
            <RuneIcon name="tools-map-pin" size={11} />
          )}
          <span>{isTraditional ? t.toiletSearchTrad : t.toiletSearch}</span>
        </button>

        {/* NG条件トグルボタン */}
        <button
          type="button"
          onClick={() => setIsNgBarOpen((b) => !b)}
          title={ui(ui("回避したい場所や条件（坂、夜道、繁華街など）を設定"))}
          className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm shadow-sm backdrop-blur-xl transition active:scale-95 shrink-0 ${avoidSpots.length > 0
              ? isTraditional
                ? "border-red-700/60 bg-red-700/20 text-[#C73E3A] dark:text-red-400 font-serif"
                : isDark
                  ? "border-[#EA4335]/50 bg-[#EA4335]/20 text-[#EA4335] ring-1 ring-[#EA4335]/30"
                  : "border-[#EA4335]/40 bg-[#EA4335]/10 text-[#EA4335] ring-1 ring-[#EA4335]/20"
              : isTraditional
                ? "border-amber-800/30 bg-[#faf6ed]/95 dark:bg-[#1e1b18]/90 text-stone-700 dark:text-amber-200 hover:bg-amber-100/60 font-serif"
                : isDark
                  ? "border-zinc-800/60 bg-zinc-950/75 text-zinc-300 hover:bg-zinc-900/80 hover:border-zinc-700"
                  : "border-zinc-200/60 bg-white/75 text-zinc-700 hover:bg-zinc-100/80 hover:border-zinc-300"
            }`}
        >
          <RuneIcon name="indicators-x" size={10} />
          <span>{isTraditional ? t.avoidLabelTrad : t.avoidLabel}</span>
          {avoidSpots.length > 0 && (
            <span className="rounded-full bg-[#EA4335] text-white text-[9px] px-1.5 py-0.2 font-black">
              {avoidSpots.length}
            </span>
          )}
        </button>

        {/* AI設定・システムプロンプトボタン */}
        <button
          type="button"
          onClick={onOpenPersonaModal}
          title={ui(ui("AIの街歩き人格やシステムプロンプトをカスタマイズ"))}
          className={`flex items-center gap-1 rounded-full border px-3 py-1 text-sm shadow-sm backdrop-blur-xl transition active:scale-95 shrink-0 ${customSystemPrompt
              ? isTraditional
                ? "border-amber-500 bg-amber-500/20 text-amber-700 dark:text-amber-300 font-serif"
                : isDark
                  ? "border-[#FBBC05]/50 bg-[#FBBC05]/20 text-[#FBBC05] ring-1 ring-[#FBBC05]/30"
                  : "border-[#FBBC05]/40 bg-[#FBBC05]/10 text-[#d99b00] ring-1 ring-[#FBBC05]/20"
              : isTraditional
                ? "border-amber-800/30 bg-[#faf6ed]/95 dark:bg-[#1e1b18]/90 text-stone-700 dark:text-amber-200 hover:bg-amber-100/60 font-serif"
                : isDark
                  ? "border-zinc-800/60 bg-zinc-950/75 text-zinc-300 hover:bg-zinc-900/80 hover:border-zinc-700"
                  : "border-zinc-200/60 bg-white/75 text-zinc-700 hover:bg-zinc-100/80 hover:border-zinc-300"
            }`}
        >
          <RuneIcon name="tools-settings" size={11} />
          <span>{isTraditional ? t.aiPersonaTrad : t.aiPersona}</span>
        </button>
      </div>

      {/* 展開時: NGスポット・回避タグ管理トレイ */}
      {isNgBarOpen && (
        <div
          className={`pointer-events-auto mx-4 flex flex-col gap-2 rounded-2xl border p-2.5 shadow-xl backdrop-blur-2xl w-[calc(100%-32px)] max-w-xl transition-all ${surfacePill
            }`}
        >
          <div className="flex items-center justify-between px-1">
            <span className="text-[11px] font-extrabold text-zinc-400">{t.avoidLabel}</span>
            <button
              type="button"
              onClick={() => setIsNgBarOpen(false)}
              className="text-xs text-zinc-400 hover:text-zinc-600 px-1"
            >
              ✕
            </button>
          </div>
          {/* プリセットチップ */}
          <div className="flex flex-wrap gap-1.5">
            {NG_PRESETS.map((p) => {
              const pLabel = p.label[language] || p.label.ja;
              const isSelected = avoidSpots.includes(pLabel);
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handleToggleNgPreset(pLabel)}
                  className={`rounded-full border px-2.5 py-1 text-xs font-bold transition active:scale-95 ${isSelected
                      ? "border-red-500 bg-red-500 text-white shadow-sm"
                      : isDark
                        ? "border-zinc-700 bg-zinc-800/80 text-zinc-300 hover:border-zinc-600"
                        : "border-zinc-200 bg-zinc-100 text-zinc-700 hover:border-zinc-300"
                    }`}
                >
                  {isSelected ? `✕ ${pLabel}` : `＋ ${pLabel}`}
                </button>
              );
            })}
          </div>
          {/* 自由入力フォーム */}
          <form onSubmit={handleAddCustomNg} className="flex items-center gap-1.5 mt-0.5">
            <input
              type="text"
              value={newNgInput}
              onChange={(e) => setNewNgInput(e.target.value)}
              placeholder={ui(ui("場所や条件を追加 (例: 歌舞伎町、急坂)"))}
              className="flex-1 bg-transparent border rounded-xl px-2.5 py-1 text-xs focus:outline-none border-zinc-600/50"
            />
            <button
              type="submit"
              disabled={!newNgInput.trim()}
              className="rounded-xl bg-zinc-800 text-white dark:bg-zinc-200 dark:text-zinc-900 px-3 py-1 text-xs font-bold disabled:opacity-40"
            >
              <UiText text={"追加"} /></button>
          </form>
        </div>
      )}
    </>
  );
};
