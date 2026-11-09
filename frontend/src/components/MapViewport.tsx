import React, { useEffect, useRef, useState } from "react";
import {
  APIProvider,
  Map as GoogleMapView,
} from "@vis.gl/react-google-maps";
import { ComputedRoute } from "@/types/route";
import { WalkRealRoutePost } from "@/types/walkreal";
import { ThemeMode } from "@/types/theme";
import { AppLanguage } from "./hud/hudTypes";
import {
  traditionalLightMapStyle,
  traditionalDarkMapStyle,
} from "@/data/traditionalMapStyles";
import { modernDarkMapStyle } from "@/data/modernMapStyles";
import { buildDroppedPinInfo, MapFacilityPin } from "@/data/facilityPins";
import { GoogleMapsSanpoOverlay } from "./map/GoogleMapsSanpoOverlay";
import { GoogleMapsGroundedRoute } from "./map/GoogleMapsGroundedRoute";
import { GoogleMapActionRegistrar } from "./map/GoogleMapActionRegistrar";
import { GoogleMapsCurrentLocationMarker } from "./map/GoogleMapsCurrentLocationMarker";
import { GoogleMapsPinSelector } from "./map/GoogleMapsPinSelector";
import { VectorFallbackMap } from "./map/VectorFallbackMap";
import { RuneIcon } from "@/components/ui/RuneIcon";
import { blockMapPinTemporarily, isMapPinBlocked } from "@/utils/mapPinGuard";

interface MapViewportProps {
  route: ComputedRoute;
  isDark: boolean;
  themeMode?: ThemeMode;
  language?: AppLanguage;
  isPortrait?: boolean;
  originLabel: string;
  destinationLabel: string;
  guideStepIndex: number | null;
  isRouteActive?: boolean;
  currentLocation?: { lat: number; lng: number } | null;
  walkRealPost?: WalkRealRoutePost | null;
  isUiHidden?: boolean;
  onRestoreUi?: () => void;
  onPinMoved?: (index: number, newPos: { lat: number; lng: number }) => void;
  onRegisterMapActions?: (actions: {
    resetNorth: () => void;
    recenter: () => void;
  }) => void;
  onAddWaypointFromSnap?: (spotName: string, geo: { lat: number; lng: number }) => void;
  onWalkToSpot?: (spotName: string, geo: { lat: number; lng: number }) => void;
  onPinCardOpenChange?: (isOpen: boolean) => void;
  pinResetKey?: number;
  selectedPin?: MapFacilityPin | null;
  onSelectPin?: (pin: MapFacilityPin | null) => void;
}

