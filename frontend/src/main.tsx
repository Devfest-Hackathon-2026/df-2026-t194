import React from "react";
import ReactDOM from "react-dom/client";
import App from "@/App";
import "@/index.css";

// 画面全体のピンチズーム・ダブルタップズームを禁止（地図自体の操作は維持）
if (typeof window !== "undefined") {
  // iOS Safari のブラウザ画面ジェスチャーズーム防止
  document.addEventListener("gesturestart", (e) => e.preventDefault(), {
    passive: false,
  });
  document.addEventListener("gesturechange", (e) => e.preventDefault(), {
    passive: false,
  });
  document.addEventListener("gestureend", (e) => e.preventDefault(), {
    passive: false,
  });

  // デスクトップでの Ctrl + ホイール（トラックパッドピンチズーム）による画面拡大を防止
  window.addEventListener(
    "wheel",
    (e) => {
      if (e.ctrlKey) {
        e.preventDefault();
      }
    },
    { passive: false }
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
