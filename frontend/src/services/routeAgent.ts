import { formatDuration, ROUTE_MODES } from "@/data/complexRoutes";
import {
  ComputedRoute,
  RouteApiResponse,
  RouteCandidate,
  RouteMetrics,
  RouteModeId,
  RouteSegment,
  SegmentColor,
} from "@/types/route";

const GOOGLE_COLORS: SegmentColor[] = ["#4285F4", "#34A853", "#FBBC05", "#EA4335"];

export class RouteApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "RouteApiError";
  }
}

async function routeApiErrorFromResponse(response: Response): Promise<RouteApiError> {
  let message = "徒歩ルートを計算できませんでした。出発地と目的地を確認してください。";
  try {
    const payload = await response.json();
    if (typeof payload?.detail === "string") message = payload.detail;
    else if (Array.isArray(payload?.detail)) {
      const firstMessage = payload.detail.find((item: unknown) =>
        typeof item === "object" && item !== null && typeof (item as { msg?: unknown }).msg === "string"
      ) as { msg: string } | undefined;
      if (firstMessage) message = firstMessage.msg;
    }
    else if (typeof payload?.message === "string") message = payload.message;
  } catch {
    // Use a safe fallback when the server did not return JSON.
  }
  return new RouteApiError(response.status, message);
}

function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;
  return 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}

