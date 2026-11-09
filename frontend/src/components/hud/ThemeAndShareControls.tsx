import { UiText, useUiText } from "@/i18n/ui";
import React from "react";
import { ThemeMode } from "@/types/theme";
import { I18N, AppLanguage } from "./hudTypes";

interface ThemeAndShareControlsProps {
  isTraditional: boolean;
  isDark: boolean;
  language: AppLanguage;
  onChangeThemeMode?: (mode: ThemeMode) => void;
  onOpenSanpoShare?: () => void;
  sanpoRouteCount?: number;
  isMobileSubRow?: boolean;
  showSanpoBadge?: boolean;
}

export const ThemeAndShareControls: React.FC<ThemeAndShareControlsProps> = ({
  isTraditional,
  isDark,
  language,
  onChangeThemeMode,
  onOpenSanpoShare,
  sanpoRouteCount = 0,
  isMobileSubRow = false,
  showSanpoBadge = false,
}) => {
  const ui = useUiText();
  const t = I18N[language] ?? I18N.ja;

  return (
    <div
      className={`pointer-events-auto flex gap-2 ${
        isMobileSubRow
          ? "justify-end overflow-x-auto no-scrollbar pt-1 px-1"
          : ""
      }`}
    >
      {/* 着せ替えテーマ切替ピル（Modern Minimal ⇄ Edo Scroll） */}
      <div
        className={`h-[38px] box-border flex items-center rounded-full border p-[3px] shadow-xl backdrop-blur-2xl transition-all shrink-0 ${
          isTraditional
            ? isDark
              ? "border-amber-700/60 bg-[#1e1b18]/90 text-amber-100 shadow-black/50"
              : "border-amber-800/30 bg-[#faf6ed]/95 text-stone-900 shadow-amber-950/15"
            : isDark
            ? "border-zinc-800/60 bg-zinc-950/75 text-zinc-100 shadow-black/40"
            : "border-zinc-200/60 bg-white/75 text-zinc-900 shadow-zinc-900/5"
        }`}
      >
        <button
          type="button"
          onClick={() => onChangeThemeMode?.("modern")}
          title={ui(ui("シンプルミニマルテーマに切り替え"))}
          className={`h-full flex items-center gap-1.5 rounded-full px-2.5 text-xs font-bold transition active:scale-95 leading-none ${
            !isTraditional
              ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950 shadow-xs"
              : "text-stone-500 hover:text-stone-800 dark:text-amber-200/60 dark:hover:text-amber-100"
          }`}
        >
          <span className="text-xs">⚡</span>
          <span>{t.themeMinimal}</span>
        </button>
        <button
          type="button"
          onClick={() => onChangeThemeMode?.("traditional")}
          title={ui(ui("江戸・和風絵巻テーマに切り替え"))}
          className={`h-full flex items-center gap-1.5 rounded-full px-2.5 text-xs font-bold transition active:scale-95 leading-none ${
            isTraditional
              ? "bg-gradient-to-r from-red-700 to-amber-700 text-amber-100 shadow-sm border border-amber-400/50"
              : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-100"
          }`}
        >
          <span className="text-xs">👘</span>
          <span>{t.themeTraditional}</span>
        </button>
      </div>

      {/* 散歩シェアボタン（下部50/50タブバー移行によりオプション表示） */}
      {showSanpoBadge && (
        <button
          type="button"
          onClick={onOpenSanpoShare}
          title={isTraditional ? ui(ui("写真散歩絵巻を開く")) : ui(ui("写真散歩コース共有 (SANPOSHERE) を開く"))}
          className={`group relative h-[38px] box-border flex items-center gap-2 rounded-full border px-3.5 shadow-xl backdrop-blur-2xl transition-all hover:scale-[1.02] active:scale-95 shrink-0 ${
            isTraditional
              ? isDark
                ? "border-amber-700/60 bg-[#1e1b18]/90 text-amber-100 shadow-black/40 hover:border-amber-500 font-serif"
                : "border-amber-800/30 bg-[#faf6ed]/95 text-stone-900 shadow-amber-950/10 hover:border-amber-700 font-serif"
              : isDark
              ? "border-zinc-800/60 bg-zinc-950/75 text-zinc-100 shadow-black/40 hover:border-zinc-700"
              : "border-zinc-200/60 bg-white/75 text-zinc-900 shadow-zinc-900/5 hover:border-zinc-300"
          }`}
        >
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-bold tracking-tight">
              {isTraditional ? t.sanpoTitleTrad : t.sanpoTitle}
            </span>
            <span
              className={`rounded-full px-1.5 py-0.5 text-[11px] font-black leading-none ${
                isTraditional
                  ? "bg-red-700 text-amber-100"
                  : "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-950"
              }`}
            >
              {sanpoRouteCount}
            </span>
          </div>
        </button>
      )}
    </div>
  );
};
