/**
 * The dice tray (H4): two white + four coloured dice, the white-sum badge, removed dice,
 * the Action 2 helper highlight and the hold-to-shake Roll button (pointer + Space/Enter).
 */
import type { Color } from "@cd/engine";
import type { JSX } from "preact";
import { useEffect, useRef } from "preact/hooks";
import { type Face, hashSeed } from "../fx/dice-math";
import { feedback } from "../fx/feedback";
import { useReducedMotion } from "../fx/motion";
import { startRattle, stopRattle, unlockAudio } from "../fx/sound";
import { type RollLike, useRollAnimation } from "../fx/useRollAnimation";
import "../styles/dice.css";
import { Die, type DieColor } from "./Die";

export interface TrayRoll extends RollLike {
  white: readonly [Face, Face] | readonly Face[];
  colored: Partial<Record<Color, Face>>;
}

export interface DiceHighlight {
  white?: 0 | 1;
  color?: Color;
}

export interface DiceTrayProps {
  roll: TrayRoll | null;
  lockedColors: readonly Color[];
  canRoll: boolean;
  onRoll: () => void;
  turnKey: { code: string; turnNumber: number | null };
  highlight?: DiceHighlight | null;
  /** Change this value (e.g. a counter) when the roll request fails: the dice ease back. */
  rollFailed?: number;
  /** The view came from a reconnect / first load: show it settled, never animate. */
  resync?: boolean;
  /** After the last die lands on a live roll (legal-box glow starts 100 ms later). */
  onLanded?: () => void;
  /** Filled with the Roll press handlers; the ActionBar's `RollButton` (the one Roll control) uses them. */
  controls?: { current: RollControls | null };
  /** Called when the dice start / stop tumbling (the Roll button disables meanwhile). */
  onBusyChange?: (busy: boolean) => void;
}

export interface RollControls {
  enabled: boolean;
  onPointerDown: (e: PointerEvent) => void;
  onPointerUp: () => void;
  onPointerCancel: () => void;
  onKeyDown: (e: KeyboardEvent) => void;
  onKeyUp: (e: KeyboardEvent) => void;
  onClick: () => void;
}

/**
 * The single primary Roll control (tap throws, hold shakes, release throws). Rendered by the
 * ActionBar; its behaviour comes from the tray through `controls`.
 */
