import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Vite 設定: パスエイリアスとビルド最適化
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
    },
  },
  build: {
    target: "es2022",
    sourcemap: false,
  },
});
