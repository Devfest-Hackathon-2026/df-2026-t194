import type { PlaceStop, LatLng } from '@/types/route';

export function retainVerifiedStops(
  entries: { name: string; location: LatLng | null }[],
  stops: PlaceStop[],
): { name: string; location: LatLng | null }[] {
  const result = [...entries];
  const names = new Set(entries.map(entry => entry.name.trim().toLowerCase()));
  for (const stop of stops) {
    if (!stop.place_verified || names.has(stop.name.trim().toLowerCase())) continue;
    result.push({ name: stop.name, location: { lat: stop.lat, lng: stop.lng } });
    names.add(stop.name.trim().toLowerCase());
  }
  return result;
}

export function loopOrigin(prompt: string, fallback: string): string {
  const match = prompt.normalize('NFKC').match(/(?:^|[。\n])\s*([^、。\n]+?)(?:から|発で|発の)/);
  return match?.[1].trim() || fallback.trim() || '現在地';
}
