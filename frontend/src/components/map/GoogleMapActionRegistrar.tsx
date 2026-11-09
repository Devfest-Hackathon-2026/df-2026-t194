import React, { useEffect, useRef } from "react";
import { useMap } from "@vis.gl/react-google-maps";
import { ComputedRoute } from "@/types/route";

interface GoogleMapActionRegistrarProps {
  route: ComputedRoute;
  currentLocation?: { lat: number; lng: number } | null;
  isRouteActive?: boolean;
  guideStepIndex?: number | null;
  onRegisterMapActions?: (actions: {
    resetNorth: () => void;
    recenter: () => void;
  }) => void;
}

export const GoogleMapActionRegistrar: React.FC<GoogleMapActionRegistrarProps> = ({
  route,
  currentLocation,
  isRouteActive = false,
  guideStepIndex = null,
  onRegisterMapActions,
}) => {
  const map = useMap();
  const routeRef = useRef(route);
  routeRef.current = route;
  const locRef = useRef(currentLocation);
  locRef.current = currentLocation;
  const isRouteActiveRef = useRef(isRouteActive);
  isRouteActiveRef.current = isRouteActive;
  const guideStepIndexRef = useRef(guideStepIndex);
  guideStepIndexRef.current = guideStepIndex;

  // デフォルトマップ位置を現在地にセンタリング（ルート未設定時、GPS測位完了後に一度自動移動）
  const hasAutoCenteredRef = useRef(false);
  useEffect(() => {
    if (!map || isRouteActive || hasAutoCenteredRef.current || !currentLocation) return;
    map.panTo(currentLocation);
    map.setZoom(16);
    hasAutoCenteredRef.current = true;
  }, [map, currentLocation, isRouteActive]);

  useEffect(() => {
    if (!map || !onRegisterMapActions) return;
    onRegisterMapActions({
      resetNorth: () => {
        map.setHeading(0);
      },
      recenter: () => {
        // 0. 案内モード中なら現在の案内ステップ位置へ移動
        if (guideStepIndexRef.current !== null && routeRef.current.segments.length > 0) {
          const idx = Math.min(guideStepIndexRef.current, routeRef.current.segments.length - 1);
          const seg = routeRef.current.segments[idx];
          if (seg?.fromGeo) {
            map.panTo(seg.fromGeo);
            map.setZoom(18);
            return;
          }
        }
        // 1. ルート表示中（isRouteActive）なら、ルートの出発地点に移動
        if (isRouteActiveRef.current && routeRef.current.apiData?.metrics?.path?.[0]) {
          map.panTo(routeRef.current.apiData.metrics.path[0]);
          map.setZoom(16);
          return;
        }
        // 2. 待機時またはルート未決定時:
        // まず現在保持している座標（富山市上空または取得済みGPS）へ移動
        const fallbackTarget = locRef.current || { lat: 36.6959, lng: 137.2137 };
        map.panTo(fallbackTarget);
        map.setZoom(16);

        // 端末のブラウザGPSで最新の現在地を取得してスムーズに更新
        if (typeof navigator !== "undefined" && navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              const fresh = { lat: pos.coords.latitude, lng: pos.coords.longitude };
              map.panTo(fresh);
              map.setZoom(16);
            },
            (err) => {
              console.info("Geolocation position refresh skipped:", err.message);
            },
            { enableHighAccuracy: true, timeout: 6000, maximumAge: 0 }
          );
        }
      },
    });
  }, [map, onRegisterMapActions]);

  return null;
};
