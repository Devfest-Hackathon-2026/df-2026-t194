import { UiText, useUiText } from "@/i18n/ui";
import React from "react";
import { ComputedRoute } from "@/types/route";

interface RouteCompareLegendCardProps {
  isRouteActive: boolean;
  activeRoute: ComputedRoute;
  isTraditional: boolean;
  isDark: boolean;
  onOpenInsight: (tab: "answer" | "compare") => void;
}

export const RouteCompareLegendCard: React.FC<RouteCompareLegendCardProps> = ({
  isRouteActive,
  activeRoute,
  isTraditional,
  isDark,
  onOpenInsight,
}) => {
  const ui = useUiText();
  if (!isRouteActive || !activeRoute.baseline) return null;

  return (
    <button
      type="button"
      onClick={() => onOpenInsight("compare")}
      title={
        isTraditional
          ? ui(ui("軍師推奨街道と官道（Google標準）の比較詳細を開く"))
          : ui(ui("AI提案ルートとGoogle標準ルートの比較詳細を開く"))
      }
      className={`pointer-events-auto group box-border flex flex-col items-start gap-1 rounded-[16px] border p-2 shadow-xl backdrop-blur-2xl transition-all hover:scale-[1.02] active:scale-95 shrink-0 cursor-pointer ${
        isTraditional
          ? isDark
            ? "border-amber-700/60 bg-[#1e1b18]/90 text-amber-100 shadow-black/40 hover:border-amber-500 font-serif"
            : "border-amber-800/30 bg-[#faf6ed]/95 text-stone-900 shadow-amber-950/10 hover:border-amber-700 font-serif"
          : isDark
          ? "border-zinc-800/60 bg-zinc-950/75 text-zinc-100 shadow-black/40 hover:border-zinc-700"
          : "border-zinc-200/60 bg-white/75 text-zinc-900 shadow-zinc-900/5 hover:border-zinc-300"
      }`}
    >
      {/* AI提案（軍師推奨） */}
      <span className="flex items-center gap-1.5 whitespace-nowrap text-xs font-bold">
        <span
          className="inline-block h-2 w-3.5 rounded-full shrink-0 shadow-xs"
          style={{
            backgroundColor: isTraditional
              ? "#C73E3A"
              : activeRoute.badgeColor || "#4285F4",
          }}
        />
        <span>{isTraditional ? <UiText text={"軍師推奨"} /> : <UiText text={"AI提案"} />}</span>
      </span>

      {/* Google標準 */}
      <span className="flex items-center gap-1.5 whitespace-nowrap text-xs font-bold text-zinc-500 dark:text-zinc-400">
        <span
          className={`inline-block w-3.5 border-t-[2.5px] border-dashed shrink-0 ${
            isTraditional
              ? isDark
                ? "border-amber-300/70"
                : "border-stone-600"
              : isDark
              ? "border-zinc-400"
              : "border-zinc-500"
          }`}
        />
        <span><UiText text={"Google標準"} /></span>
      </span>
    </button>
  );
};