export function RollButton(p: {
  controls: { current: RollControls | null };
  class?: string;
  disabled?: boolean;
  children?: JSX.Element | string;
}) {
  const c = p.controls;
  return (
    <button
      type="button"
      class={p.class}
      disabled={p.disabled}
      onPointerDown={(e) => c.current?.onPointerDown(e)}
      onPointerUp={() => c.current?.onPointerUp()}
      onPointerCancel={() => c.current?.onPointerCancel()}
      onKeyDown={(e) => c.current?.onKeyDown(e)}
      onKeyUp={(e) => c.current?.onKeyUp(e)}
      onClick={() => c.current?.onClick()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {p.children ?? "Roll"}
    </button>
  );
}

const COLORED: readonly Color[] = ["RED", "YELLOW", "GREEN", "BLUE"];
/** Resting faces before the first roll of a game (not exposed as data-face). */
const IDLE_FACES: readonly Face[] = [5, 2, 3, 6, 4, 1];

/** Hold longer than this to shake; a quick tap throws at once. */
export const HOLD_MS = 140;
export const AUTO_THROW_MS = 2500;

interface Slot {
  id: string;
  color: DieColor;
  colorKey?: Color;
  whiteIndex?: 0 | 1;
}

const SLOTS: readonly Slot[] = [
  { id: "WHITE_1", color: "WHITE", whiteIndex: 0 },
  { id: "WHITE_2", color: "WHITE", whiteIndex: 1 },
  ...COLORED.map((c) => ({ id: c, color: c, colorKey: c })),
];

export function DiceTray(props: DiceTrayProps) {
  const { roll, lockedColors, canRoll, turnKey, highlight } = props;
  const reduced = useReducedMotion();
  const onLandedRef = useRef(props.onLanded);
  onLandedRef.current = props.onLanded;

  const anim = useRollAnimation(
    { code: turnKey.code, turnNumber: turnKey.turnNumber, roll, resync: props.resync },
    {
      onDieLand: (i) => feedback("land", { semitones: (i % 3) - 1 }),
      onLanded: () => onLandedRef.current?.(),
    },
  );

  // Keep the last faces so dice rest on them between turns and while removed.
  const lastFaces = useRef<Record<string, Face>>({});
  if (roll) {
    roll.white.forEach((f, i) => {
      lastFaces.current[`WHITE_${i + 1}`] = f;
    });
    for (const c of COLORED) {
      const f = roll.colored[c];
      if (f !== undefined) lastFaces.current[c] = f;
    }
  }

  // Ease back when the roll request fails.
  const failed = useRef(props.rollFailed);
  useEffect(() => {
    if (props.rollFailed !== failed.current) {
      failed.current = props.rollFailed;
      anim.cancelThrow();
    }
  }, [props.rollFailed, anim]);

  // ---- Roll button: tap throws, hold shakes, release throws, auto-throw after 2.5 s ----
  const press = useRef<{
    hold?: ReturnType<typeof setTimeout>;
    auto?: ReturnType<typeof setTimeout>;
  } | null>(null);
  const suppressClickUntil = useRef(0);
  const busy = anim.phase === "tumbling" || anim.phase === "settling";
  const rollEnabled = canRoll && !busy;

  const endPress = () => {
    const p = press.current;
    if (p?.hold) clearTimeout(p.hold);
    if (p?.auto) clearTimeout(p.auto);
    press.current = null;
    stopRattle();
  };
  const throwNow = () => {
    endPress();
    suppressClickUntil.current = Date.now() + 500;
    feedback("rollRelease");
    anim.throwDice();
    props.onRoll();
  };
  const beginPress = () => {
    if (!rollEnabled || press.current) return;
    unlockAudio();
    feedback("rollPress");
    press.current = {
      hold: setTimeout(() => {
        anim.shake();
        startRattle(() => feedback("rattleStep"));
      }, HOLD_MS),
      auto: setTimeout(throwNow, AUTO_THROW_MS),
    };
  };
  const cancelPress = () => {
    if (!press.current) return;
    endPress();
    anim.cancelShake();
  };
  useEffect(() => endPress, []);

  const onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    beginPress();
  };
  const onPointerUp = () => {
    if (press.current) throwNow();
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation(); // the document-level Space/R shortcut must not roll a second time
    }
    if (e.repeat) return;
    if (e.key === " ") beginPress();
    else if (e.key === "Enter" && rollEnabled) throwNow();
  };
  const onKeyUp = (e: KeyboardEvent) => {
    if (e.key !== " ") return;
    e.preventDefault();
    if (press.current) throwNow();
  };
  /** Assistive tech activates with a bare click (no pointer/key events). */
  const onClick = () => {
    if (Date.now() < suppressClickUntil.current || press.current || !rollEnabled) return;
    throwNow();
  };

  if (props.controls) {
    props.controls.current = {
      enabled: rollEnabled,
      onPointerDown,
      onPointerUp,
      onPointerCancel: cancelPress,
      onKeyDown,
      onKeyUp,
      onClick,
    };
  }
  const onBusyRef = useRef(props.onBusyChange);
  onBusyRef.current = props.onBusyChange;
  useEffect(() => {
    onBusyRef.current?.(busy);
  }, [busy]);

  // ---- Dice ----
  let present = 0;
  const seedBase = `${turnKey.code}:${turnKey.turnNumber ?? 0}`;
  const dice = SLOTS.map((slot) => {
    const removed = slot.colorKey !== undefined && lockedColors.includes(slot.colorKey);
    const fromRoll =
      slot.whiteIndex !== undefined
        ? roll?.white[slot.whiteIndex]
        : slot.colorKey && roll?.colored[slot.colorKey];
    const face =
      (fromRoll as Face | undefined) ??
      lastFaces.current[slot.id] ??
      (IDLE_FACES[SLOTS.indexOf(slot)] as Face);
    const index = removed ? 0 : present++;
    const lit =
      !!highlight &&
      ((slot.whiteIndex !== undefined && highlight.white === slot.whiteIndex) ||
        (slot.colorKey !== undefined && highlight.color === slot.colorKey));
    const phase = removed ? "settled" : anim.phase;
    return (
      <Die
        key={slot.id}
        id={slot.id}
        color={slot.color}
        face={face}
        phase={phase}
        seed={hashSeed(seedBase, slot.id)}
        index={index}
        removed={removed}
        highlight={lit}
        reduced={reduced}
      />
    );
  });

  const settled = anim.phase === "settled" && roll !== null;
  const sum = roll ? (roll.white[0] ?? 0) + (roll.white[1] ?? 0) : null;
  const hlWhite = highlight?.white !== undefined ? roll?.white[highlight.white] : undefined;
  const hlColor = highlight?.color ? roll?.colored[highlight.color] : undefined;

  return (
    <section class={`tray${reduced ? " tray--reduced" : ""}`} aria-label="Dice">
      <div class="tray__felt">
        <div class="tray__dice">
          {dice.slice(0, 2)}
          <span class="tray__divider" aria-hidden="true" />
          {dice.slice(2)}
        </div>
        <div class="tray__side">
          {settled && sum !== null ? (
            <output
              key={`sum-${anim.landings}`}
              class={`tray__sum${anim.landings > 0 ? " is-pop" : ""}`}
              aria-label={`White sum ${sum}`}
            >
              <span aria-hidden="true">=</span> {sum}
            </output>
          ) : null}
          {anim.slow ? <span class="tray__status">Rolling…</span> : null}
          {settled && hlWhite !== undefined && hlColor !== undefined ? (
            <span class="tray__combo num">
              {hlWhite} + {hlColor}
            </span>
          ) : null}
        </div>
      </div>
    </section>
  );
}
