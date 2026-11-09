import { WalkRealRoutePost } from '@/types/walkreal';
type Point = { lat: number; lng: number };
export function encodeWalkPath(path: Point[]): string {
  let lat = 0, lng = 0, result = '';
  const encode = (delta: number) => {
    let value = delta < 0 ? ~(delta << 1) : delta << 1;
    let text = '';
    while (value >= 32) { text += String.fromCharCode((32 | (value & 31)) + 63); value >>>= 5; }
    return text + String.fromCharCode(value + 63);
  };
  for (const point of path) {
    const nextLat = Math.round(point.lat * 1e5), nextLng = Math.round(point.lng * 1e5);
    result += encode(nextLat - lat) + encode(nextLng - lng); lat = nextLat; lng = nextLng;
  }
  return result;
}
export function getWalkPath(post: Pick<WalkRealRoutePost, 'encodedPolyline' | 'pathGeo'>): Point[] {
  if (!post.encodedPolyline) return post.pathGeo;
  try {
    const encoded = post.encodedPolyline;
    let index = 0, lat = 0, lng = 0;
    const path: Point[] = [];
    const read = () => {
      let result = 0, shift = 0, value: number;
      do {
        if (index >= encoded.length || shift > 30) throw new Error('Invalid polyline');
        value = encoded.charCodeAt(index++) - 63;
        if (value < 0 || value > 63) throw new Error('Invalid polyline');
        result |= (value & 31) << shift; shift += 5;
      } while (value >= 32);
      return result & 1 ? ~(result >> 1) : result >> 1;
    };
    while (index < encoded.length) { lat += read(); lng += read(); path.push({ lat: lat / 1e5, lng: lng / 1e5 }); }
    return path.length >= 2 ? path : post.pathGeo;
  } catch { return post.pathGeo; }
}

// Representative photos need not include the start/end of the recorded walk.
export function getSanpoRouteStops(post: WalkRealRoutePost) {
  const photos = post.snaps.map(s => ({ name: s.spotName, lat: s.lat, lng: s.lng, reason: s.caption }));
  const points = post.photoPoints;
  if (!points || points.length < 2) return photos;
  const same = (a: Point, b: Point) => Math.abs(a.lat - b.lat) < 0.000001 && Math.abs(a.lng - b.lng) < 0.000001;
  const first = points[0], last = points[points.length - 1];
  if (!photos.length || !same(photos[0], first)) photos.unshift({ ...first, name: "散歩の出発地点", reason: "最初の撮影地点" });
  if (!same(photos[photos.length - 1], last)) photos.push({ ...last, name: "散歩の到着地点", reason: "最後の撮影地点" });
  return photos;
}
