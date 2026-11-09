import React from "react";
import { RuneIcon as BaseRuneIcon, getIconById } from "runeicons-react";
import { cn } from "@/lib/utils";

export interface RuneIconProps {
  name: string;
  type?: "normal" | "duotone" | "fill" | "pixelated" | "glass";
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Rune Icons ラッパーコンポーネント
 * https://github.com/Runeicons/runeicons
 */
export const RuneIcon: React.FC<RuneIconProps> = ({
  name,
  type = "normal",
  size = 18,
  className,
  style,
}) => {
  const iconData = getIconById(name);
  if (!iconData) {
    return (
      <span
        style={{ width: size, height: size, ...style }}
        className={cn("inline-flex items-center justify-center text-xs opacity-50", className)}
      >
        ●
      </span>
    );
  }

  // 利用可能なバリアントのフォールバック
  const activeType = iconData.variants[type] ? type : "normal";

  return (
    <span
      style={{ width: size, height: size, ...style }}
      className={cn(
        "inline-flex shrink-0 items-center justify-center leading-none [&>svg]:h-full [&>svg]:w-full [&>svg]:stroke-current [&>svg]:fill-none",
        className
      )}
    >
      <BaseRuneIcon name={name} type={activeType} size={size} />
    </span>
  );
};
