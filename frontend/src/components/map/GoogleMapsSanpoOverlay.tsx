import { getWalkPath } from "@/services/sanpoGeometry";
import React, { useEffect, useRef } from "react";
import { useMap } from "@vis.gl/react-google-maps";
import { WalkRealRoutePost } from "@/types/walkreal";
import { AppLanguage } from "../hud/hudTypes";

interface GoogleMapsSanpoOverlayProps {
  post: WalkRealRoutePost | null;
  isDark?: boolean;
  language?: AppLanguage;
  isRouteActive?: boolean;
  onAddWaypoint?: (spotName: string, geo: { lat: number; lng: number }) => void;
  onWalkToSpot?: (spotName: string, geo: { lat: number; lng: number }) => void;
}

export const GoogleMapsSanpoOverlay: React.FC<GoogleMapsSanpoOverlayProps> = ({
  post,
  language = "ja",
  isRouteActive = false,
  onAddWaypoint,
  onWalkToSpot,
}) => {
  const map = useMap();
  const lastFittedPostIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!post) {
      lastFittedPostIdRef.current = null;
    }
  }, [post]);

  useEffect(() => {
    if (!map || typeof google === "undefined" || !post) return;
    const walkPath = getWalkPath(post);
    const lines: google.maps.Polyline[] = [];
    const markers: google.maps.Marker[] = [];
    const infoWindows: google.maps.InfoWindow[] = [];

    // 1. ルートプレビューポリライン
    // ルート案内中(isRouteActive=true)は GoogleMapsGroundedRoute が正規のポリラインを描画するため、
    // ここでのポリライン描画は未案内時のプレビュー表示のみに限定し、重複や古いルートの残存を完全に防止
    if (!isRouteActive && walkPath && walkPath.length > 1) {
      lines.push(
        new google.maps.Polyline({
          path: walkPath,
          strokeColor: "#0f172a",
          strokeOpacity: 0.8,
          strokeWeight: 8,
          zIndex: 30,
          map,
        })
      );
      lines.push(
        new google.maps.Polyline({
          path: walkPath,
          strokeColor: post.color || "#f97316",
          strokeOpacity: 1,
          strokeWeight: 5,
          zIndex: 31,
          map,
        })
      );

      // 地図カメラを散歩ルート全体に合わせる（初回表示時のみ。手動操作を保持）
      if (lastFittedPostIdRef.current !== post.id) {
        lastFittedPostIdRef.current = post.id;
        const bounds = new google.maps.LatLngBounds();
        walkPath.forEach((pt) => bounds.extend(pt));
        map.fitBounds(bounds, { top: 90, bottom: 200, left: 50, right: 50 });
      }
    }

    // 2. 写真スナップマーカー
    post.snaps.forEach((snap) => {
      const spotLabel = language === "en" ? `Spot ${snap.order}` : language === "zh" ? `地点 ${snap.order}` : `スポット ${snap.order}`;
      const shotLabel = language === "en" ? `Shot: ${snap.timestamp} (NO FILTER)` : language === "zh" ? `拍摄: ${snap.timestamp} (无滤镜)` : `撮影: ${snap.timestamp} (NO FILTER)`;
      const addText = language === "en" ? "📍 Add to stops" : language === "zh" ? "📍 设为途经点" : "📍 経由地に追加";
      const walkText = language === "en" ? "🚶 Walk here" : language === "zh" ? "🚶 步行前往" : "🚶 ここへ歩く";

      const iw = new google.maps.InfoWindow({
        content: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 220px; padding: 6px 4px; color: #0f172a;">
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px;">
              <span style="font-size: 11px; font-weight: 800; color: #f97316;">${spotLabel}</span>
              <span style="font-size: 9px; font-weight: 700; color: #16a34a; background: #dcfce7; padding: 2px 6px; border-radius: 9999px;">RAW</span>
            </div>
            <div style="font-size: 13px; font-weight: 800; line-height: 1.3; margin-bottom: 6px; color: #0f172a;">
              ${snap.spotName}
            </div>
            <div style="position: relative; width: 100%; height: 110px; margin-bottom: 6px; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.12);">
              <img src="${snap.mainImageUrl}" style="width: 100%; height: 100%; object-fit: cover;" />
              ${snap.timestamp ? `
                <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); background: rgba(0,0,0,0.65); color: #fff; padding: 3px 10px; border-radius: 9999px; font-size: 13px; font-weight: 800; white-space: nowrap; backdrop-filter: blur(4px); pointer-events: none; border: 1px solid rgba(255,255,255,0.2); box-shadow: 0 2px 8px rgba(0,0,0,0.3); text-shadow: 0 1px 2px rgba(0,0,0,0.5);">
                  🕒 ${snap.timestamp}
                </div>
              ` : ''}
            </div>
            <div style="font-size: 11px; color: #475569; line-height: 1.4; margin-bottom: 6px;">${snap.caption}</div>
            <div style="font-size: 9px; color: #94a3b8; margin-bottom: 8px;">${shotLabel}</div>

            <div style="display: flex; flex-direction: column; gap: 4px; border-top: 1px solid #e2e8f0; padding-top: 8px;">
              <button id="sanpo-add-wp-${snap.id}" style="width: 100%; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 9999px; padding: 5px 10px; font-size: 11px; font-weight: 700; color: #1e293b; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 4px; transition: background 0.2s;">
                ${addText}
              </button>
              <button id="sanpo-walk-to-${snap.id}" style="width: 100%; background: #0f172a; border: none; border-radius: 9999px; padding: 5px 10px; font-size: 11px; font-weight: 700; color: #ffffff; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 4px; transition: background 0.2s;">
                ${walkText}
              </button>
            </div>
          </div>
        `,
      });
      infoWindows.push(iw);

      // DOM イベントリスナー登録
      google.maps.event.addListener(iw, "domready", () => {
        const addBtn = document.getElementById(`sanpo-add-wp-${snap.id}`);
        if (addBtn) {
          addBtn.onclick = () => {
            onAddWaypoint?.(snap.spotName, { lat: snap.lat, lng: snap.lng });
            iw.close();
          };
        }
        const walkBtn = document.getElementById(`sanpo-walk-to-${snap.id}`);
        if (walkBtn) {
          walkBtn.onclick = () => {
            onWalkToSpot?.(snap.spotName, { lat: snap.lat, lng: snap.lng });
            iw.close();
          };
        }
      });

      const marker = new google.maps.Marker({
        position: { lat: snap.lat, lng: snap.lng },
        map,
        title: `${snap.order}. ${snap.spotName}`,
        label: {
          text: `${snap.order}`,
          color: "#ffffff",
          fontWeight: "900",
          fontSize: "11px",
        },
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 14,
          fillColor: "#f97316",
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeWeight: 2.5,
        },
        zIndex: 50,
      });

      marker.addListener("click", () => {
        infoWindows.forEach((w) => w.close());
        iw.open(map, marker);
      });
      markers.push(marker);
    });

    return () => {
      lines.forEach((l) => l.setMap(null));
      markers.forEach((m) => m.setMap(null));
      infoWindows.forEach((w) => w.close());
    };
  }, [map, post, isRouteActive]);

  return null;
};
