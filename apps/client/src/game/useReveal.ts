/**
 * Timeline of the end-of-game reveal (T-NEW-28): every player's card is on screen from the start; the
 * scores drop in one colour at a time for ALL players at once (red, yellow, green, blue), then the
 * penalties, then a longer pause, then the totals slam in one at a time (winner last), then `done`.
 * Reduced motion (or `instant`) completes straight away. Pure timers, no DOM.
 */
import type { ViewMessage } from "@cd/protocol";
import { useEffect, useRef, useState } from "preact/hooks";

/** Steps before the totals: 4 colours, then penalties. */
export const STEPS = 5;
export const FIRST_STEP_MS = 700;
/** Delay between one colour (or the penalties) and the next. */
export const STEP_GAP_MS = 1300;
/** Extra per-player delay inside one step (applied in CSS; the state flips for everyone at once). */
export const PLAYER_STAGGER_MS = 100;
/** Pause after the penalties before the totals (longer than STEP_GAP_MS). */
export const HUSH_MS = 2800;
export const TOTAL_GAP_MS = 600;
export const SETTLE_MS = 1100;

export type RevealPhase = "drop" | "hush" | "totals" | "done";
export interface RevealState {
  /** Steps shown so far (0..STEPS): 1 = red, 2 = yellow, 3 = green, 4 = blue, 5 = penalties. */
  step: number;
  /** Totals slammed so far (0..count). */
  totals: number;
  phase: RevealPhase;
}

/** Wall-clock offsets (ms from mount) of each step; also used by tests. */
export function revealSchedule(count: number) {
  const steps = Array.from({ length: STEPS }, (_, i) => FIRST_STEP_MS + i * STEP_GAP_MS);
  const lastStep = steps[STEPS - 1] as number;
  const hushAt = lastStep + 500;
  const totalsAt = Array.from({ length: count }, (_, i) => lastStep + HUSH_MS + i * TOTAL_GAP_MS);
  const doneAt = (totalsAt[count - 1] ?? lastStep) + SETTLE_MS;
  return { steps, hushAt, totalsAt, doneAt };
}

export function useReveal(
  count: number,
  instant: boolean,
  on: { drop?: (step: number) => void; hush?: () => void; total?: (i: number) => void } = {},
): RevealState {
  const full: RevealState = { step: STEPS, totals: count, phase: "done" };
  const [s, setS] = useState<RevealState>(() =>
    instant ? full : { step: 0, totals: 0, phase: "drop" },
  );
  const cb = useRef(on);
  cb.current = on;
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const clear = () => {
    for (const id of timers.current) clearTimeout(id);
    timers.current = [];
  };
  useEffect(() => {
    if (instant) return;
    const { steps, hushAt, totalsAt, doneAt } = revealSchedule(count);
    const at = (ms: number, fn: () => void) => {
      timers.current.push(setTimeout(fn, ms));
    };
    steps.forEach((ms, i) => {
      at(ms, () => {
        cb.current.drop?.(i);
        setS((p) => ({ ...p, step: i + 1 }));
      });
    });
    at(hushAt, () => {
      cb.current.hush?.();
      setS((p) => ({ ...p, phase: "hush" }));
    });
    totalsAt.forEach((ms, i) => {
      at(ms, () => {
        cb.current.total?.(i);
        setS((p) => ({ ...p, totals: i + 1, phase: "totals" }));
      });
    });
    at(doneAt, () => setS({ step: STEPS, totals: count, phase: "done" }));
    return clear;
  }, [count, instant]);
  return s;
}

/** Room code + game number (the seat records sum to the finished games), so a rematch plays again. */
export function celebrationKey(view: ViewMessage): string {
  const rec = (view.seats.find((s) => s.seatId === view.you.seatId) ?? view.seats[0])?.record;
  return [view.code, rec ? rec.wins + rec.ties + rec.losses : 0].join(":");
}

const claimed = new Set<string>();

/** True the first time a game is claimed (also across a reload, via sessionStorage). */
export function claimCelebration(key: string): boolean {
  if (claimed.has(key)) return false;
  claimed.add(key);
  try {
    const k = `cd:cel:${key}`;
    if (sessionStorage.getItem(k)) return false;
    sessionStorage.setItem(k, "1");
  } catch {
    // No storage: the in-memory set still dedupes reconnects.
  }
  return true;
}

export function _resetCelebrationForTests(): void {
  claimed.clear();
}
