import React from "react";
import { TurnDirectionType } from "@/types/route";

export type AppLanguage = "ja" | "en" | "zh";

export function isCurrentLocationText(text: string | null | undefined): boolean {
  if (!text || !text.trim()) return true;
  const t = text.trim();
  return (
    t === "現在地" ||
    t === "出立地" ||
    t === "出立地（現在地）" ||
    t === "Current Location" ||
    t === "Start Point" ||
    t === "Start Point (出立地)" ||
    t === "当前位置" ||
    t === "启程之地" ||
    t === "启程之地（当前位置）"
  );
}

export const I18N = {
  ja: {
    origin: "現在地",
    originTrad: "出立地（現在地）",
    destPlaceholder: "目的地 / 行き先",
    destPlaceholderTrad: "いざ何処へ（目的地）",
    searchPlaceholder: "どこへ行きますか？（例: 坂を避けてカフェ寄り道）",
    searchPlaceholderTrad: "目安箱: 坂を避けて茶屋寄り道、など",
    searching: "AIエージェントがルートを探索中...",
    searchingTrad: "軍師が街道の道筋を推考中...",
    cancelRoute: "ルート解除",
    cancelRouteTrad: "出立中止",
    changeCondition: "条件を変更 💬",
    close: "閉じる ✕",
    toiletSearch: "トイレ寄り道",
    toiletSearchTrad: "茶屋・雪隠寄り道",
    avoidLabel: "回避条件(NG)",
    avoidLabelTrad: "難所・峠回避",
    aiPersona: "AI設定",
    aiPersonaTrad: "軍師・指南役設定",
    startGuide: "開始 ▶",
    startGuideTrad: "いざ出立 ▶",
    exitGuide: "終了 ✕",
    exitGuideTrad: "案内終了 ✕",
    detail: "詳細",
    northReset: "北を上にリセット",
    northResetTrad: "子（北）へ戻す",
    recenter: "スタート地点へ移動",
    recenterTrad: "出立の地へ戻る",
    displaySettings: "表示設定",
    theme: "テーマ",
    themeMinimal: "ミニマル",
    themeTraditional: "和風",
    portrait: "画面レイアウト",
    lang: "言語",
    aiThinking: "AI推論中...",
    aiThinkingTrad: "軍師推論中...",
    addWp: "＋経由",
    addWpTrad: "＋宿場",
    stepAhead: "その先",
    stepAheadTrad: "道中その先",
    headingFixed: "進行方向固定",
    sanpoTitle: "散歩シェア",
    sanpoTitleTrad: "散歩絵巻",
  },
  en: {
    origin: "Current Location",
    originTrad: "Start Point",
    destPlaceholder: "Destination / Where to?",
    destPlaceholderTrad: "Where to?",
    searchPlaceholder: "Where to? (e.g. flat walk with cafe)",
    searchPlaceholderTrad: "Where to? (e.g. scenic quiet path)",
    searching: "AI Agent exploring optimal routes...",
    searchingTrad: "Strategist unrolling optimal routes...",
    cancelRoute: "Clear Route",
    cancelRouteTrad: "Cancel Journey",
    changeCondition: "Edit Prompt 💬",
    close: "Close ✕",
    toiletSearch: "Add Restroom",
    toiletSearchTrad: "Restroom & Teahouse",
    avoidLabel: "Avoid (NG)",
    avoidLabelTrad: "Avoid Steep Pass",
    aiPersona: "AI Settings",
    aiPersonaTrad: "Route Strategist",
    startGuide: "Start ▶",
    startGuideTrad: "Depart ▶",
    exitGuide: "Exit ✕",
    exitGuideTrad: "End Guide ✕",
    detail: "Detail",
    northReset: "Reset North",
    northResetTrad: "Reset North (N)",
    recenter: "Recenter to Start",
    recenterTrad: "Return to Origin",
    displaySettings: "Display Settings",
    theme: "Theme",
    themeMinimal: "⚡ Minimal",
    themeTraditional: "👘 Edo Scroll",
    portrait: "Layout",
    lang: "Language",
    aiThinking: "Thinking...",
    aiThinkingTrad: "Strategist pondering...",
    addWp: "+Via",
    addWpTrad: "+Station",
    stepAhead: "Then",
    stepAheadTrad: "Ahead on road",
    headingFixed: "Heading Up",
    sanpoTitle: "Sanpo Share",
    sanpoTitleTrad: "Photo Scroll",
  },
  zh: {
    origin: "当前位置",
    originTrad: "启程之地",
    destPlaceholder: "目的地 / 前往何处",
    destPlaceholderTrad: "意欲何往（目的地）",
    searchPlaceholder: "你想去哪里？（例：避开坡道去咖啡馆）",
    searchPlaceholderTrad: "寻幽探径：避开陡坡前往茶室休憩等",
    searching: "AI智能体正在规划最佳路线...",
    searchingTrad: "向导谋士正在绘测最佳古道...",
    cancelRoute: "取消路线",
    cancelRouteTrad: "取消启程",
    changeCondition: "修改条件 💬",
    close: "关闭 ✕",
    toiletSearch: "🚻 途径洗手间",
    toiletSearchTrad: "🍵 途经茶室洗手间",
    avoidLabel: "🚫 避开区域 (NG)",
    avoidLabelTrad: "🚫 避开险隘关卡",
    aiPersona: "⚙️ AI设置",
    aiPersonaTrad: "📜 谋士向导设置",
    startGuide: "开始导航 ▶",
    startGuideTrad: "即刻启程 ▶",
    exitGuide: "退出 ✕",
    exitGuideTrad: "结束向导 ✕",
    detail: "详细",
    northReset: "指北复位",
    northResetTrad: "定北复位",
    recenter: "回到起点",
    recenterTrad: "返程至起点",
    displaySettings: "显示设置",
    theme: "主题",
    themeMinimal: "⚡ 极简",
    themeTraditional: "👘 江户绘卷",
    portrait: "画面布局",
    lang: "语言",
    aiThinking: "AI规划中...",
    aiThinkingTrad: "谋士推演中...",
    addWp: "+途经",
    addWpTrad: "+驿站",
    stepAhead: "之后",
    stepAheadTrad: "沿途前瞻",
    headingFixed: "车头朝上",
    sanpoTitle: "散步分享",
    sanpoTitleTrad: "散步图卷",
  },
};

