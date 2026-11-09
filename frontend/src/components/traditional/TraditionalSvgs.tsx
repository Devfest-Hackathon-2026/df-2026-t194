import React from "react";
import { UiText } from "@/i18n/ui";

// ==========================================
// 1. 巻物フレーム（横長・ヘッダー用）
// 左右に木製軸木（黒檀・真鍮金具）と和紙の紙面
// ==========================================
export const ScrollRodsHeader: React.FC<{
  children: React.ReactNode;
  className?: string;
  isDark?: boolean;
}> = ({ children, className = "", isDark = false }) => {
  return (
    <div className={`relative flex items-center ${className}`}>
      {/* 左の巻き軸（軸木・木製ローラー） */}
      <div className="relative -mr-2.5 z-20 flex flex-col items-center shrink-0">
        {/* 上端の真鍮金具 */}
        <div className="w-3.5 h-2 rounded-t-sm bg-gradient-to-r from-amber-600 via-amber-300 to-amber-700 shadow-sm border border-amber-800/40" />
        {/* 木製軸身（黒檀・漆塗り） */}
        <div className="w-3 h-14 sm:h-16 rounded-sm bg-gradient-to-r from-amber-950 via-amber-800 to-stone-900 shadow-md border-x border-amber-950 flex flex-col justify-between py-1">
          {/* 金飾バンド */}
          <div className="w-full h-0.5 bg-amber-400/80 shadow-xs" />
          <div className="w-full h-0.5 bg-amber-400/80 shadow-xs" />
        </div>
        {/* 下端の真鍮金具 ＆ 赤い組紐タッセル */}
        <div className="w-3.5 h-2 rounded-b-sm bg-gradient-to-r from-amber-600 via-amber-300 to-amber-700 shadow-sm border border-amber-800/40" />
        <div className="w-1 h-3 bg-red-700 shadow-xs rounded-b-full -mt-0.5" />
      </div>

      {/* 中央の巻物和紙エリア */}
      <div
        className={`relative z-10 flex-1 rounded-sm border px-3 py-2 shadow-2xl transition-all ${
          isDark
            ? "border-amber-700/50 bg-[#1e1b18] text-amber-50 shadow-black/80"
            : "border-amber-800/30 bg-[#faf6ed] text-stone-900 shadow-amber-950/20"
        }`}
        style={{
          backgroundImage: isDark
            ? "linear-gradient(to right, rgba(0,0,0,0.35) 0%, transparent 6%, transparent 94%, rgba(0,0,0,0.35) 100%)"
            : "linear-gradient(to right, rgba(90,50,20,0.12) 0%, transparent 5%, transparent 95%, rgba(90,50,20,0.12) 100%)",
          backgroundSize: "100% 100%",
        }}
      >
        {/* 和紙の上下の織り糸・縁取り装飾（金糸・唐草調） */}
        <div className="absolute inset-x-2 top-0 h-[2px] bg-gradient-to-r from-transparent via-amber-500/50 to-transparent" />
        <div className="absolute inset-x-2 bottom-0 h-[2px] bg-gradient-to-r from-transparent via-amber-500/50 to-transparent" />

        {/* コンテンツ本体 */}
        {children}
      </div>

      {/* 右の巻き軸（軸木・木製ローラー） */}
      <div className="relative -ml-2.5 z-20 flex flex-col items-center shrink-0">
        <div className="w-3.5 h-2 rounded-t-sm bg-gradient-to-r from-amber-600 via-amber-300 to-amber-700 shadow-sm border border-amber-800/40" />
        <div className="w-3 h-14 sm:h-16 rounded-sm bg-gradient-to-r from-amber-950 via-amber-800 to-stone-900 shadow-md border-x border-amber-950 flex flex-col justify-between py-1">
          <div className="w-full h-0.5 bg-amber-400/80 shadow-xs" />
          <div className="w-full h-0.5 bg-amber-400/80 shadow-xs" />
        </div>
        <div className="w-3.5 h-2 rounded-b-sm bg-gradient-to-r from-amber-600 via-amber-300 to-amber-700 shadow-sm border border-amber-800/40" />
        <div className="w-1 h-3 bg-red-700 shadow-xs rounded-b-full -mt-0.5" />
      </div>
    </div>
  );
};

