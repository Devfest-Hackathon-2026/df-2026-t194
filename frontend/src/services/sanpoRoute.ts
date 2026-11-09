export interface PhotoWalkingRoute {
  distance_meters: number;
  duration_seconds: number;
  encoded_polyline: string;
  path: Array<{ lat: number; lng: number }>;
}

export async function buildPhotoWalkingRoute(
  points: Array<{ lat: number; lng: number }>
): Promise<PhotoWalkingRoute> {
  const apiUrl = import.meta.env.VITE_BACKEND_URL || "";
  const response = await fetch(`${apiUrl}/api/sanpo/route`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ points, language: "ja" }),
  });
  if (!response.ok) {
    let message = "写真地点を結ぶ徒歩ルートを作成できませんでした。";
    try {
      const payload = await response.json();
      if (typeof payload.detail === "string") message = payload.detail;
    } catch {
      // Keep the user-facing fallback message for non-JSON proxy errors.
    }
    throw new Error(message);
  }
  return response.json() as Promise<PhotoWalkingRoute>;
}
