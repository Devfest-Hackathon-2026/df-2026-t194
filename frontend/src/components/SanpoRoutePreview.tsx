import { UiText, useUiText } from "@/i18n/ui";
import { useEffect } from 'react';
import { APIProvider, Map, useMap } from '@vis.gl/react-google-maps';
type Point = { lat: number; lng: number };
function Overlay({ points, path, onMove }: { points: Point[]; path: Point[]; onMove: (index: number, point: Point) => void }) {
  const ui = useUiText();
  const map = useMap();
  useEffect(() => {
    if (!map) return;
    const line = path.length > 1 ? new google.maps.Polyline({ map, path, strokeColor: '#4285F4', strokeWeight: 5 }) : null;
    const markers = points.map((position, index) => {
      const marker = new google.maps.Marker({ map, position, label: String(index + 1), draggable: true });
      marker.addListener('dragend', (event: google.maps.MapMouseEvent) => {
        if (event.latLng) onMove(index, event.latLng.toJSON());
      });
      return marker;
    });
    const bounds = new google.maps.LatLngBounds();
    (path.length ? path : points).forEach(point => bounds.extend(point));
    if (!bounds.isEmpty()) map.fitBounds(bounds, 35);
    return () => { line?.setMap(null); markers.forEach(marker => { google.maps.event.clearInstanceListeners(marker); marker.setMap(null); }); };
  }, [map, points, path, onMove]);
  return null;
}
export function SanpoRoutePreview(props: { points: Point[]; path: Point[]; onMove: (index: number, point: Point) => void }) {
  const ui = useUiText();
  const key = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  if (!key) return <p className="text-xs text-amber-600"><UiText text={"地図表示用のAPIキーが設定されていません。"} /></p>;
  return <div className="h-64 overflow-hidden rounded-xl border border-zinc-300">
    <APIProvider apiKey={key}><Map defaultCenter={props.points[0]} defaultZoom={14} gestureHandling="cooperative" disableDefaultUI>
      <Overlay {...props} />
    </Map></APIProvider>
  </div>;
}
