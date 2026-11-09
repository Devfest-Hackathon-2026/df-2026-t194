import type { WalkRealRoutePost } from "@/types/walkreal";

// Firestore arrays cannot contain arrays. Keep the UI's tuple format at the
// boundary and store each vector point as a map instead.
export type StoredSanpoPost = Omit<WalkRealRoutePost, "pathXY"> & {
  pathXY: Array<{ x: number; y: number }>;
  serverCreatedAt: string;
};

export function serializeSanpoPost(post: WalkRealRoutePost, createdAt: string): StoredSanpoPost {
  return {
    ...post,
    pathXY: post.pathXY.map(([x, y]) => ({ x, y })),
    serverCreatedAt: createdAt,
  };
}

export function deserializeSanpoPost(data: Record<string, unknown>, id: string): WalkRealRoutePost {
  if (!Array.isArray(data.pathXY)) throw new Error("共有ルートの座標データが不正です。");
  const pathXY: [number, number][] = data.pathXY.map((point: unknown) => {
    // Also accept tuples from older local exports.
    const x = Array.isArray(point) ? point[0] : (point as { x?: unknown } | null)?.x;
    const y = Array.isArray(point) ? point[1] : (point as { y?: unknown } | null)?.y;
    if (typeof x !== "number" || typeof y !== "number" || !Number.isFinite(x) || !Number.isFinite(y)) {
      throw new Error("共有ルートの座標データが不正です。");
    }
    return [x, y];
  });
  const toMillis = (value: unknown): number | undefined => {
    if (value && typeof (value as { toMillis?: unknown }).toMillis === "function") return (value as { toMillis(): number }).toMillis();
    return undefined;
  };
  const createdAtMs = toMillis(data.createdAt) ?? Date.parse(String(data.serverCreatedAt ?? ""));
  const expiresAtMs = toMillis(data.expiresAt) ?? (Number.isFinite(createdAtMs) ? createdAtMs + 14 * 86400000 : 0);
  const age = Math.max(0, Date.now() - createdAtMs);
  const days = Math.max(0, Math.ceil((expiresAtMs - Date.now()) / 86400000));
  return { ...data, id, pathXY, createdAtMs, expiresAtMs, updatedAtMs: toMillis(data.updatedAt),
    synced: true, likedByMe: false, walkedByMe: false, walkedThisWeek: 0,
    daysElapsed: Math.floor(age / 86400000), ttlDaysRemaining: days, isExpiringSoon: days <= 3,
    createdAtLabel: age < 3600000 ? `${Math.floor(age / 60000)}分前` : age < 86400000 ? `${Math.floor(age / 3600000)}時間前` : `${Math.floor(age / 86400000)}日前`,
  } as WalkRealRoutePost;
}
