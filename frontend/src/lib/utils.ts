import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

// Tailwind クラス結合ユーティリティ (Shadcn UI 標準)
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