// ==========================================
// 2. 巻物カード・短冊フレーム（ルートカードやボトムシート用）
// ==========================================
export const ScrollCardFrame: React.FC<{
  children: React.ReactNode;
  className?: string;
  isSelected?: boolean;
  isDark?: boolean;
}> = ({ children, className = "", isSelected = false, isDark = false }) => {
  return (
    <div
      className={`relative overflow-hidden rounded-xl border backdrop-blur-2xl transition-all ${
        isSelected
          ? isDark
            ? "border-amber-400/70 bg-[#26211c]/85 shadow-[0_10px_35px_rgba(212,175,55,0.25)] ring-1 ring-amber-400/40"
            : "border-red-700/60 bg-[#fffdf7]/90 shadow-[0_10px_30px_rgba(184,50,40,0.18)] ring-1 ring-red-700/30"
          : isDark
          ? "border-amber-900/40 bg-[#1c1916]/80 shadow-sm hover:border-amber-700/40"
          : "border-stone-300/80 bg-[#f9f5eb]/85 shadow-sm hover:border-stone-400"
      } ${className}`}
      style={{
        backgroundImage: isDark
          ? "linear-gradient(180deg, rgba(212,175,55,0.06) 0%, transparent 12%, transparent 88%, rgba(212,175,55,0.06) 100%)"
          : "linear-gradient(180deg, rgba(184,50,40,0.04) 0%, transparent 12%, transparent 88%, rgba(184,50,40,0.04) 100%)",
      }}
    >
      {/* 上部の木版装飾ライン */}
      <div
        className={`h-1 w-full ${
          isSelected
            ? isDark
              ? "bg-gradient-to-r from-amber-600 via-amber-300 to-amber-600"
              : "bg-gradient-to-r from-red-700 via-amber-500 to-red-700"
            : "bg-gradient-to-r from-transparent via-stone-400/30 to-transparent"
        }`}
      />

      {children}

      {/* 下部の金箔ライン */}
      {isSelected && (
        <div
          className={`h-0.5 w-full ${
            isDark
              ? "bg-gradient-to-r from-transparent via-amber-400/60 to-transparent"
              : "bg-gradient-to-r from-transparent via-red-600/50 to-transparent"
          }`}
        />
      )}
    </div>
  );
};

