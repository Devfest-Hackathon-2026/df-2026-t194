import React, { useEffect } from "react";
import { useMap } from "@vis.gl/react-google-maps";
import { AppLanguage } from "../hud/hudTypes";

interface GoogleMapsCurrentLocationMarkerProps {
  currentLocation?: { lat: number; lng: number } | null;
  isTraditional?: boolean;
  language?: AppLanguage;
}

export const GoogleMapsCurrentLocationMarker: React.FC<GoogleMapsCurrentLocationMarkerProps> = ({
  currentLocation,
  isTraditional = false,
  language = "ja",
}) => {
  const map = useMap();

  useEffect(() => {
    if (!map || typeof google === "undefined" || !currentLocation) return;

    // 現在地の青いパルスドット（外枠リング＋中身の青丸）
    const outerPulse = new google.maps.Circle({
      strokeColor: isTraditional ? "#C73E3A" : "#4285F4",
      strokeOpacity: 0.35,
      strokeWeight: 1.5,
      fillColor: isTraditional ? "#C73E3A" : "#4285F4",
      fillOpacity: 0.15,
      map,
      center: currentLocation,
      radius: 40, // 40m radius
      zIndex: 15,
    });

    const markerTitle =
      language === "en"
        ? "Current Location"
        : language === "zh"
        ? "当前位置"
        : isTraditional
        ? "出立地（現在地）"
        : "現在地";

    const innerDot = new google.maps.Marker({
      position: currentLocation,
      map,
      title: markerTitle,
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        scale: 8,
        fillColor: isTraditional ? "#C73E3A" : "#4285F4",
        fillOpacity: 1,
        strokeColor: "#ffffff",
        strokeWeight: 2.5,
      },
      zIndex: 16,
    });

    return () => {
      outerPulse.setMap(null);
      innerDot.setMap(null);
    };
  }, [map, currentLocation, isTraditional]);

  return null;
};
