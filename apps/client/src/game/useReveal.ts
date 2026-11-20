/**
 * Timeline of the end-of-game reveal (T-NEW-25): cards drop in one at a time (lowest score first, so the
 * winner lands last), a longer hush, then the totals slam in one at a time (winner last), then `done`.
 * Reduced motion (or `instant`) skips straight to `done`. `skip()` completes at once. Pure timers, no DOM.
 */
import type { ViewMessage } from "@cd/protocol";
import { useEffect, useRef, useState } from "preact/hooks";

export const FIRST_DROP_MS = 700;
export const DROP_GAP_MS = 900;
export const HUSH_MS = 1800;
export const TOTAL_GAP_MS = 600;
export const SETTLE_MS = 1100;

export type RevealPhase = "drop" | "hush" | "totals" | "done";
export interface RevealState {
  /** Cards dropped so far (0..count). */
  dropped: number;
  /** Totals slammed so far (0..count). */
  totals: number;
  phase: RevealPhase;
}

/** Wall-clock offsets (ms from mount) of each step; also used by tests. */
export function revealSchedule(count: number) {
  const drops = Array.from({ length: count }, (_, i) => FIRST_DROP_MS + i * DROP_GAP_MS);
  const hushAt = (drops[count - 1] ?? 0) + 500;
  const totalsAt = Array.from(
    { length: count },
    (_, i) => (drops[count - 1] ?? 0) + DROP_GAP_MS + HUSH_MS + i * TOTAL_GAP_MS,
  );
  const doneAt = (totalsAt[count - 1] ?? 0) + SETTLE_MS;
  return { drops, hushAt, totalsAt, doneAt };
}

export function useReveal(
  count: number,
  instant: boolean,
  on: { drop?: (i: number) => void; hush?: () => void; total?: (i: number) => void } = {},
): RevealState & { skip: () => void } {
  const [s, setS] = useState<RevealState>(() =>
    instant
      ? { dropped: count, totals: count, phase: "done" }
      : { dropped: 0, totals: 0, phase: "drop" },
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
    const { drops, hushAt, totalsAt, doneAt } = revealSchedule(count);
    const at = (ms: number, fn: () => void) => {
      timers.current.push(setTimeout(fn, ms));
    };
    drops.forEach((ms, i) => {
      at(ms, () => {
        cb.current.drop?.(i);
        setS((p) => ({ ...p, dropped: i + 1 }));
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
    at(doneAt, () => setS({ dropped: count, totals: count, phase: "done" }));
    return clear;
  }, [count, instant]);
  const skip = () => {
    clear();
    setS({ dropped: count, totals: count, phase: "done" });
  };
  return { ...s, skip };
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