// ==========================================
// 3. 落款印（Hankou Stamp / 朱肉印鑑）
// 「出立」「極」「散歩」「道」「吉」「案内」
// ==========================================
export const HankoStamp: React.FC<{
  text: string;
  size?: "sm" | "md" | "lg";
  className?: string;
  variant?: "red" | "gold" | "black";
}> = ({ text, size = "md", className = "", variant = "red" }) => {
  const sizeClasses = {
    sm: "min-w-6 h-6 px-1 text-[9px] border-[1.5px]",
    md: "min-w-8 h-8 px-1.5 text-xs border-2",
    lg: "min-w-10 h-10 px-2 text-sm border-2",
  }[size];

  const variantClasses = {
    red: "border-red-700 text-red-700 bg-red-700/10 dark:border-red-500 dark:text-red-400 dark:bg-red-950/40 shadow-xs",
    gold: "border-amber-600 text-amber-700 bg-amber-500/10 dark:border-amber-400 dark:text-amber-300 dark:bg-amber-950/40",
    black: "border-stone-800 text-stone-800 bg-stone-900/10 dark:border-stone-300 dark:text-stone-200 dark:bg-stone-800/40",
  }[variant];

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center font-black select-none rounded-[5px] font-serif transform -rotate-3 transition-transform hover:rotate-0 tracking-tight leading-none whitespace-nowrap ${sizeClasses} ${variantClasses} ${className}`}
      style={{
        boxShadow: "inset 0 0 4px rgba(184, 50, 40, 0.2)",
      }}
    >
      <UiText text={text} />
    </span>
  );
};

// ==========================================
// 4. 和風家紋コンパス（方位磁石）
// ==========================================
export const KammonCompass: React.FC<{
  className?: string;
  size?: number;
}> = ({ className = "", size = 24 }) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={`fill-none ${className}`}
    >
      {/* 外枠（二重円） */}
      <circle cx="50" cy="50" r="46" stroke="currentColor" strokeWidth="3" opacity="0.9" />
      <circle cx="50" cy="50" r="42" stroke="currentColor" strokeWidth="1.2" strokeDasharray="3 3" opacity="0.6" />

      {/* 八方方位線 */}
      <line x1="50" y1="8" x2="50" y2="92" stroke="currentColor" strokeWidth="1.5" opacity="0.4" />
      <line x1="8" y1="50" x2="92" y2="50" stroke="currentColor" strokeWidth="1.5" opacity="0.4" />
      <line x1="20" y1="20" x2="80" y2="80" stroke="currentColor" strokeWidth="1" opacity="0.25" />
      <line x1="80" y1="20" x2="20" y2="80" stroke="currentColor" strokeWidth="1" opacity="0.25" />

      {/* 北（子）を指す朱色の家紋剣針 */}
      <polygon
        points="50,12 55,50 45,50"
        fill="#C73E3A"
        stroke="#9B1B1B"
        strokeWidth="1.2"
      />
      {/* 南を指す墨色の針 */}
      <polygon
        points="50,88 55,50 45,50"
        fill="currentColor"
        opacity="0.6"
      />

      {/* 中央の菊座・巴丸 */}
      <circle cx="50" cy="50" r="6" fill="#C5A059" stroke="#8A6B29" strokeWidth="1" />
      <circle cx="50" cy="50" r="2.5" fill="#C73E3A" />

      {/* 北の文字「北」 */}
      <text
        x="50"
        y="25"
        textAnchor="middle"
        fontSize="10"
        fontWeight="bold"
        fill="#C73E3A"
        fontFamily="serif"
      >
        北
      </text>
    </svg>
  );
};

// ==========================================
// 5. 朱色の鳥居アイコン（Torii Gate）
// ==========================================
export const ToriiIcon: React.FC<{
  className?: string;
  size?: number;
}> = ({ className = "", size = 20 }) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={`fill-current ${className}`}
    >
      {/* 笠木（一番上の反り屋根） */}
      <path
        d="M1 5.5 C 7 4, 17 4, 23 5.5 L 22.5 7 C 16.5 5.8, 7.5 5.8, 1.5 7 Z"
        fill="#C73E3A"
      />
      {/* 島木・貫（横木） */}
      <rect x="3" y="7.5" width="18" height="1.8" rx="0.5" fill="#9B1B1B" />
      <rect x="2" y="10.5" width="20" height="1.5" rx="0.5" fill="#C73E3A" />
      {/* 額束（中央の扁額台） */}
      <rect x="11.2" y="7.5" width="1.6" height="3" fill="#1C1C1C" />
      {/* 柱（左右の太い柱） */}
      <path d="M5.5 8 L4.5 22 L6.5 22 L7.2 8 Z" fill="#C73E3A" />
      <path d="M18.5 8 L19.5 22 L17.5 22 L16.8 8 Z" fill="#C73E3A" />
      {/* 根巻・台石 */}
      <rect x="4" y="20.5" width="3" height="2" fill="#1C1C1C" />
      <rect x="17" y="20.5" width="3" height="2" fill="#1C1C1C" />
    </svg>
  );
};

// ==========================================
// 6. 提灯アイコン（Chouchin Lantern）
// ==========================================
export const ChouchinIcon: React.FC<{
  className?: string;
  size?: number;
}> = ({ className = "", size = 20 }) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={`fill-none stroke-current ${className}`}
    >
      {/* つり紐・金具 */}
      <path d="M12 2 V 4" strokeWidth="1.5" strokeLinecap="round" />
      <rect x="9" y="4" width="6" height="1.5" rx="0.5" fill="currentColor" stroke="none" />

      {/* 提灯本体（胴体） */}
      <ellipse cx="12" cy="12" rx="7" ry="8" fill="#FBF3DE" stroke="#C73E3A" strokeWidth="1.5" />
      {/* 提灯の竹骨ライン */}
      <path d="M6 9 C 8 8, 16 8, 18 9" stroke="#C73E3A" strokeWidth="0.8" opacity="0.6" />
      <path d="M5 12 C 8 11.5, 16 11.5, 19 12" stroke="#C73E3A" strokeWidth="0.8" opacity="0.6" />
      <path d="M6 15 C 8 16, 16 16, 18 15" stroke="#C73E3A" strokeWidth="0.8" opacity="0.6" />

      {/* 中央の火袋文字「灯」 */}
      <circle cx="12" cy="12" r="3.2" fill="#EA4335" stroke="none" />

      {/* 底座・房飾り */}
      <rect x="9" y="19" width="6" height="1.5" rx="0.5" fill="currentColor" stroke="none" />
      <path d="M12 20.5 V 23" stroke="#C73E3A" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
};

// ==========================================
// 7. 和傘（Wagasa Umbrella）
// ==========================================
export const WagasaIcon: React.FC<{
  className?: string;
  size?: number;
}> = ({ className = "", size = 20 }) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={`fill-none stroke-current ${className}`}
    >
      {/* 傘布（蛇の目） */}
      <path
        d="M2 13 C 3 6, 21 6, 22 13 C 18 12.5, 6 12.5, 2 13 Z"
        fill="#C73E3A"
        stroke="#9B1B1B"
        strokeWidth="1.2"
      />
      {/* 蛇の目の白い輪 */}
      <path
        d="M6 11 C 7 8, 17 8, 18 11"
        stroke="#FFFFFF"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
      {/* 骨・ろくろ */}
      <line x1="12" y1="6" x2="12" y2="22" stroke="#4A3525" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M12 4 L 12 6" stroke="#C5A059" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
};

// ==========================================
// 8. 扇子アイコン（Sensu Fan）
// ==========================================
export const SensuIcon: React.FC<{
  className?: string;
  size?: number;
}> = ({ className = "", size = 20 }) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={`fill-none ${className}`}
    >
      {/* 扇面（金箔・日章） */}
      <path
        d="M3 17 C 5 8, 19 8, 21 17 L 14 18 L 12 19 L 10 18 Z"
        fill="#C5A059"
        stroke="#8A6B29"
        strokeWidth="1"
      />
      {/* 日の丸 */}
      <circle cx="12" cy="13" r="3" fill="#C73E3A" />
      {/* 親骨・要 */}
      <line x1="3" y1="17" x2="12" y2="21" stroke="#3A2A1A" strokeWidth="1.5" />
      <line x1="21" y1="17" x2="12" y2="21" stroke="#3A2A1A" strokeWidth="1.5" />
      <circle cx="12" cy="21" r="1.5" fill="#C5A059" />
    </svg>
  );
};

// ==========================================
// 9. 富士山と瑞雲（Mt. Fuji & Auspicious Clouds）
// ==========================================
export const MtFujiCloud: React.FC<{
  className?: string;
  size?: number;
}> = ({ className = "", size = 28 }) => {
  return (
    <svg
      width={size}
      height={size * 0.75}
      viewBox="0 0 40 30"
      className={`fill-current ${className}`}
    >
      {/* 富士の裾野（藍色 / 藍鉄） */}
      <polygon points="20,5 37,27 3,27" fill="#165E83" />
      {/* 雪嶺（頂上の残雪） */}
      <polygon points="20,5 24,12 21,11 20,13 18,10 16,12" fill="#FFFFFF" />
      {/* 朝日の赤 */}
      <circle cx="28" cy="10" r="4" fill="#C73E3A" opacity="0.85" />
      {/* 瑞雲（和雲・霞） */}
      <path
        d="M2 20 Q 6 18, 10 20 Q 14 18, 18 20 Q 14 22, 10 22 Q 6 22, 2 20 Z"
        fill="#F7F5EB"
        opacity="0.8"
      />
      <path
        d="M24 23 Q 28 21, 32 23 Q 36 21, 40 23 Q 36 25, 32 25 Q 28 25, 24 23 Z"
        fill="#F7F5EB"
        opacity="0.8"
      />
    </svg>
  );
};

// ==========================================
// 10. 江戸道標（Wooden Signpost）
// 案内モードのステップ用アイコン
// ==========================================
export const WoodenSignpost: React.FC<{
  actionText: string;
  direction: "left" | "right" | "straight" | "arrive";
  className?: string;
}> = ({ actionText, direction, className = "" }) => {
  return (
    <div
      className={`relative inline-flex items-center gap-2 rounded-md border border-amber-900/60 bg-[#d8b888] px-2.5 py-1 text-stone-900 shadow-md ${className}`}
      style={{
        backgroundImage:
          "repeating-linear-gradient(45deg, rgba(120,60,20,0.08) 0px, rgba(120,60,20,0.08) 2px, transparent 2px, transparent 6px)",
      }}
    >
      {/* 木札の留め釘 */}
      <span className="w-1.5 h-1.5 rounded-full bg-stone-900/60 shadow-xs" />

      {/* 筆書き方向 */}
      <span className="font-serif font-black text-sm tracking-widest text-stone-950 flex items-center gap-1">
        {direction === "left" && <span>◀ 左折</span>}
        {direction === "right" && <span>右折 ▶</span>}
        {direction === "straight" && <span>▲ 直進</span>}
        {direction === "arrive" && <span>⛩️ 到着</span>}
      </span>

      <span className="text-[11px] font-bold text-amber-950/80">
        {actionText}
      </span>
      <span className="w-1.5 h-1.5 rounded-full bg-stone-900/60 shadow-xs" />
    </div>
  );
};
