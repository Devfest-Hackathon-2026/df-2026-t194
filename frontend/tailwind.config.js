/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Google 4色アクセント定義
        google: {
          blue: "#4285F4",
          red: "#EA4335",
          yellow: "#FBBC05",
          green: "#34A853",
        },
        // 江戸伝統色パレット（Japanese Traditional Theme）
        edo: {
          shu: "#C73E3A",       // 朱赤（朱肉・鳥居）
          ai: "#165E83",        // 藍色（浮世絵波・水面）
          gold: "#C5A059",      // 金箔・真鍮
          matcha: "#6B7A42",    // 抹茶・庭園
          washi: "#FAF6ED",     // 和紙・鳥の子色
          washiDark: "#1E1B18", // 濡羽色・漆黒和紙
          sumi: "#1F1D1D",      // 墨黒
        },
      },
      borderRadius: {
        "2xl": "1rem",
        "3xl": "1.5rem",
        "4xl": "2rem",
      },
      fontFamily: {
        sans: [
          "Inter",
          "-apple-system",
          "BlinkMacSystemFont",
          "Hiragino Sans",
          "Noto Sans JP",
          "sans-serif",
        ],
        serif: [
          "Shippori Mincho",
          "Yu Mincho",
          "Hiragino Mincho ProN",
          "Noto Serif JP",
          "serif",
        ],
        mono: ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "monospace"],
      },
    },
  },
  plugins: [],
};
