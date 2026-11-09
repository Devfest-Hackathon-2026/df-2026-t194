export type ThemeMode = "modern" | "traditional";

export interface ThemeConfig {
  mode: ThemeMode;
  name: string;
  label: {
    ja: string;
    en: string;
    zh: string;
  };
  description: {
    ja: string;
    en: string;
    zh: string;
  };
}

export const THEMES: Record<ThemeMode, ThemeConfig> = {
  modern: {
    mode: "modern",
    name: "Modern Minimal",
    label: {
      ja: "ミニマル",
      en: "Minimal",
      zh: "极简",
    },
    description: {
      ja: "無駄を削ぎ落とした洗練されたモダンUI",
      en: "Clean and functional modern minimal UI",
      zh: "现代精炼简约风格",
    },
  },
  traditional: {
    mode: "traditional",
    name: "Japanese Traditional (Edo Scroll)",
    label: {
      ja: "和風絵巻",
      en: "Edo Scroll",
      zh: "江户绘卷",
    },
    description: {
      ja: "巻物・浮世絵・和紙が彩る江戸時代情緒のUI",
      en: "Authentic Edo-period scroll & ukiyo-e aesthetic",
      zh: "卷轴、浮世绘与和纸织就的江户时代风情",
    },
  },
};