const configuredGeminiModel =
  (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_GEMINI_MODEL || "gemini-3.8-flash";

const geminiDisplayName =
  ({
    "gemini-3.8-flash": "Gemini 3.8 Flash",
    "gemini-3.5-flash-lite": "Gemini 3.5 Flash Lite",
    "gemini-2.5-flash": "Gemini 2.5 Flash",
    "gemini-2.5-pro": "Gemini 2.5 Pro",
    "gemini-1.5-flash": "Gemini 1.5 Flash",
    "gemini-1.5-pro": "Gemini 1.5 Pro",
  } as Record<string, string>)[configuredGeminiModel] || configuredGeminiModel;

export const ROUTE_SEARCH_STAGES = [
  { afterSeconds: 0, label: `${geminiDisplayName}: ユーザー要望と現在地文脈の解析` },
  { afterSeconds: 0.8, label: "Google Routes API: 実道路網で複数ルート候補の探索" },
  { afterSeconds: 1.6, label: "Elevation / 道路環境: 標高プロファイル・安全性の計測" },
  { afterSeconds: 2.4, label: "EmbeddingGemma 2 270M: 希望とルートの意味類似度を比較" },
  { afterSeconds: 3.2, label: "最適ルート案を統合・合成中..." },
];

export const NG_PRESETS = [
  { id: "slope", label: { ja: "急坂・階段", en: "Steep Hills", zh: "陡坡/台阶" } },
  { id: "dark", label: { ja: "暗い夜道", en: "Dark Alleys", zh: "昏暗小路" } },
  { id: "crowd", label: { ja: "繁華街の混雑", en: "Crowds", zh: "闹市拥挤" } },
  { id: "construction", label: { ja: "工事区間", en: "Construction", zh: "施工路段" } },
];

export const PERSONA_PRESETS = [
  {
    id: "standard",
    title: { ja: "🚶‍♂️ 標準（快適・歩行者優先・安全）", en: "🚶‍♂️ Standard (Comfort & Safety)", zh: "🚶‍♂️ 标准（舒适安全）" },
    desc: { ja: "歩道優先、高低差・夜道の治安・天候にバランス良く配慮します", en: "Balanced pedestrian route avoiding hills and dark roads", zh: "优先步行道，平衡考虑坡度、夜间安全和天气" },
    prompt: null,
  },
  {
    id: "guide",
    title: { ja: "🏯 歴史・観光ガイド風（見どころ・豆知識解説）", en: "🏯 Tour Guide (Rich local history & stories)", zh: "🏯 观光向导（详解沿途历史名胜）" },
    desc: { ja: "街歩きガイドとして、各ルートの歴史や撮影スポットを魅力的に解説します", en: "Enriches the walk with local culture, history, and photo spots", zh: "以向导口吻生动讲解沿途历史和绝佳拍照点" },
    prompt: "歴史や観光名所にとても詳しいプロの街歩きガイドとして、各ルートの見どころや豆知識、おすすめの撮影スポットを魅力的に解説してください。",
  },
  {
    id: "fitness",
    title: { ja: "🏃‍♂️ フィットネス早歩き（運動・カロリー消費重視）", en: "🏃‍♂️ Fitness & Fast Walk (Calorie burn)", zh: "🏃‍♂️ 健身快走（促进热量消耗）" },
    desc: { ja: "適度なアップダウンや広い舗装路を選び、健康促進目線で提案します", en: "Selects broad paved roads ideal for exercise and energy burn", zh: "精选适度起伏和平坦宽敞的大路，提升健身效果" },
    prompt: "ウォーキングインストラクターとして、歩きごたえのある適度なアップダウンや広い舗装路を選び、健康促進やカロリー消費の観点からアドバイスしてください。",
  },
  {
    id: "family",
    title: { ja: "👶 子連れ・バリアフリー（段差ゼロ・EV優先）", en: "👶 Barrier-Free / Stroller Friendly", zh: "👶 无障碍/亲子（零台阶、婴儿车友好）" },
    desc: { ja: "ベビーカーや車椅子でも安全な階段ゼロ・フラットルートを最優先します", en: "100% stair-free, elevator-accessible paths suitable for strollers", zh: "100%避开阶梯陡坡，优先电梯齐全设施，婴儿车无忧" },
    prompt: "ベビーカーや車椅子でも安心な完全バリアフリールートを最優先してください。階段や急勾配を100%回避し、エレベーター完備の施設や広い歩道のみを繋いでください。",
  },
];

export const TurnArrowIcon: React.FC<{ type: TurnDirectionType }> = ({ type }) => {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-7 w-7 fill-none stroke-current"
      strokeWidth="2.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {type === "left" && (
        <>
          <path d="M16 19V8a3 3 0 0 0-3-3H6" />
          <path d="M10 9 6 5l4-4" />
        </>
      )}
      {type === "right" && (
        <>
          <path d="M8 19V8a3 3 0 0 1 3-3h7" />
          <path d="m14 9 4-4-4-4" />
        </>
      )}
      {type === "slight_left" && (
        <>
          <path d="M15 19v-7L8 5" />
          <path d="M13 5H8v5" />
        </>
      )}
      {type === "slight_right" && (
        <>
          <path d="M9 19v-7l7-7" />
          <path d="M11 5h5v5" />
        </>
      )}
      {type === "arrive" && <path d="M5 21V4h13l-2.5 5L18 14H5" />}
      {type === "straight" && (
        <>
          <path d="M12 19V5" />
          <path d="m7 10 5-5 5 5" />
        </>
      )}
    </svg>
  );
};
