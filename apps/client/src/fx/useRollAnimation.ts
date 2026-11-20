/**
 * Drives the dice phases (H4): idle → (shaking) → tumbling → settling → settled.
 * - Optimistic: a throw tumbles at once, before the server answers.
 * - The tumble lasts at least `minTumble` ms, however fast the result arrives.
 * - Each (code, turn) roll animates once per page load; first render / resync / hidden tab
 *   shows it settled with no animation.
 * - Reduced motion: no tumble; the result shows within 150 ms (CSS cross-fade).
 * - Gameplay (D-L9): dice land one at a time, left to right, `GAMEPLAY_TIMING.landGap` apart;
 *   `skip()` (tap on the tray) jumps to the end. Only the local display waits: the server
 *   view is applied at once.
 */
import { useEffect, useRef, useState } from "preact/hooks";
import { BOUNCE_MS } from "./dice-math";
import { reducedMotion } from "./motion";

export type RollPhase = "idle" | "shaking" | "tumbling" | "settling" | "settled";

const SETTLE_MS = 350;

/** Tuned in the Dice Lab. */
export const ROLL_TIMING = Object.freeze({
  minTumble: 550,
  settle: SETTLE_MS,
  stagger: 70,
  /** First contact inside the settle: the short bounce (≤ 120 ms, K3.1) follows it. */
  landAt: SETTLE_MS - BOUNCE_MS,
  slowAfter: 3000,
  /** No result and no error after this long: ease back so the tray never spins forever. */
  giveUpAfter: 10000,
  easeBack: 300,
  reducedFade: 150,
});

/**
 * Gameplay reveal (D-L9): 400 ms between landings. Kept apart from `ROLL_TIMING` (shared with
 * the roll-off and turn summary, whose 70 ms stagger is unchanged).
 */
export const GAMEPLAY_TIMING = Object.freeze({ landGap: 400 });

export interface RollLike {
  white: readonly number[];
  colored: Partial<Record<string, number>>;
}

export interface RollAnimInput {
  code: string;
  turnNumber: number | null;
  roll: RollLike | null;
  /** True when this view came from a reconnect / first load: never animate it. */
  resync?: boolean;
}

export interface RollAnimOptions {
  /** Each die's landing moment, in tray order of present dice (sound + haptic). */
  onDieLand?: (index: number) => void;
  /** After the last die (sum badge, legal glow). Only for live, animated rolls. */
  onLanded?: () => void;
}

export interface RollAnimation {
  phase: RollPhase;
  /** Tumbling for more than 3 s ("Rolling…"). */
  slow: boolean;
  /** Increments on every live landing (drives the badge pop). */
  landings: number;
  /** While settling: how many present dice (tray order) have landed so far. */
  landed: number;
  shake(): void;
  cancelShake(): void;
  throwDice(): void;
  /** The roll request failed: ease back to the previous faces. */
  cancelThrow(): void;
  /** Jump to the end of a live landing sequence (all dice landed, `onLanded` fires). */
  skip(): void;
}

const played = new Set<string>();

export function rollKey(code: string, turnNumber: number | null, hasRoll: boolean): string | null {
  return hasRoll && turnNumber !== null ? `${code}:${turnNumber}` : null;
}

export function _resetPlayedRollsForTests(): void {
  played.clear();
}

function tabHidden(): boolean {
  return typeof document !== "undefined" && document.visibilityState === "hidden";
}