function bearingDeg(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function toVectorXY(pt: { lat: number; lng: number }): [number, number] {
  const x = Math.round(((pt.lng - 137.200) / 0.028) * 1000);
  const y = Math.round(((36.712 - pt.lat) / 0.030) * 620);
  return [x, y];
}

// バックエンドの RouteCandidate を UI 用の ComputedRoute に変換するアダプター
export function convertCandidateToComputedRoute(
  candidate: RouteCandidate,
  index: number = 0,
  baseline: RouteMetrics | null = null
): ComputedRoute {
  const mins = Math.max(1, Math.round(candidate.metrics.duration_seconds / 60));
  const totalKmNum = Number((candidate.metrics.distance_meters / 1000).toFixed(1));
  const km = totalKmNum.toFixed(1);
  const elev = Math.round(candidate.metrics.elevation_gain_meters);

  // path または waypoints からターンバイターン案内用セグメントを構築
  const segments: RouteSegment[] = [];
  const waypoints = candidate.waypoints || [];
  const path = candidate.metrics.path || [];
  const rawInstructions = (candidate.metrics.navigation_instructions || [])
    .map((inst) => inst.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  if (path.length >= 2) {
    // ポリラインから主要な曲がり角（角度変化 >= 24° かつ区間距離 >= 45m、または長距離区間 >= 280m）を抽出
    const anchorIndices: number[] = [0];
    let accDist = 0;
    let prevBearing: number | null = null;

    for (let i = 1; i < path.length - 1; i++) {
      const stepDist = haversineMeters(path[i - 1], path[i]);
      accDist += stepDist;
      const curBearing = bearingDeg(path[i], path[i + 1]);

      if (prevBearing === null && stepDist > 3) {
        prevBearing = bearingDeg(path[i - 1], path[i]);
      }

      let angleDiff = 0;
      if (prevBearing !== null) {
        angleDiff = Math.abs(curBearing - prevBearing);
        if (angleDiff > 180) angleDiff = 360 - angleDiff;
      }

      // 中継地点（waypointsの途中スポット）の近くを通過する場合は必ず区切る
      const nearIntermediateWp = waypoints.slice(1, -1).some(
        (wp) => haversineMeters(path[i], wp) <= 30
      );

      if (
        (accDist >= 45 && angleDiff >= 24) ||
        accDist >= 260 ||
        (accDist >= 30 && nearIntermediateWp)
      ) {
        anchorIndices.push(i);
        accDist = 0;
        prevBearing = curBearing;
      } else if (stepDist > 5) {
        prevBearing = curBearing;
      }
    }

    if (anchorIndices[anchorIndices.length - 1] !== path.length - 1) {
      // 末尾区間が極端に短ければ直前アンカーを置き換え
      if (
        anchorIndices.length > 1 &&
        haversineMeters(path[anchorIndices[anchorIndices.length - 1]], path[path.length - 1]) < 20
      ) {
        anchorIndices[anchorIndices.length - 1] = path.length - 1;
      } else {
        anchorIndices.push(path.length - 1);
      }
    }

    // 最大12ステップ程度に抑えて案内しやすくする
    const finalAnchors: number[] =
      anchorIndices.length > 13
        ? [
            0,
            ...Array.from({ length: 10 }, (_, k) =>
              anchorIndices[Math.max(1, Math.round(((k + 1) * (anchorIndices.length - 1)) / 11))]
            ),
            path.length - 1,
          ].filter((v, idx, arr) => idx === 0 || v > arr[idx - 1])
        : anchorIndices;

    const segCount = finalAnchors.length - 1;
    for (let s = 0; s < segCount; s++) {
      const fromPt = path[finalAnchors[s]];
      const toPt = path[finalAnchors[s + 1]];
      let segMeters = 0;
      for (let p = finalAnchors[s]; p < finalAnchors[s + 1]; p++) {
        segMeters += haversineMeters(path[p], path[p + 1]);
      }

      // ラベル決定: 近傍の経由地名 または navigation_instructions または 最終目的地
      const matchedWp = waypoints.slice(1, -1).find((wp) => haversineMeters(toPt, wp) <= 65);
      const instIdx =
        rawInstructions.length > 0
          ? Math.min(rawInstructions.length - 1, Math.floor((s * rawInstructions.length) / segCount))
          : -1;
      const instText = instIdx >= 0 ? rawInstructions[instIdx] : "";

      let label = "";
      if (s === segCount - 1 && waypoints.length > 0) {
        const lastWp = waypoints[waypoints.length - 1];
        label = instText ? `${instText}（${lastWp.name}へ）` : `${lastWp.name}へ到着`;
      } else if (matchedWp) {
        label = `${matchedWp.name}付近（${matchedWp.reason || "経由スポット"}）`;
      } else if (instText) {
        label = instText;
      } else if (waypoints.length >= 2) {
        const wpIdx = Math.min(waypoints.length - 1, Math.max(1, Math.ceil(((s + 1) * (waypoints.length - 1)) / segCount)));
        label = waypoints[wpIdx].reason || waypoints[wpIdx].name || `ステップ ${s + 1}`;
      } else {
        label = `ステップ ${s + 1}`;
      }

      segments.push({
        from: toVectorXY(fromPt),
        to: toVectorXY(toPt),
        fromGeo: { lat: fromPt.lat, lng: fromPt.lng },
        toGeo: { lat: toPt.lat, lng: toPt.lng },
        color: GOOGLE_COLORS[s % GOOGLE_COLORS.length],
        label,
        distanceM: Math.max(10, Math.round(segMeters)),
      });
    }
  } else if (waypoints.length >= 2) {
    for (let i = 0; i < waypoints.length - 1; i++) {
      const fromWp = waypoints[i];
      const toWp = waypoints[i + 1];
      const color = GOOGLE_COLORS[i % GOOGLE_COLORS.length];
      const label = toWp.reason || toWp.name || `区間 ${i + 1}`;
      const distM = Math.max(
        20,
        Math.round(
          haversineMeters(fromWp, toWp) ||
            candidate.metrics.distance_meters / Math.max(1, waypoints.length - 1)
        )
      );

      segments.push({
        from: toVectorXY(fromWp),
        to: toVectorXY(toWp),
        fromGeo: { lat: fromWp.lat, lng: fromWp.lng },
        toGeo: { lat: toWp.lat, lng: toWp.lng },
        color,
        label,
        distanceM: distM,
      });
    }
  }

  // デフォルトフォールバックセグメント
  if (segments.length === 0) {
    segments.push(...ROUTE_MODES.hybrid.segments);
  }

  // プロファイルはElevation APIの実測値のみ表示する。未計測値を補間・捏造しない。
  const elevProfile = candidate.metrics.elevation_profile_meters ?? [];
  const baseElevProfile = baseline?.elevation_profile_meters ?? [];
  const baseElev = baseline ? Math.round(baseline.elevation_gain_meters) : null;
  const descent = Math.round(candidate.metrics.elevation_loss_meters ?? 0);

  const badgeColor: SegmentColor = GOOGLE_COLORS[index % GOOGLE_COLORS.length];
  const summaryBadge = candidate.tags.slice(0, 3).join("・") || candidate.title;

  const id: RouteModeId = "hybrid";

  return {
    id,
    modeLabel: candidate.title || `案${index + 1}`,
    durationText: formatDuration(mins),
    totalMinutes: mins,
    distanceText: `${km}km`,
    totalKm: totalKmNum,
    summaryBadge,
    badgeColor,
    slopeSaveLabel: elevProfile.length ? "標高API実測" : "標高未計測",
    oldElevText: baseElev !== null ? `登り${baseElev}m` : "比較なし",
    newElevText: elevProfile.length ? `登り${elev}m・下り${descent}m` : "未計測",
    callout: {
      x: 472,
      y: 180,
      text: candidate.title,
      dotColor: badgeColor,
    },
    altPath: ROUTE_MODES.hybrid.altPath,
    segments,
    elevProfile,
    baseElevProfile,
    apiData: candidate,
    baseline,
  };
}

export interface ThinkingProgressEvent {
  stage: string;
  label: string;
}

// バックエンド API (/api/route/stream または /api/route) の呼び出し
export async function fetchDynamicRoute(params: {
  prompt: string;
  origin?: string;
  destination?: string;
  rerouteOnly?: boolean;
  originLocation?: { lat: number; lng: number } | null;
  destinationLocation?: { lat: number; lng: number } | null;
  waypoints?: string[];
  loopMinutes?: number;
  waypointLocations?: ({ lat: number; lng: number } | null)[];
  waypointsExplicit?: boolean;
  contextOverride?: Record<string, string>;
  currentLocation?: { lat: number; lng: number } | null;
  avoidSpots?: string[];
  language?: string;
  customSystemPrompt?: string | null;
  previousUserPrompt?: string | null;
  previousRouteSummary?: string | null;
  signal?: AbortSignal;
  onProgress?: (event: ThinkingProgressEvent) => void;
}): Promise<{
  response: RouteApiResponse;
  origin: string;
  destination: string;
  routes: ComputedRoute[];
}> {
  const apiUrl =
    (import.meta as unknown as { env?: Record<string, string> }).env
      ?.VITE_BACKEND_URL || "";

  const isLoopQuery =
    (params.origin && params.destination && params.origin === params.destination) ||
    /(周回|ループ|一周|おまかせ|散歩コース)/.test(params.prompt);

  const payload = {
    prompt: params.prompt,
    loop_minutes: params.loopMinutes ?? null,
    reroute_only: params.rerouteOnly ?? false,
    origin_location: params.originLocation ?? null,
    origin: params.origin || null,
    destination: params.destination || null,
    destination_location: params.destinationLocation || null,
    waypoints: params.waypoints || [],
    waypoints_explicit: params.waypointsExplicit ?? false,
    waypoint_locations: params.waypointLocations || [],
    current_location: params.currentLocation || null,
    context_override: params.contextOverride || null,
    route_count: isLoopQuery ? 4 : 3,
    avoid_spots: params.avoidSpots || [],
    language: params.language || "ja",
    custom_system_prompt: params.customSystemPrompt || null,
    previous_user_prompt: params.previousUserPrompt || null,
    previous_route_summary: params.previousRouteSummary || null,
  };

  // 1. まずリアルタイム思考同期ストリーミング (/api/route/stream) を試行
  try {
    const streamRes = await fetch(`${apiUrl}/api/route/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: params.signal,
    });

    if (!streamRes.ok && streamRes.status >= 400 && streamRes.status < 500 && streamRes.status !== 404) {
      throw await routeApiErrorFromResponse(streamRes);
    }

    if (streamRes.ok && streamRes.body) {
      const reader = streamRes.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finalData: RouteApiResponse | null = null;

      while (true) {
        if (params.signal?.aborted) {
          try {
            await reader.cancel();
          } catch {
            // ignore
          }
          throw new DOMException("Aborted", "AbortError");
        }

        const { done, value } = await reader.read();
        if (done) {
          if (buffer.trim()) {
            const remainingBlocks = buffer.split("\n\n");
            for (const block of remainingBlocks) {
              if (!block.trim()) continue;
              let eventType = "message";
              let dataStr = "";
              for (const line of block.split("\n")) {
                if (line.startsWith("event: ")) eventType = line.slice(7).trim();
                else if (line.startsWith("data: ")) dataStr = line.slice(6).trim();
              }
              if (dataStr && eventType === "error") {
                const parsed = JSON.parse(dataStr);
                throw new RouteApiError(parsed.status || 422, parsed.message || "この条件では徒歩ルートを作成できませんでした.");
              }
              if (dataStr && eventType === "complete") {
                try {
                  finalData = JSON.parse(dataStr) as RouteApiResponse;
                } catch (err) {
                  if (err instanceof RouteApiError) throw err;
                  console.warn("Failed to parse SSE chunk:", err);
                }
              }
            }
          }
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const blocks = buffer.split("\n\n");
        buffer = blocks.pop() || "";

        for (const block of blocks) {
          if (!block.trim()) continue;

          let eventType = "message";
          let dataStr = "";

          for (const line of block.split("\n")) {
            if (line.startsWith("event: ")) eventType = line.slice(7).trim();
            else if (line.startsWith("data: ")) dataStr = line.slice(6).trim();
          }

          if (dataStr) {
            try {
              const parsed = JSON.parse(dataStr);
              if (eventType === "progress" && params.onProgress) {
                params.onProgress(parsed);
              } else if (eventType === "error") {
                throw new RouteApiError(parsed.status || 422, parsed.message || "この条件では徒歩ルートを作成できませんでした。");
              } else if (eventType === "complete") {
                finalData = parsed as RouteApiResponse;
                try {
                  await reader.cancel();
                } catch {
                  // ignore
                }
                break;
              }
            } catch (err) {
              if (err instanceof RouteApiError) throw err;
              console.warn("Failed to parse SSE chunk:", err);
            }
          }
        }

        if (finalData) {
          break;
        }
      }

      if (finalData) {
        const computedRoutes = finalData.routes.map((candidate, idx) =>
          convertCandidateToComputedRoute(candidate, idx, finalData!.baseline)
        );
        return {
          response: finalData,
          origin: finalData.origin_query || params.origin || "出発地",
          destination: finalData.destination_query || params.destination || "目的地",
          routes: computedRoutes,
        };
      }
    }
  } catch (streamErr: any) {
    if (params.signal?.aborted || streamErr?.name === "AbortError" || streamErr instanceof RouteApiError) {
      throw streamErr;
    }
    console.info("Streaming route endpoint not available, falling back to standard POST /api/route:", streamErr);
  }

  if (params.signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }

  // 2. フォールバック: 標準の POST /api/route
  const res = await fetch(`${apiUrl}/api/route`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: params.signal,
  });

  if (!res.ok) throw await routeApiErrorFromResponse(res);

  const data: RouteApiResponse = await res.json();
  const computedRoutes = data.routes.map((candidate, idx) =>
    convertCandidateToComputedRoute(candidate, idx, data.baseline)
  );

  return {
    response: data,
    origin: data.origin_query || params.origin || "出発地",
    destination: data.destination_query || params.destination || "目的地",
    routes: computedRoutes,
  };
}

// 既存のローカルオフライン推論（API接続エラー時やオフライン時のフォールバック用）
export function inferRouteModeFromPrompt(
  prompt: string,
  currentOrigin: string,
  currentDest: string
): {
  mode: RouteModeId;
  origin: string;
  destination: string;
  route: ComputedRoute;
} {
  const q = prompt.trim();
  let origin = currentOrigin;
  let destination = currentDest;

  const fromTo = q.match(/(.+?)から(.+?)(?:まで|へ|に|行)/);
  if (fromTo && !q.includes("「")) {
    const o = fromTo[1].replace(/^[、。・\s]+/, "").trim();
    const d = fromTo[2].replace(/[、。・\s]+$/, "").trim();
    if (o.length >= 2 && o.length <= 15) origin = o;
    if (d.length >= 2 && d.length <= 15) destination = d;
  }

  let mode: RouteModeId = "flat";
  const hasRain = /(雨|濡|傘|地下|屋根|豪雨)/.test(q);
  const hasFast = /(最短|急|早|直進|すぐ)/.test(q);

  if (hasRain) {
    mode = "rain";
  } else if (hasFast) {
    mode = "fast";
  } else {
    mode = "flat";
  }

  return {
    mode,
    origin,
    destination,
    route: ROUTE_MODES[mode],
  };
}
