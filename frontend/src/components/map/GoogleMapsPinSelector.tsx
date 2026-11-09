import React, { useEffect, useRef } from "react";
import { useMap } from "@vis.gl/react-google-maps";
import {
  buildDroppedPinInfo,
  MapFacilityPin,
} from "@/data/facilityPins";
import { geoToXY } from "@/data/walkrealData";
import { isMapPinBlocked } from "@/utils/mapPinGuard";
import type { AppLanguage } from "@/components/hud/hudTypes";

interface GoogleMapsPinSelectorProps {
  selectedPin: MapFacilityPin | null;
  droppedPin: MapFacilityPin | null;
  isRouteActive?: boolean;
  isUiHidden?: boolean;
  language?: AppLanguage;
  onSelectPin: (pin: MapFacilityPin | null) => void;
  onDropCustomPin: (pin: MapFacilityPin) => void;
}

export const GoogleMapsPinSelector: React.FC<GoogleMapsPinSelectorProps> = ({
  selectedPin,
  droppedPin,
  isUiHidden = false,
  language = "ja",
  onSelectPin,
  onDropCustomPin,
}) => {
  const map = useMap();
  const callbacksRef = useRef({ onSelectPin, onDropCustomPin });
  callbacksRef.current = { onSelectPin, onDropCustomPin };
  const selectedPinRef = useRef(selectedPin);
  selectedPinRef.current = selectedPin;
  const isUiHiddenRef = useRef(isUiHidden);
  isUiHiddenRef.current = isUiHidden;
  const longPressTimerRef = useRef<number | null>(null);
  const downLatLngRef = useRef<google.maps.LatLng | null>(null);

  useEffect(() => {
    if (!map || typeof google === "undefined") return;

    const markers: google.maps.Marker[] = [];

    // A newly selected location must remain visible even with a route on the map.
    if (droppedPin) {
      const dropMarker = new google.maps.Marker({
        position: { lat: droppedPin.lat, lng: droppedPin.lng },
        map,
        title: droppedPin.name,
        // アニメーションなし
        icon: {
          // Google Maps公式ライクな下尖りティアドロップ＋中央くり抜き円パス（中心(0, -17)、小ぶりな中心円 r=2）
          path: "M 0,0 C -3,-4 -8,-11 -8,-17 A 8,8 0 1,1 8,-17 C 8,-11 3,-4 0,0 Z M 0,-19 A 2,2 0 0,0 0,-15 A 2,2 0 0,0 0,-19 Z",
          fillColor: "#EA4335",
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeWeight: 2,
          scale: 1.5,
          anchor: new google.maps.Point(0, 2),
        },
        zIndex: 60,
      });

      dropMarker.addListener("click", () => {
        callbacksRef.current.onSelectPin(droppedPin);
      });

      markers.push(dropMarker);
    }

    return () => markers.forEach((marker) => {
      google.maps.event.clearInstanceListeners(marker);
      marker.setMap(null);
    });
  }, [map, droppedPin]);

  useEffect(() => {
    if (!map || typeof google === "undefined") return;
    let selectionVersion = 0;
    let disposed = false;
    const onSelectPin = (pin: MapFacilityPin) => callbacksRef.current.onSelectPin(pin);
    const onDropCustomPin = (pin: MapFacilityPin) => callbacksRef.current.onDropCustomPin(pin);
    const isCurrent = (version: number, id: string) => !disposed && version === selectionVersion && selectedPinRef.current?.id === id;

    // マップタイル等の画像ドラッグ＆選択をブラウザレベルで阻止
    const mapDiv = map.getDiv();
    const onNativeDragStart = (e: DragEvent) => {
      e.preventDefault();
      return false;
    };
    const onNativeSelectStart = (e: Event) => {
      const target = e.target as HTMLElement | null;
      if (!target || !(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
      }
    };
    mapDiv.addEventListener("dragstart", onNativeDragStart);
    mapDiv.addEventListener("selectstart", onNativeSelectStart);

    let longPressFired = false;
    const downPosRef = { current: null as { x: number; y: number } | null };

    const getClientPos = (domEvent?: any) => {
      if (!domEvent) return null;
      if (domEvent.touches && domEvent.touches.length > 0) {
        return { x: domEvent.touches[0].clientX, y: domEvent.touches[0].clientY };
      }
      if (domEvent.changedTouches && domEvent.changedTouches.length > 0) {
        return { x: domEvent.changedTouches[0].clientX, y: domEvent.changedTouches[0].clientY };
      }
      if (typeof domEvent.clientX === "number") {
        return { x: domEvent.clientX, y: domEvent.clientY };
      }
      return null;
    };

    // 2. Google Maps 上の施設ピン（POI）クリックをフックして触れた施設そのものの情報を取得
    const clickListener = map.addListener(
      "click",
      (e: google.maps.MapMouseEvent & { placeId?: string }) => {
        if (isUiHiddenRef.current || isMapPinBlocked() || longPressFired) {
          e.stop?.();
          return;
        }
        if (!e.latLng) return;
        const lat = e.latLng.lat();
        const lng = e.latLng.lng();
        const [x, y] = geoToXY({ lat, lng });

        if (e.placeId) {
          e.stop?.(); // Google標準の情報ウィンドウを抑止

          // 触れた施設の位置に下尖りピンを立てる
          const version = ++selectionVersion;
          const poiPin: MapFacilityPin = {
            id: `gmap-poi-${e.placeId}`,
            name: "施設名を取得中...",
            category: "landmark",
            categoryLabel: "選択した施設",
            description: "",
            x,
            y,
            lat,
            lng,
            isCustomDrop: true,
          };
          onDropCustomPin(poiPin);
          onSelectPin(poiPin);

          // A. バックエンド経由で触れた施設の Place Details を公式 Places API から100%ピンポイント取得
          const apiUrl =
            (import.meta as unknown as { env?: Record<string, string> }).env
              ?.VITE_BACKEND_URL || "";
          fetch(`${apiUrl}/api/places/resolve`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ place_id: e.placeId, language }),
          })
            .then((res) => (res.ok ? res.json() : null))
            .then((data) => {
              if (isCurrent(version, poiPin.id) && data?.name && data.name !== "選択したスポット") {
                const placeLat = data.lat ?? lat;
                const placeLng = data.lng ?? lng;
                const [px, py] = geoToXY({ lat: placeLat, lng: placeLng });
                const resolvedPin: MapFacilityPin = {
                  ...poiPin,
                  name: data.name,
                  description: data.address || poiPin.description,
                  lat: placeLat,
                  lng: placeLng,
                  x: px,
                  y: py,
                };
                onDropCustomPin(resolvedPin);
                onSelectPin(resolvedPin);
              }
            })
            .catch(() => undefined);

          // B. 並行してブラウザ側の PlacesService (getDetails) でも取得
          if (google.maps.places?.PlacesService) {
            const service = new google.maps.places.PlacesService(map);
            service.getDetails(
              { placeId: e.placeId, fields: ["name", "formatted_address", "geometry"] },
              (place, status) => {
                if (
                  status === google.maps.places.PlacesServiceStatus.OK &&
                  place?.name && isCurrent(version, poiPin.id)
                ) {
                  const placeLat = place.geometry?.location ? place.geometry.location.lat() : lat;
                  const placeLng = place.geometry?.location ? place.geometry.location.lng() : lng;
                  const [px, py] = geoToXY({ lat: placeLat, lng: placeLng });
                  const resolvedPin: MapFacilityPin = {
                    ...poiPin,
                    name: place.name,
                    description: place.formatted_address || poiPin.description,
                    x: px,
                    y: py,
                    lat: placeLat,
                    lng: placeLng,
                  };
                  onDropCustomPin(resolvedPin);
                  onSelectPin(resolvedPin);
                }
              }
            );
          }
        } else {
          // POIのない通常地点をクリックした場合
          handleDropCustomLocation(lat, lng);
        }
      }
    );

    // 施設ピン以外の任意地点ドロップ処理（余計な近隣探索はせず、その場所の住所・地名を取得）
    const handleDropCustomLocation = (lat: number, lng: number) => {
      const [x, y] = geoToXY({ lat, lng });
      const version = ++selectionVersion;
      const customPin = buildDroppedPinInfo(x, y, { lat, lng });
      onDropCustomPin(customPin);
      onSelectPin(customPin);

      if (google.maps.Geocoder) {
        const geocoder = new google.maps.Geocoder();
        geocoder.geocode({ location: { lat, lng } }, (results, status) => {
          if (isCurrent(version, customPin.id) && status === "OK" && results && results.length > 0) {
            const target = results[0];
            let spotName = target.formatted_address || "指定した地点";
            spotName = spotName
              .replace(/^(日本、|Japan,\s*)?(〒\d{3}-\d{4}\s*)?/, "")
              .trim();
            spotName =
              spotName.replace(/^[^\s県市区]+[都道府県]/, "").trim() || spotName;

            const updatedPin: MapFacilityPin = {
              ...customPin,
              name: spotName || "指定した地点",
              description: target.formatted_address || customPin.description,
            };
            onDropCustomPin(updatedPin);
            onSelectPin(updatedPin);
          }
        });
      }
    };

    // 4. 右クリック（contextmenu）でピン指し（地名・住所を取得してスポット名表示）
    const contextMenuListener = map.addListener(
      "contextmenu",
      (e: google.maps.MapMouseEvent) => {
        if (isUiHiddenRef.current || isMapPinBlocked() || !e.latLng) return;
        handleDropCustomLocation(e.latLng.lat(), e.latLng.lng());
      }
    );

    // 5. 長押し（450ms ホールド）でピン指し（微細な手ブレを許容し、ドラッグ画像選択を防止）
    const clearLongPress = () => {
      if (longPressTimerRef.current) {
        window.clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
      downLatLngRef.current = null;
      downPosRef.current = null;
    };

    const mouseDownListener = map.addListener(
      "mousedown",
      (e: google.maps.MapMouseEvent) => {
        if (isUiHiddenRef.current || isMapPinBlocked() || !e.latLng) return;
        downLatLngRef.current = e.latLng;
        downPosRef.current = getClientPos(e.domEvent);

        if (longPressTimerRef.current) {
          window.clearTimeout(longPressTimerRef.current);
        }

        longPressTimerRef.current = window.setTimeout(() => {
          if (!downLatLngRef.current) return;
          longPressFired = true;
          handleDropCustomLocation(
            downLatLngRef.current.lat(),
            downLatLngRef.current.lng()
          );
          window.setTimeout(() => {
            longPressFired = false;
          }, 350);
        }, 450);
      }
    );

    const mouseMoveListener = map.addListener(
      "mousemove",
      (e: google.maps.MapMouseEvent) => {
        if (!longPressTimerRef.current || !downPosRef.current) return;
        const cur = getClientPos(e.domEvent);
        if (cur) {
          const dist = Math.hypot(cur.x - downPosRef.current.x, cur.y - downPosRef.current.y);
          // 8px以上の意図的な移動があった場合のみドラッグ操作（パン）として長押し解除
          if (dist > 8) {
            clearLongPress();
          }
        }
      }
    );

    const mouseUpListener = map.addListener("mouseup", clearLongPress);
    const dragStartListener = map.addListener("dragstart", () => {
      if (!longPressFired) {
        clearLongPress();
      }
    });

    return () => {
      clearLongPress();
      mapDiv.removeEventListener("dragstart", onNativeDragStart);
      mapDiv.removeEventListener("selectstart", onNativeSelectStart);
      disposed = true;
      selectionVersion++;
      clickListener.remove();
      contextMenuListener.remove();
      mouseDownListener.remove();
      mouseMoveListener.remove();
      mouseUpListener.remove();
      dragStartListener.remove();
    };
  }, [map]);

  return null;
};