export function useRollAnimation(input: RollAnimInput, opts: RollAnimOptions = {}): RollAnimation {
  const key = rollKey(input.code, input.turnNumber, input.roll !== null);
  // After a roll was shown, a turn with no roll yet is a roll still to come: forget an earlier
  // game's `code:turn` (a rematch restarts at turn 1) so the new roll animates and lands.
  const sawRoll = useRef(false);
  if (key !== null) sawRoll.current = true;
  else if (sawRoll.current && input.turnNumber !== null)
    played.delete(`${input.code}:${input.turnNumber}`);
  const dieCount = input.roll
    ? input.roll.white.length + Object.keys(input.roll.colored).length
    : 6;

  const [phase, setPhaseState] = useState<RollPhase>(() => {
    if (key === null) return "idle";
    played.add(key);
    return "settled";
  });
  const [slow, setSlow] = useState(false);
  const [landings, setLandings] = useState(0);
  const [landed, setLanded] = useState(0);

  const phaseRef = useRef(phase);
  const keyRef = useRef(key);
  keyRef.current = key;
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const tumbleStart = useRef(0);
  const timers = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  /** Dice count of a live roll that has not finished landing yet (null: nothing to skip). */
  const pending = useRef<number | null>(null);

  const setPhase = (p: RollPhase) => {
    phaseRef.current = p;
    setPhaseState(p);
  };
  const clearTimers = () => {
    for (const t of timers.current) clearTimeout(t);
    timers.current = [];
  };
  const later = (ms: number, fn: () => void) => {
    timers.current.push(setTimeout(fn, ms));
  };
  const rest = () => {
    clearTimers();
    pending.current = null;
    setSlow(false);
    setPhase(keyRef.current === null ? "idle" : "settled");
  };

  const finish = () => {
    const count = pending.current ?? 0;
    clearTimers();
    pending.current = null;
    setLanded(count);
    setPhase("settled");
    setLandings((n) => n + 1);
    optsRef.current.onLanded?.();
  };

  const land = (count: number) => {
    setLanded(0);
    setPhase("settling");
    const { landAt, settle } = ROLL_TIMING;
    const gap = GAMEPLAY_TIMING.landGap;
    for (let i = 0; i < count; i++)
      later(i * gap + landAt, () => {
        setLanded(i + 1);
        optsRef.current.onDieLand?.(i);
      });
    later((count - 1) * gap + settle, finish);
  };

  useEffect(() => {
    if (key === null) {
      // New turn, nothing rolled yet. Keep an optimistic tumble/shake going.
      if (phaseRef.current === "settled" || phaseRef.current === "settling") rest();
      return;
    }
    if (played.has(key)) {
      if (phaseRef.current !== "settled") rest();
      return;
    }
    played.add(key);
    if (input.resync || tabHidden()) {
      rest();
      return;
    }
    if (reducedMotion()) {
      clearTimers();
      setSlow(false);
      setPhase("settled");
      setLandings((n) => n + 1);
      optsRef.current.onDieLand?.(0);
      optsRef.current.onLanded?.();
      return;
    }
    clearTimers();
    setSlow(false);
    pending.current = dieCount;
    if (phaseRef.current !== "tumbling") {
      // Someone else's roll (or ours without a press): tumble now, from the view's arrival.
      tumbleStart.current = Date.now();
      setPhase("tumbling");
    }
    const wait = Math.max(0, tumbleStart.current + ROLL_TIMING.minTumble - Date.now());
    later(wait, () => land(dieCount));
  }, [key]);

  useEffect(() => clearTimers, []);

  const busy = () => phaseRef.current === "tumbling" || phaseRef.current === "settling";

  return {
    phase,
    slow,
    landings,
    landed,
    shake() {
      if (busy() || phaseRef.current === "shaking") return;
      if (!reducedMotion()) setPhase("shaking");
    },
    cancelShake() {
      if (phaseRef.current === "shaking") rest();
    },
    throwDice() {
      if (busy()) return;
      clearTimers();
      tumbleStart.current = Date.now();
      setPhase("tumbling");
      later(ROLL_TIMING.slowAfter, () => setSlow(true));
      later(ROLL_TIMING.giveUpAfter, rest);
    },
    cancelThrow() {
      if (phaseRef.current === "tumbling") rest();
    },
    skip() {
      if (pending.current !== null && busy()) finish();
    },
  };
}
