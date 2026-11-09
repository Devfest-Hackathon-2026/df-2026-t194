"use client";

import { useEffect, useState } from "react";

/* ─────────────────────────────────────────────────────────
 * LOADING STATE — pixel-grid loader for long-running work
 *
 * Variants:
 *   Drive  — square cells, chevron wavefront driving right;
 *            the 650ms cycle is shorter than the sweep, so
 *            two fronts are always in flight
 *   Dots   — same wavefront, circular cells
 *   Orbit  — a comet lapping the grid perimeter
 *   Surfer — the Drive loader paired with a meme video below
 *
 * Paired with a shimmering label and a live elapsed timer
 * in mono tabular figures. Reduced motion freezes the grid
 * to its dim state; the timer still ticks.
 * ───────────────────────────────────────────────────────── */

export interface LoadingStage {
  afterSeconds: number;
  label: string;
}

const chevron = Array.from({ length: 9 }, (_, i) => {
  const r = Math.floor(i / 3), c = i % 3;
  return (c + Math.abs(r - 1)) * 90;
});

const ORBIT_ORDER = [0, 1, 2, 5, 8, 7, 6, 3];
const orbit = Array.from({ length: 9 }, (_, i) => {
  const k = ORBIT_ORDER.indexOf(i);
  return k === -1 ? null : k * 110;
});

const PATTERNS: Record<string, { delays: (number | null)[]; dur: number; round: boolean }> = {
  Drive: { delays: chevron, dur: 650, round: false },
  Dots: { delays: chevron, dur: 650, round: true },
  Orbit: { delays: orbit, dur: 950, round: false },
};

function LoaderGrid({
  delays,
  dur,
  round,
}: {
  delays: (number | null)[];
  dur: number;
  round: boolean;
}) {
  return (
    <span aria-hidden className="grid shrink-0 grid-cols-[repeat(3,4px)] gap-[1.5px]">
      {delays.map((delay, index) => (
        <span
          key={index}
          className={`size-[4px] bg-ink ${round ? "rounded-full" : "rounded-[1px]"}`}
          style={{
            opacity: delay === null ? 0.07 : 0.15,
            animation: delay === null ? "none" : `pixel-on ${dur}ms ease-in-out ${delay}ms infinite`,
          }}
        />
      ))}
    </span>
  );
}

function useElapsed() {
  const [ds, setDs] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setDs((d) => d + 1), 100);
    return () => clearInterval(t);
  }, []);
  const total = ds / 10;
  const formatted = total < 60 ? `${total.toFixed(1)}s` : `${Math.floor(total / 60)}m ${(total % 60).toFixed(1)}s`;
  return { seconds: total, formatted };
}

export default function LoadingState({
  label,
  stages,
  variant = "Drive",
  /** the meme feed for the Surfer variant; hosted on Vercel Blob so it plays in
   *  production (the local /public/subway-surfers.mp4 stays gitignored).
   *  Heavily compressed (288px, 20fps, no audio → ~265 KB, from 1.1 MB) to keep
   *  Blob data transfer down. */
  videoSrc = "https://95dnc2a95qgwt9ff.public.blob.vercel-storage.com/subway-surfers-min.mp4",
  className,
}: {
  label?: string;
  stages?: LoadingStage[];
  variant?: string;
  videoSrc?: string;
  className?: string;
}) {
  const { seconds, formatted: elapsed } = useElapsed();
  const surfer = variant === "Surfer";

  // 多段階ステージが指定されている場合、経過秒数に応じてラベルを自動切り替え
  const currentStageLabel = stages && stages.length > 0
    ? [...stages].reverse().find((s) => seconds >= s.afterSeconds)?.label ?? stages[0].label
    : undefined;

  const resolvedLabel = label ?? currentStageLabel ?? (surfer ? "Subway surfing" : "Churning");
  const [videoOk, setVideoOk] = useState(true);
  const { delays, dur, round } = PATTERNS[variant] ?? PATTERNS.Drive;

  const labelEl = (
    <span
      className="bg-clip-text text-sm text-transparent truncate max-w-[200px] sm:max-w-[260px]"
      style={{
        backgroundImage:
          "linear-gradient(90deg, var(--ink-3) 35%, var(--ink) 50%, var(--ink-3) 65%)",
        backgroundSize: "200% 100%",
        animation: "shimmer-text 1.4s linear infinite",
      }}
      title={resolvedLabel}
    >
      {resolvedLabel}
    </span>
  );
  const elapsedEl = <span className="font-mono text-[11px] sm:text-[12px] text-ink-3 tabular-nums shrink-0">{elapsed}</span>;

  if (surfer) {
    return (
      <div role="status" className={`relative flex w-full items-center ${className ?? ""}`}>
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <LoaderGrid {...PATTERNS.Drive} />
          {labelEl}
          {elapsedEl}
        </div>

        {/* the context card follows the status text it is illustrating - positioned above search bar */}
        <div
          className="absolute bottom-full mb-3 left-0 w-60 sm:w-64 overflow-hidden rounded-[12px] shadow-2xl border border-zinc-200/80 dark:border-zinc-800 z-50 pointer-events-auto"
          style={{ animation: "pop-in 200ms cubic-bezier(0.16,1,0.3,1) both", transformOrigin: "bottom left" }}
        >
          <div className="relative aspect-video w-full" style={{ background: "var(--tooltip-bg)" }}>
            {videoOk ? (
              <video
                src={videoSrc}
                autoPlay
                muted
                loop
                playsInline
                onError={() => setVideoOk(false)}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center gap-1.5">
                <LoaderGrid {...PATTERNS.Drive} />
                <span className="px-3 text-center font-mono text-[10px]" style={{ color: "var(--tooltip-muted)" }}>
                  Video unavailable
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div role="status" className={`flex w-full items-center gap-2.5 min-w-0 ${className ?? ""}`}>
      <LoaderGrid delays={delays} dur={dur} round={round} />
      {labelEl}
      {elapsedEl}
    </div>
  );
}

export { LoadingState };
