import React, { useState, useEffect } from "react";
import { RuneIcon } from "@/components/ui/RuneIcon";
import { ToolChips, ToolCallItem } from "./ToolChips";
import { cn } from "@/lib/utils";

export interface AgentStep {
  id: string;
  label: string;
  detail?: string;
  status: "pending" | "running" | "completed";
}

interface ThinkingStateProps {
  isLoading: boolean;
  durationMs?: number;
  currentThought?: string;
  steps?: AgentStep[];
  toolCalls?: ToolCallItem[];
  isDark?: boolean;
  className?: string;
  defaultExpanded?: boolean;
}

/**
 * BeautifulUI (https://www.beautifului.dev/) 準拠の ThinkingState プリミティブ
 * AIエージェントの思考プロセス・推論トレース・ツール実行状態を美しく表現
 */
export const ThinkingState: React.FC<ThinkingStateProps> = ({
  isLoading,
  durationMs,
  currentThought,
  steps,
  toolCalls,
  isDark = false,
  className,
  defaultExpanded = true,
}) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // ローディング中のタイマーカウントアップ
  useEffect(() => {
    if (!isLoading) {
      if (durationMs != null) {
        setElapsedSeconds(Number((durationMs / 1000).toFixed(1)));
      }
      return;
    }
    const start = performance.now();
    const interval = setInterval(() => {
      setElapsedSeconds(Number(((performance.now() - start) / 1000).toFixed(1)));
    }, 100);
    return () => clearInterval(interval);
  }, [isLoading, durationMs]);

  // Only provider-reported progress is shown; elapsed time cannot establish an API result.
  const activeSteps: AgentStep[] = steps ?? [];
  const activeToolCalls: ToolCallItem[] = toolCalls ?? [];

  return (
    <div
      className={cn(
        "rounded-2xl border p-3 shadow-xl backdrop-blur-xl transition-all duration-200 select-none",
        isDark
          ? "border-zinc-800/90 bg-zinc-950/95 text-zinc-100 shadow-black/60"
          : "border-zinc-200/90 bg-white/95 text-zinc-900 shadow-zinc-900/10",
        className
      )}
    >
      {/* 思考状態ヘッダーバー */}
      <div
        className="flex items-center justify-between cursor-pointer"
        onClick={() => setIsExpanded((prev) => !prev)}
      >
        <div className="flex items-center gap-2">
          {/* AI Sparkles アイコン ＋ 脈動アニメーション */}
          <div
            className={cn(
              "flex h-6 w-6 items-center justify-center rounded-lg border",
              isLoading
                ? "border-[#4285F4]/40 bg-[#4285F4]/10 text-[#4285F4] animate-pulse"
                : "border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-300"
            )}
          >
            <RuneIcon name="tools-sparkles" size={13} />
          </div>

          <div className="flex items-baseline gap-1.5">
            <span className="text-xs font-black tracking-tight">
              {isLoading ? "思考中..." : "推論完了"}
            </span>
            <span className="font-mono text-[10px] text-zinc-400">
              ({isLoading ? `${elapsedSeconds}s` : `Thought for ${elapsedSeconds}s`})
            </span>
          </div>

          {/* 現在の思考サマリーテキスト（Shimmer） */}
          {isLoading && currentThought && (
            <span className="hidden sm:inline-block text-[11px] font-medium text-zinc-400 truncate max-w-[200px] animate-pulse">
              · {currentThought}
            </span>
          )}
        </div>

        {/* 展開トグルアイコン */}
        <button
          type="button"
          aria-label={isExpanded ? "思考プロセスを折りたたむ" : "思考プロセスを展開"}
          className="flex h-6 w-6 items-center justify-center rounded-md text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition"
        >
          <RuneIcon
            name={isExpanded ? "arrows-chevron-up" : "arrows-chevron-down"}
            size={14}
          />
        </button>
      </div>

      {/* 展開時: ツールコール ＆ 推論ステップ一覧 */}
      {isExpanded && (
        <div className="mt-3 space-y-3 pt-2.5 border-t border-zinc-200/80 dark:border-zinc-800/80">
          {/* BeautifulUI ToolChips */}
          <ToolChips tools={activeToolCalls} isDark={isDark} />

          {/* Reasoning Steps */}
          <div className="space-y-1.5">
            {activeSteps.map((step, idx) => (
              <div
                key={step.id || idx}
                className={cn(
                  "flex items-start gap-2 rounded-xl p-2 text-xs transition-colors",
                  step.status === "running"
                    ? isDark
                      ? "bg-zinc-900/80 text-zinc-100 border border-zinc-800"
                      : "bg-zinc-50 text-zinc-900 border border-zinc-200"
                    : "text-zinc-500 dark:text-zinc-400"
                )}
              >
                {/* ステップ番号または完了チェック */}
                <div className="mt-0.5 shrink-0">
                  {step.status === "completed" ? (
                    <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[#34A853]/15 text-[#34A853]">
                      <RuneIcon name="indicators-check" size={10} />
                    </span>
                  ) : step.status === "running" ? (
                    <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[#4285F4]/20 text-[#4285F4] animate-spin">
                      <RuneIcon name="arrows-rotate-cw" size={10} />
                    </span>
                  ) : (
                    <span className="flex h-4 w-4 items-center justify-center rounded-full border border-zinc-300 dark:border-zinc-700 text-[9px] font-mono font-bold">
                      {idx + 1}
                    </span>
                  )}
                </div>

                {/* ステップテキスト */}
                <div className="flex-1 min-w-0">
                  <div
                    className={cn(
                      "font-bold truncate text-[11px]",
                      step.status === "running" && "text-[#4285F4]"
                    )}
                  >
                    {step.label}
                  </div>
                  {step.detail && (
                    <div className="text-[10px] text-zinc-400 dark:text-zinc-500 leading-tight mt-0.5">
                      {step.detail}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