export const MapViewport: React.FC<MapViewportProps> = ({
  route,
  isDark,
  themeMode = "modern",
  language = "ja",
  originLabel,
  destinationLabel,
  guideStepIndex,
  isRouteActive = false,
  currentLocation,
  walkRealPost,
  isUiHidden = false,
  onRestoreUi,
  onPinMoved,
  onRegisterMapActions,
  onAddWaypointFromSnap,
  onWalkToSpot,
  onPinCardOpenChange,
  pinResetKey = 0,
  selectedPin: externalSelectedPin,
  onSelectPin: externalOnSelectPin,
}) => {
  const [zoom, setZoom] = useState<number>(1.0);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const pointerDownClientRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const longPressTimerRef = useRef<number | null>(null);
  const mapWrapperRef = useRef<HTMLDivElement | null>(null);

  // 選択中の施設ピン ＆ 長押しで指したドロップピン
  const [internalSelectedPin, setInternalSelectedPin] = useState<MapFacilityPin | null>(null);
  const selectedPin = externalSelectedPin !== undefined ? externalSelectedPin : internalSelectedPin;
  const setSelectedPin = (pin: MapFacilityPin | null) => {
    setInternalSelectedPin(pin);
    externalOnSelectPin?.(pin);
    if (!pin) {
      setDroppedPin(null);
    }
  };
  const [droppedPin, setDroppedPin] = useState<MapFacilityPin | null>(null);

  // Once the route has been replaced, its markers take over the submitted pin.
  useEffect(() => {
    if (!selectedPin) setDroppedPin(null);
  }, [route, selectedPin]);

  // ルート検索中止・終了時のみ、選択中のピン・ドロップピンをすべて取り消す（通常時のピン刺しを消さない）
  const prevRouteActiveRef = useRef(isRouteActive);
  const prevPinResetKeyRef = useRef(pinResetKey);

  useEffect(() => {
    const wasRouteActive = prevRouteActiveRef.current;
    prevRouteActiveRef.current = isRouteActive;

    const pinResetChanged = pinResetKey !== prevPinResetKeyRef.current && pinResetKey > 0;
    prevPinResetKeyRef.current = pinResetKey;

    if (pinResetChanged || (wasRouteActive && !isRouteActive)) {
      setSelectedPin(null);
      setDroppedPin(null);
    }
  }, [pinResetKey, isRouteActive]);

  useEffect(() => {
    onPinCardOpenChange?.(selectedPin !== null);
  }, [selectedPin, onPinCardOpenChange]);

  const isTraditional = themeMode === "traditional";
  const isMobile = typeof window !== "undefined" ? window.innerWidth < 768 : false;

  const apiKey =
    (import.meta as unknown as { env?: Record<string, string> }).env
      ?.VITE_GOOGLE_MAPS_API_KEY || "";

  const isNavMode = guideStepIndex !== null;

  // 案内ステップ進行時にカメラのパンずれを自動リセット
  useEffect(() => {
    setPan({ x: 0, y: 0 });
  }, [guideStepIndex]);

  const startPt = route.segments[0].from;

  // 案内モード時のヘディングアップカメラ計算
  let camRotateDeg = 0;
  let camCenterX = 480;
  let camCenterY = 240;
  let effectiveScale = zoom;
  let segAngleDeg = -90;

  const activeIdx =
    guideStepIndex !== null
      ? Math.min(guideStepIndex, route.segments.length - 1)
      : 0;
  const activeSeg = isNavMode ? route.segments[activeIdx] : null;

  if (isNavMode && activeSeg) {
    const p1 = activeSeg.from;
    const p2 = activeSeg.to;
    segAngleDeg = (Math.atan2(p2[1] - p1[1], p2[0] - p1[0]) * 180) / Math.PI;
    camRotateDeg = -90 - segAngleDeg;
    camCenterX = p1[0] + (p2[0] - p1[0]) * 0.32;
    camCenterY = p1[1] + (p2[1] - p1[1]) * 0.32;
    effectiveScale = zoom * 2.15;
  }

  const viewTargetX = 485 + pan.x;
  const viewTargetY = (isNavMode ? 345 : 240) + pan.y;

  // クライアント座標(clientX, clientY)をベクターマップの世界座標(0..1000, 0..600)へ精密変換
  const clientToWorldXY = (clientX: number, clientY: number): [number, number] => {
    // 1. SVGのネイティブ行列API (getScreenCTM) を用いた完全精密逆変換
    const svgWorldGroup = document.getElementById("vector-map-world-group") as SVGGElement | null;
    const svgRoot = mapWrapperRef.current?.querySelector("svg") as SVGSVGElement | null;
    if (svgWorldGroup && svgRoot) {
      const pt = svgRoot.createSVGPoint();
      pt.x = clientX;
      pt.y = clientY;
      const ctm = svgWorldGroup.getScreenCTM();
      if (ctm) {
        const transformed = pt.matrixTransform(ctm.inverse());
        return [
          Math.max(40, Math.min(960, Math.round(transformed.x))),
          Math.max(40, Math.min(560, Math.round(transformed.y))),
        ];
      }
    }

    // 2. フォールバック手計算（アスペクト比レターボックス補正込み）
    const el = mapWrapperRef.current;
    if (!el) return [480, 240];
    const rect = el.getBoundingClientRect();
    const vbX = isMobile ? 70 : 0;
    const vbY = isMobile ? -20 : 0;
    const vbW = isMobile ? 830 : 1000;
    const vbH = isMobile ? 650 : 600;

    const screenRatio = rect.width / Math.max(1, rect.height);
    const vbRatio = vbW / vbH;
    let actualW = rect.width;
    let actualH = rect.height;
    let offsetX = 0;
    let offsetY = 0;

    if (screenRatio > vbRatio) {
      actualW = rect.height * vbRatio;
      offsetX = (rect.width - actualW) / 2;
    } else {
      actualH = rect.width / vbRatio;
      offsetY = (rect.height - actualH) / 2;
    }

    const svgX = vbX + ((clientX - rect.left - offsetX) / Math.max(1, actualW)) * vbW;
    const svgY = vbY + ((clientY - rect.top - offsetY) / Math.max(1, actualH)) * vbH;

    const worldX = (svgX - viewTargetX) / effectiveScale + camCenterX;
    const worldY = (svgY - viewTargetY) / effectiveScale + camCenterY;
    return [
      Math.max(40, Math.min(960, Math.round(worldX))),
      Math.max(40, Math.min(560, Math.round(worldY))),
    ];
  };

  const clearLongPressTimer = () => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handleDropPinAtClientPos = (clientX: number, clientY: number) => {
    const [wx, wy] = clientToWorldXY(clientX, clientY);
    const customPin = buildDroppedPinInfo(wx, wy);
    setDroppedPin(customPin);
    setSelectedPin(customPin);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isUiHidden || isMapPinBlocked()) return;
    if ((e.target as HTMLElement).closest("[data-zoom-pill]")) return;
    if ((e.target as HTMLElement).closest("[data-pin-card]")) return;
    if ((e.target as HTMLElement).closest("[data-facility-pin]")) return;

    // 右クリック時は即座にピン指し
    if (e.button === 2) {
      handleDropPinAtClientPos(e.clientX, e.clientY);
      return;
    }

    setIsDragging(true);
    dragStartRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
    pointerDownClientRef.current = { x: e.clientX, y: e.clientY };

    // 500msの長押しでピン指し発火
    clearLongPressTimer();
    const startClient = { x: e.clientX, y: e.clientY };
    longPressTimerRef.current = window.setTimeout(() => {
      handleDropPinAtClientPos(startClient.x, startClient.y);
      setIsDragging(false);
      clearLongPressTimer();
    }, 500);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    // 5px以上の移動があった場合は長押し判定をキャンセル（ドラッグ操作とみなす）
    if (longPressTimerRef.current !== null) {
      const movedDist = Math.hypot(
        e.clientX - pointerDownClientRef.current.x,
        e.clientY - pointerDownClientRef.current.y
      );
      if (movedDist > 7) {
        clearLongPressTimer();
      }
    }

    if (!isDragging) return;
    setPan({
      x: e.clientX - dragStartRef.current.x,
      y: e.clientY - dragStartRef.current.y,
    });
  };

  const handlePointerUp = () => {
    clearLongPressTimer();
    setIsDragging(false);
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    setZoom((prev) =>
      Math.max(0.65, Math.min(2.8, prev + (e.deltaY < 0 ? 0.08 : -0.08)))
    );
  };

  // SVGモード時: コンパスリセットと現在地移動アクションを親に登録
  useEffect(() => {
    if (apiKey || !onRegisterMapActions) return;
    onRegisterMapActions({
      resetNorth: () => {
        setZoom(1.0);
        setPan({ x: 0, y: 0 });
      },
      recenter: () => {
        setPan({ x: 480 - startPt[0], y: 240 - startPt[1] });
        setZoom(1.0);
      },
    });
  }, [apiKey, startPt, onRegisterMapActions]);

  return (
    <div
      ref={mapWrapperRef}
      data-map-viewport="true"
      onContextMenu={(e) => {
        // 右クリック時のブラウザ標準コンテキストメニューを抑制
        e.preventDefault();
      }}
      onClick={() => {
        if (isUiHidden) {
          blockMapPinTemporarily(400);
          onRestoreUi?.();
        }
      }}
      className={`relative h-full w-full overflow-hidden select-none transition-colors ${
        isTraditional
          ? isDark
            ? "bg-[#181512]"
            : "bg-[#f5f0e3]"
          : isDark
          ? "bg-[#0f172a]"
          : "bg-[#eef1f6]"
      }`}
    >
      {apiKey ? (
        <APIProvider apiKey={apiKey} libraries={["places", "geometry"]}>
          <GoogleMapView
            defaultCenter={currentLocation || { lat: 36.6959, lng: 137.2137 }}
            defaultZoom={15}
            gestureHandling="greedy"
            disableDefaultUI
            onClick={() => {
              if (isUiHidden) {
                blockMapPinTemporarily(400);
                onRestoreUi?.();
              }
            }}
            className="h-full w-full"
            styles={
              isTraditional
                ? isDark
                  ? traditionalDarkMapStyle
                  : traditionalLightMapStyle
                : isDark
                ? modernDarkMapStyle
                : []
            }
          >
            <GoogleMapsCurrentLocationMarker
              currentLocation={currentLocation}
              isTraditional={isTraditional}
              language={language}
            />
            <GoogleMapsGroundedRoute
              route={route}
              isDark={isDark}
              isTraditional={isTraditional}
              language={language}
              isRouteActive={isRouteActive}
              guideStepIndex={guideStepIndex}
              onPinMoved={onPinMoved}
            />
            <GoogleMapsSanpoOverlay
              post={walkRealPost ?? null}
              isDark={isDark}
              language={language}
              isRouteActive={isRouteActive}
              onAddWaypoint={onAddWaypointFromSnap}
              onWalkToSpot={onWalkToSpot}
            />
            <GoogleMapActionRegistrar
              route={route}
              currentLocation={currentLocation}
              isRouteActive={isRouteActive}
              guideStepIndex={guideStepIndex}
              onRegisterMapActions={onRegisterMapActions}
            />
            {/* Google Maps上の施設ピン＆長押しピン選択 */}
            <GoogleMapsPinSelector
              selectedPin={selectedPin}
              droppedPin={droppedPin}
              isRouteActive={isRouteActive}
              isUiHidden={isUiHidden}
              language={language}
              onSelectPin={(pin) => {
                setSelectedPin(pin);
                if (pin?.isCustomDrop) {
                  setDroppedPin(pin);
                }
              }}
              onDropCustomPin={(pin) => {
                setDroppedPin(pin);
                setSelectedPin(pin);
              }}
            />
          </GoogleMapView>
        </APIProvider>
      ) : (
        <div
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={clearLongPressTimer}
          onWheel={handleWheel}
          className={`h-full w-full select-none touch-none ${
            isDragging ? "cursor-grabbing" : "cursor-grab"
          }`}
        >
          <VectorFallbackMap
            route={route}
            isDark={isDark}
            isTraditional={isTraditional}
            language={language}
            isMobile={isMobile}
            isRouteActive={isRouteActive}
            isNavMode={isNavMode}
            originLabel={originLabel}
            destinationLabel={destinationLabel}
            activeIdx={activeIdx}
            viewTargetX={viewTargetX}
            viewTargetY={viewTargetY}
            effectiveScale={effectiveScale}
            camRotateDeg={camRotateDeg}
            camCenterX={camCenterX}
            camCenterY={camCenterY}
            segAngleDeg={segAngleDeg}
            isDragging={isDragging}
            selectedPin={selectedPin}
            droppedPin={droppedPin}
            onSelectFacilityPin={(pin) => setSelectedPin(pin)}
          />
        </div>
      )}
    </div>
  );
};

export default MapViewport;
