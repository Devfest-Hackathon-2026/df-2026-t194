import { UiText } from "@/i18n/ui";
import React, { useState } from "react";
import { RuneIcon } from "@/components/ui/RuneIcon";
import { cn } from "@/lib/utils";

export interface ToolCallItem {
  id: string;
  name: string;
  category: "routes" | "elevation" | "solar" | "streetview" | "decision" | "places";
  status: "pending" | "running" | "completed" | "error";
  latencyMs?: number;
  summaryText?: string;
}

interface ToolChipsProps {
  tools: ToolCallItem[];
  className?: string;
  isDark?: boolean;
}

/**
 * BeautifulUI (https://www.beautifului.dev/) 準拠の ToolChips プリミティブ
 * AIエージェントが呼び出した外部APIやツール実行をコンパクトに可視化
 */
export const ToolChips: React.FC<ToolChipsProps> = ({
  tools,
  className,
  isDark = false,
}) => {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const getCategoryIcon = (cat: ToolCallItem["category"]) => {
    switch (cat) {
      case "routes":
        return "tools-map";
      case "decision":
        return "tools-sparkles";
      case "solar":
        return "nature-sun";
      case "elevation":
        return "code-compass";
      case "places":
        return "tools-map-pin";
      case "streetview":
        return "playback-camera";
    }
  };

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5 select-none", className)}>
      {tools.map((tool) => {
        const isExpanded = expandedId === tool.id;
        const iconName = getCategoryIcon(tool.category);

        return (
          <div key={tool.id} className="relative inline-flex items-center">
            <button
              type="button"
              onClick={() => setExpandedId(isExpanded ? null : tool.id)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-tight transition-all active:scale-95",
                tool.status === "running" && "animate-pulse bg-black/[0.05] dark:bg-white/[0.08] text-zinc-600 dark:text-zinc-300",
                tool.status === "completed" && "bg-black/[0.04] dark:bg-white/[0.06] text-zinc-700 dark:text-zinc-200 hover:bg-black/[0.08] dark:hover:bg-white/[0.1]",
                tool.status === "pending" && "opacity-40 bg-black/[0.02] dark:bg-white/[0.03] text-zinc-400"
              )}
            >
              <RuneIcon name={iconName} size={13} className="shrink-0" />
              <span><UiText text={tool.name} /></span>

              {tool.status === "running" && (
                <span className="h-1.5 w-1.5 rounded-full bg-[#4285F4] animate-ping" />
              )}
              {tool.status === "completed" && (
                <RuneIcon name="indicators-check" size={11} className="text-[#34A853]" />
              )}
              {tool.latencyMs != null && (
                <span className="font-mono text-[9px] opacity-70">
                  {Math.round(tool.latencyMs)}ms
                </span>
              )}
            </button>

            {/* 詳細ホバー/タップポップオーバー */}
            {isExpanded && tool.summaryText && (
              <div
                className={cn(
                  "absolute bottom-full left-0 mb-1 z-30 min-w-[200px] max-w-xs rounded-xl border p-2 text-[10px] font-medium shadow-xl backdrop-blur-xl animate-in fade-in zoom-in-95",
                  isDark
                    ? "border-zinc-800 bg-zinc-950/95 text-zinc-300 shadow-black/80"
                    : "border-zinc-200 bg-white/95 text-zinc-700 shadow-zinc-900/10"
                )}
              >
                <div className="font-bold text-zinc-900 dark:text-zinc-100 flex items-center justify-between mb-0.5">
                  <span><UiText text={tool.name} /></span>
                  {tool.latencyMs != null && <span>{Math.round(tool.latencyMs)}ms</span>}
                </div>
                <div className="leading-relaxed text-zinc-500 dark:text-zinc-400">
                  <UiText text={tool.summaryText} />
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
