interface RoutePin { name: string; lat: number; lng: number }
export function buildRoutePinEdit(pins: RoutePin[], index: number, position: { lat: number; lng: number }) {
  if (pins.length < 2 || index < 0 || index >= pins.length ||
      !Number.isFinite(position.lat) || !Number.isFinite(position.lng) ||
      Math.abs(position.lat) > 90 || Math.abs(position.lng) > 180) {
    throw new Error('ピンの移動先を確認してください。');
  }
  const updated = pins.map((pin, i) => i === index
    ? { ...pin, ...position, name: `${position.lat.toFixed(6)}, ${position.lng.toFixed(6)}` }
    : { ...pin });
  const first = updated[0], last = updated[updated.length - 1];
  return {
    origin: first.name, originLocation: { lat: first.lat, lng: first.lng },
    destination: last.name, destinationLocation: { lat: last.lat, lng: last.lng },
    waypoints: updated.slice(1, -1).map(pin => pin.name),
    waypointLocations: updated.slice(1, -1).map(pin => ({ lat: pin.lat, lng: pin.lng })),
  };
}
