import React, { useEffect, useRef } from "react";
import { useMap } from "@vis.gl/react-google-maps";
import { ComputedRoute } from "@/types/route";
import { AppLanguage, isCurrentLocationText } from "../hud/hudTypes";

interface GoogleMapsGroundedRouteProps {
  route: ComputedRoute;
  isDark: boolean;
  isTraditional?: boolean;
  language?: AppLanguage;
  isRouteActive?: boolean;
  guideStepIndex?: number | null;
  onPinMoved?: (index: number, newPos: { lat: number; lng: number }) => void;
}

function computeBearingDeg(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function closestPathIndex(path: { lat: number; lng: number }[], target: { lat: number; lng: number }, minIdx = 0): number {
  let bestIdx = minIdx;
  let bestDist = Infinity;
  for (let i = minIdx; i < path.length; i++) {
    const d = Math.hypot(path[i].lat - target.lat, path[i].lng - target.lng);
    if (d < bestDist) {
      bestDist = d;
      bestIdx = i;
    }
  }
  return bestIdx;
}

export const GoogleMapsGroundedRoute: React.FC<GoogleMapsGroundedRouteProps> = ({
  route,
  isDark,
  isTraditional = false,
  language = "ja",
  isRouteActive = false,
  guideStepIndex = null,
  onPinMoved,
}) => {
  const map = useMap();
  const onPinMovedRef = useRef(onPinMoved);
  useEffect(() => { onPinMovedRef.current = onPinMoved; }, [onPinMoved]);
  const lastFittedRouteKeyRef = useRef<string | null>(null);
  const wasGuidingRef = useRef<boolean>(false);

  // ルートが非アクティブになったら前回のフィット履歴をリセット
  useEffect(() => {
    if (!isRouteActive) {
      lastFittedRouteKeyRef.current = null;
    }
  }, [isRouteActive]);

  useEffect(() => {
    if (!map || typeof google === "undefined" || !isRouteActive) return;
    const lines: google.maps.Polyline[] = [];
    const markers: google.maps.Marker[] = [];
    const infoWindows: google.maps.InfoWindow[] = [];

    // バックエンドから返ってきた正確なポリライン path、なければセグメント座標
    const fullGeoPath: { lat: number; lng: number }[] =
      route.apiData?.metrics?.path && route.apiData.metrics.path.length > 0
        ? route.apiData.metrics.path
        : route.segments && route.segments.length > 0
        ? [
            route.segments[0].fromGeo,
            ...route.segments.map((s) => s.toGeo),
          ]
        : [];

    if (fullGeoPath.length === 0) return;

    // Google マップ標準の徒歩ルート（灰色の点線）。AI提案ルートと比較できるように描画
    const baselinePath = route.baseline?.path ?? [];
    if (baselinePath.length > 1) {
      lines.push(
        new google.maps.Polyline({
          path: baselinePath,
          strokeOpacity: 0,
          icons: [
            {
              icon: {
                path: "M 0,-1 0,1",
                strokeOpacity: 1,
                strokeColor: isDark ? "#cbd5e1" : "#5f6060",
                strokeWeight: 4,
                scale: 2.2,
              },
              offset: "0",
              repeat: "12px",
            },
          ],
          zIndex: 6,
          map,
        })
      );
    }

    // 地図のカメラを選択中ルート全体が収まるように自動フィット（ルート変更時のみ。ユーザーの手動操作・ズームを保持）
    const currentRouteKey = `${route.apiData?.route_id ?? route.id}-${route.apiData?.metrics?.encoded_polyline || JSON.stringify(fullGeoPath)}`;
    if (lastFittedRouteKeyRef.current !== currentRouteKey) {
      lastFittedRouteKeyRef.current = currentRouteKey;
      const bounds = new google.maps.LatLngBounds();
      fullGeoPath.forEach((pt) => bounds.extend(pt));
      if (baselinePath.length > 0) {
        baselinePath.forEach((pt) => bounds.extend(pt));
      }
      map.fitBounds(bounds, { top: 70, bottom: 180, left: 40, right: 40 });
    }

    // ナイトモード時の外縁グロー
    if (isDark) {
      lines.push(
        new google.maps.Polyline({
          path: fullGeoPath,
          strokeColor: "#f8fafc",
          strokeOpacity: 0.3,
          strokeWeight: 14,
          zIndex: 8,
          map,
        })
      );
    }

    lines.push(
      new google.maps.Polyline({
        path: fullGeoPath,
        strokeColor: "#18181b",
        strokeOpacity: 1,
        strokeWeight: 10,
        zIndex: 9,
        map,
      })
    );

    // メインポリライン
    if (route.apiData?.metrics?.path && route.apiData.metrics.path.length > 0) {
      lines.push(
        new google.maps.Polyline({
          path: fullGeoPath,
          strokeColor: route.badgeColor || "#4285F4",
          strokeOpacity: 1,
          strokeWeight: 6,
          zIndex: 10,
          map,
        })
      );
    } else {
      route.segments.forEach((seg) => {
        lines.push(
          new google.maps.Polyline({
            path: [seg.fromGeo, seg.toGeo],
            strokeColor: seg.color,
            strokeOpacity: 1,
            strokeWeight: 6.5,
            zIndex: 10,
            map,
          })
        );
      });
    }

    // スポット・経由地ピンの描画
    const waypoints = route.apiData?.waypoints;
    if (waypoints && waypoints.length > 0) {
      waypoints.forEach((wp: any, idx: number) => {
        const isStart = idx === 0;
        const isEnd = idx === waypoints.length - 1;
        const color = isStart ? "#34A853" : isEnd ? "#EA4335" : "#4285F4";

        const startDefault = language === "en" ? "Start Point" : language === "zh" ? "起点" : (isTraditional ? "出立地" : "出発地");
        const endDefault = language === "en" ? "Destination" : language === "zh" ? "目的地" : "目的地";
        const dragNotice = language === "en" ? "(drag to move)" : language === "zh" ? "(可拖拽微调)" : "(ドラッグして位置を変更可能)";

        const displayName = isStart && (!wp.name || isCurrentLocationText(wp.name) || wp.name === "出発地")
          ? startDefault
          : isEnd && (!wp.name || wp.name === "目的地")
          ? endDefault
          : wp.name;

        const marker = new google.maps.Marker({
          position: { lat: wp.lat, lng: wp.lng },
          map,
          title: `${displayName} ${dragNotice}`,
          draggable: true,
          label: {
            text: isStart ? (isTraditional ? "出" : "S") : isEnd ? (isTraditional ? "着" : "G") : `${idx}`,
            color: "#ffffff",
            fontWeight: "bold",
            fontSize: "12px",
          },
          icon: {
            path: "M 0,0 C -3,-4 -8,-11 -8,-17 A 8,8 0 1,1 8,-17 C 8,-11 3,-4 0,0 Z M 0,-19 A 2,2 0 0,0 0,-15 A 2,2 0 0,0 0,-19 Z",
            scale: 1.5,
            fillColor: color,
            fillOpacity: 1,
            strokeColor: "#ffffff",
            strokeWeight: 2,
            anchor: new google.maps.Point(0, 2),
            labelOrigin: new google.maps.Point(0, -17),
          },
          zIndex: 20,
        });

        marker.addListener("dragend", (e: google.maps.MapMouseEvent) => {
          if (e.latLng && onPinMovedRef.current) {
            onPinMovedRef.current(idx, { lat: e.latLng.lat(), lng: e.latLng.lng() });
          }
        });

        const info = new google.maps.InfoWindow({
          content: `<div style="padding: 4px; font-family: sans-serif; max-width: 200px;">
            <b style="font-size: 13px; color: #1e293b;">${displayName}</b>
            ${wp.reason ? `<p style="margin: 4px 0 0; font-size: 11px; color: #475569;">${wp.reason}</p>` : ""}
            ${wp.tags?.length ? `<div style="margin-top: 4px;">${wp.tags.map((t: string) => `<span style="background: #e2e8f0; font-size: 10px; padding: 2px 5px; border-radius: 4px; margin-right: 3px;">${t}</span>`).join("")}</div>` : ""}
          </div>`,
        });

        infoWindows.push(info);
        marker.addListener("click", () => {
          info.open(map, marker);
        });

        markers.push(marker);
      });
    }

    return () => {
      lines.forEach((l) => l.setMap(null));
      markers.forEach((m) => { google.maps.event.clearInstanceListeners(m); m.setMap(null); });
      infoWindows.forEach(info => info.close());
    };
  }, [map, route, isDark, isRouteActive]);

  // 案内モード（guideStepIndex）連動: カメラ追従・進行方向ヘディング・現在ステップのハイライト描画
  useEffect(() => {
    if (!map || typeof google === "undefined" || !isRouteActive) return;

    const fullGeoPath: { lat: number; lng: number }[] =
      route.apiData?.metrics?.path && route.apiData.metrics.path.length > 0
        ? route.apiData.metrics.path
        : route.segments && route.segments.length > 0
        ? [route.segments[0].fromGeo, ...route.segments.map((s) => s.toGeo)]
        : [];

    // 案内終了時に北向きリセット＆全体俯瞰へ戻す
    if (guideStepIndex === null) {
      if (wasGuidingRef.current && fullGeoPath.length > 0) {
        wasGuidingRef.current = false;
        map.setHeading(0);
        const bounds = new google.maps.LatLngBounds();
        fullGeoPath.forEach((pt) => bounds.extend(pt));
        map.fitBounds(bounds, { top: 70, bottom: 180, left: 40, right: 40 });
      }
      return;
    }

    wasGuidingRef.current = true;
    const segs = route.segments;
    if (!segs || segs.length === 0) return;

    const curIdx = Math.min(guideStepIndex, segs.length - 1);
    const activeSeg = segs[curIdx];
    if (!activeSeg) return;

    const navOverlays: Array<google.maps.Polyline | google.maps.Marker | google.maps.Circle> = [];

    // ポリライン上の該当ステップ区間を特定
    let stepPath: { lat: number; lng: number }[] = [activeSeg.fromGeo, activeSeg.toGeo];
    if (fullGeoPath.length >= 2) {
      const sIdx = closestPathIndex(fullGeoPath, activeSeg.fromGeo, 0);
      const eIdx = Math.max(sIdx + 1, closestPathIndex(fullGeoPath, activeSeg.toGeo, sIdx));
      stepPath = fullGeoPath.slice(sIdx, Math.min(fullGeoPath.length, eIdx + 1));
      if (stepPath.length < 2) {
        stepPath = [activeSeg.fromGeo, activeSeg.toGeo];
      }
    }

    const heading = computeBearingDeg(
      stepPath[0],
      stepPath[Math.min(1, stepPath.length - 1)]
    );

    // 1. アクティブ区間のハイライトポリライン（進行方向の矢印付き）
    const activeHighlight = new google.maps.Polyline({
      path: stepPath,
      strokeColor: isTraditional ? "#C73E3A" : "#FBBC05",
      strokeOpacity: 1,
      strokeWeight: 8,
      icons: [
        {
          icon: {
            path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
            scale: 2.6,
            fillColor: "#ffffff",
            fillOpacity: 1,
            strokeColor: isTraditional ? "#C73E3A" : "#18181b",
            strokeWeight: 1.5,
          },
          offset: "50%",
          repeat: "64px",
        },
      ],
      zIndex: 25,
      map,
    });
    navOverlays.push(activeHighlight);

    // 2. 次の曲がり角・目標地点パルスリング
    const targetPulse = new google.maps.Circle({
      center: activeSeg.toGeo,
      radius: 18,
      strokeColor: isTraditional ? "#C73E3A" : "#34A853",
      strokeOpacity: 0.9,
      strokeWeight: 2.5,
      fillColor: isTraditional ? "#C73E3A" : "#34A853",
      fillOpacity: 0.25,
      zIndex: 26,
      map,
    });
    navOverlays.push(targetPulse);

    // 3. 現在ステップ位置のナビゲーション矢印マーカー
    const walkerMarker = new google.maps.Marker({
      position: activeSeg.fromGeo,
      map,
      title: `ステップ ${curIdx + 1}: ${activeSeg.label}`,
      icon: {
        path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
        scale: 6.5,
        rotation: heading,
        fillColor: isTraditional ? "#C73E3A" : "#4285F4",
        fillOpacity: 1,
        strokeColor: "#ffffff",
        strokeWeight: 2.5,
        anchor: new google.maps.Point(0, 2.5),
      },
      zIndex: 30,
    });
    navOverlays.push(walkerMarker);

    // 4. カメラを現在ステップ位置へスムーズに移動＆ストリートズーム
    map.panTo(activeSeg.fromGeo);
    const currentZoom = map.getZoom() ?? 15;
    if (currentZoom < 17) {
      map.setZoom(18);
    }
    map.setHeading(heading);

    return () => {
      navOverlays.forEach((o) => o.setMap(null));
    };
  }, [map, route, isRouteActive, guideStepIndex, isTraditional]);

  return null;
};
