import { UiText, useUiText } from "@/i18n/ui";
import React, { useState } from "react";
import { AppLanguage, PERSONA_PRESETS } from "./hudTypes";
import { blockMapPinTemporarily } from "@/utils/mapPinGuard";

interface PersonaModalProps {
  isOpen: boolean;
  onClose: () => void;
  isTraditional: boolean;
  isDark: boolean;
  language: AppLanguage;
  customSystemPrompt: string | null;
  onChangeCustomSystemPrompt?: (prompt: string | null) => void;
  onChangeLanguage?: (lang: AppLanguage) => void;
}

export const PersonaModal: React.FC<PersonaModalProps> = ({
  isOpen,
  onClose,
  isTraditional,
  isDark,
  language,
  customSystemPrompt,
  onChangeCustomSystemPrompt,
  onChangeLanguage,
}) => {
  const ui = useUiText();
  const [tempPersonaText, setTempPersonaText] = useState(customSystemPrompt || "");

  if (!isOpen) return null;

  const handleClose = () => {
    blockMapPinTemporarily(400);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-md pointer-events-auto"
      onClick={handleClose}
      onTouchStart={(e) => {
        if (e.target === e.currentTarget) {
          handleClose();
        }
      }}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) {
          blockMapPinTemporarily(400);
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
        className={`relative flex flex-col max-h-[85vh] w-full max-w-lg rounded-[28px] border p-5 shadow-2xl overflow-y-auto ${
          isTraditional
            ? isDark
              ? "border-amber-700/60 bg-[#1e1b18] text-amber-50 shadow-black/80 washi-pattern font-serif"
              : "border-amber-800/40 bg-[#faf6ed] text-stone-900 shadow-amber-950/20 washi-pattern font-serif"
            : isDark
            ? "border-white/[0.08] bg-zinc-950/95 text-zinc-100 shadow-black/80"
            : "border-black/[0.06] bg-white/95 text-zinc-900 shadow-zinc-900/15"
        }`}
      >
        <div className="flex items-center justify-between pb-3 border-b border-black/[0.06] dark:border-white/[0.06]">
          <div className="flex items-center gap-2">
            <span className="text-lg">{isTraditional ? "📜" : "⚙️"}</span>
            <h3 className="text-sm font-black">
              {isTraditional ? <UiText text={"指南役・軍師設定（AIエージェント指示）"} /> : <UiText text={"AIエージェント設定"} />}
            </h3>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-full p-1.5 text-zinc-400 hover:text-zinc-600 hover:bg-black/5 dark:hover:bg-white/10"
          >
            ✕
          </button>
        </div>

        {/* 言語選択 */}
        <div className="mt-4">
          <label className="text-[11px] font-bold text-zinc-400 block mb-1.5"><UiText text={"出力言語（Language）"} /></label>
          <div className="grid grid-cols-3 gap-1.5 rounded-xl bg-black/[0.04] dark:bg-white/[0.06] p-1">
            {(["ja", "en", "zh"] as AppLanguage[]).map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => onChangeLanguage?.(l)}
                className={`rounded-lg py-1.5 text-xs font-bold transition ${
                  language === l
                    ? "bg-white text-zinc-950 dark:bg-zinc-800 dark:text-white shadow-xs"
                    : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
                }`}
              >
                {l === "ja" ? <UiText text={"🇯🇵 日本語"} /> : l === "en" ? "🇺🇸 English" : <UiText text={"🇨🇳 中文"} />}
              </button>
            ))}
          </div>
        </div>

        {/* 人格プリセット */}
        <div className="mt-4">
          <label className="text-[11px] font-bold text-zinc-400 block mb-1.5"><UiText text={"AI街歩きスタイル"} /></label>
          <div className="flex flex-col gap-1.5">
            {PERSONA_PRESETS.map((p) => {
              const isSelected = p.prompt === customSystemPrompt;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    onChangeCustomSystemPrompt?.(p.prompt);
                    setTempPersonaText(p.prompt || "");
                  }}
                  className={`flex flex-col text-left rounded-xl p-3 transition active:scale-[0.99] ${
                    isSelected
                      ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-950 shadow-xs"
                      : "bg-black/[0.03] dark:bg-white/[0.04] hover:bg-black/[0.06] dark:hover:bg-white/[0.08] text-zinc-800 dark:text-zinc-200"
                  }`}
                >
                  <span className="text-xs font-bold">{p.title[language] || p.title.ja}</span>
                  <span className={`text-[11px] mt-0.5 ${isSelected ? "opacity-80" : "text-zinc-400"}`}>
                    {p.desc[language] || p.desc.ja}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* カスタム自由記述 */}
        <div className="mt-4">
          <label className="text-[11px] font-bold text-zinc-400 block mb-1.5"><UiText text={"カスタム指示（自由入力）"} /></label>
          <textarea
            value={tempPersonaText}
            onChange={(e) => setTempPersonaText(e.target.value)}
            placeholder={ui(ui("例: 関西弁の気さくなガイド風に解説して / 途中で写真映えする裏道を多く選んで"))}
            rows={3}
            className="w-full rounded-xl p-3 text-xs bg-black/[0.04] dark:bg-white/[0.06] focus:outline-none focus:ring-1 focus:ring-zinc-400"
          />
        </div>

        {/* 保存ボタン */}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              onChangeCustomSystemPrompt?.(null);
              setTempPersonaText("");
              onClose();
            }}
            className="rounded-xl px-4 py-2 text-xs font-bold text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
          >
            <UiText text={"標準にリセット"} /></button>
          <button
            type="button"
            onClick={() => {
              onChangeCustomSystemPrompt?.(tempPersonaText.trim() || null);
              onClose();
            }}
            className="rounded-xl bg-zinc-900 text-white dark:bg-white dark:text-zinc-950 px-5 py-2 text-xs font-black shadow-xs active:scale-95"
          >
            <UiText text={"保存"} /></button>
        </div>
      </div>
    </div>
  );
};
