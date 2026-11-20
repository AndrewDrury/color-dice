/** One colour row: letter rail, 11 number boxes, the lock box. Memoised by its data. */
import {
  applyMark,
  boxStatus,
  type Color,
  crossCount,
  LOCK_MIN_MARKS,
  numberAt,
  rowScore,
} from "@cd/engine";
import type { ViewRow } from "@cd/protocol";
import { Component } from "preact";
import { COLORS, cssColor, markCount } from "../game/model";
import { colorLetter, colorName, t, useT } from "../i18n";
import { Box } from "./Box";
import { LockIcon } from "./icons";

export interface RowProps {
  color: Color;
  row: ViewRow;
  lockedColors: readonly Color[];
  /** Numbers of this row that are legal right now (empty until the dice landed). */
  legal: readonly number[];
  /** The legal numbers that are colour (white + colour die) moves, not the white sum. */
  colour?: readonly number[];
  /** Staged numbers in the order they would be marked (step 1, then step 2). */
  stagedNumbers: readonly number[];
  /** Step (1/2) of each staged number, same order; empty for non-active players. */
  stagedSteps?: readonly (1 | 2)[];
  ghostNumbers: readonly number[];
  flash: readonly number[];
  disabled: boolean;
  shake: boolean;
  glint: boolean;
  onPick: (color: Color, number: number) => void;
  onHover?: (color: Color, number: number | null) => void;
}

/** Points a mark on `n` would add to this row (the lock box counts when it locks). */
export function markGain(color: Color, row: ViewRow, n: number): number {
  const r = { color, marked: row.marked, lockCrossed: row.lockCrossed };
  return rowScore(applyMark(r, n).row) - rowScore(r);
}

/** K3.2: the row's points at its right end, `4✕ · 10`, or the gain `+5` while staging. */
/** Gain of marking `numbers` in order (the second mark sees the first). */
export function stagedGain(color: Color, row: ViewRow, numbers: readonly number[]): number {
  let r = { color, marked: row.marked, lockCrossed: row.lockCrossed };
  let gain = 0;
  for (const n of numbers) {
    const next = applyMark(r, n).row;
    gain += rowScore(next) - rowScore(r);
    r = next;
  }
  return gain;
}

function RowPoints(p: { color: Color; row: ViewRow; stagedNumbers: readonly number[] }) {
  const r = { color: p.color, marked: p.row.marked, lockCrossed: p.row.lockCrossed };
  const k = crossCount(r);
  const pts = rowScore(r);
  const gain = p.stagedNumbers.length === 0 ? null : stagedGain(p.color, p.row, p.stagedNumbers);
  const color = colorName(p.color);
  return (
    <span
      class={`g-rowpts${gain !== null ? " is-preview" : ""}`}
      role="img"
      data-points={pts}
      data-crosses={k}
      data-gain={gain ?? undefined}
      aria-label={
        gain !== null ? t("row.gain", { color, pts, gain }) : t("row.points", { color, k, pts })
      }
    >
      {gain !== null ? (
        <span class="num g-rowpts-gain" aria-hidden="true">
          +{gain}
        </span>
      ) : (
        <>
          <span class="num g-rowpts-x" aria-hidden="true">
            {k}✕
          </span>
          <span class="g-rowpts-sep" aria-hidden="true">
            ·
          </span>
          <span class="num g-rowpts-pts" aria-hidden="true">
            {pts}
          </span>
        </>
      )}
    </span>
  );
}

function RowImpl(p: RowProps) {
  useT();
  const cn = colorName(p.color);
  const letter = colorLetter(p.color);
  const engineRow = { color: p.color, marked: p.row.marked, lockCrossed: p.row.lockCrossed };
  const closed = p.lockedColors.includes(p.color);
  const marks = markCount(p.row);
  const gated = marks < LOCK_MIN_MARKS;
  const pips = !closed && !p.row.lockCrossed;
  return (
    <div
      class={`g-row c-${cssColor(p.color)}${closed ? " is-closed" : ""}${p.glint ? " has-glint" : ""}`}
    >
      <span class="g-lockseg" aria-hidden="true" />
      <span class={`g-rail${letter.length > 1 ? " is-two" : ""}`} title={cn} aria-hidden="true">
        {letter}
      </span>
      {Array.from({ length: 11 }, (_, i) => {
        const n = numberAt(p.color, i);
        return (
          <Box
            key={i}
            color={p.color}
            number={n}
            status={boxStatus(engineRow, i, p.lockedColors)}
            legal={p.legal.includes(n)}
            colour={p.colour?.includes(n)}
            staged={p.stagedNumbers.includes(n)}
            step={p.stagedSteps?.[p.stagedNumbers.indexOf(n)]}
            ghost={p.ghostNumbers.includes(n)}
            flash={p.flash.includes(i)}
            disabled={p.disabled}
            shake={p.shake && p.stagedNumbers.includes(n)}
            onPick={() => p.onPick(p.color, n)}
            onHover={(on) => p.onHover?.(p.color, on ? n : null)}
          />
        );
      })}
      <span
        class={`g-lockbox${p.row.lockCrossed ? " is-crossed" : ""}${pips && !gated ? " is-available" : ""}`}
        role="img"
        aria-label={
          p.row.lockCrossed
            ? t("row.lockCrossed", { color: cn })
            : gated && !closed
              ? t("row.lockNeeds", { color: cn, need: LOCK_MIN_MARKS, have: marks })
              : pips
                ? t("row.lockAvailable", { color: cn })
                : t("row.lock", { color: cn })
        }
      >
        {pips && gated ? (
          <span class="g-pipcount num" aria-hidden="true">
            {marks}/{LOCK_MIN_MARKS}
          </span>
        ) : (
          <LockIcon size={14} />
        )}
        {pips ? (
          <span class="g-pips" data-marks={Math.min(marks, LOCK_MIN_MARKS)} aria-hidden="true">
            {Array.from({ length: LOCK_MIN_MARKS }, (_, i) => (
              <i key={i} class={i < marks ? "is-on" : ""} />
            ))}
          </span>
        ) : null}
      </span>
      <RowPoints color={p.color} row={p.row} stagedNumbers={p.stagedNumbers} />
    </div>
  );
}

const same = (a: readonly number[], b: readonly number[]) => a.join() === b.join();
const rowEqual = (a: RowProps, b: RowProps) =>
  a.color === b.color &&
  a.row.marked.join() === b.row.marked.join() &&
  a.row.lockCrossed === b.row.lockCrossed &&
  a.lockedColors.join() === b.lockedColors.join() &&
  same(a.legal, b.legal) &&
  same(a.colour ?? [], b.colour ?? []) &&
  same(a.flash, b.flash) &&
  a.stagedNumbers.join() === b.stagedNumbers.join() &&
  a.stagedSteps?.join() === b.stagedSteps?.join() &&
  a.ghostNumbers.join() === b.ghostNumbers.join() &&
  a.disabled === b.disabled &&
  a.shake === b.shake &&
  a.glint === b.glint &&
  a.onPick === b.onPick &&
  a.onHover === b.onHover;

/** Re-renders only when a prop that changes the row changed (preact/compat's memo is not worth its bytes). */
export class Row extends Component<RowProps> {
  override shouldComponentUpdate(next: RowProps): boolean {
    return !rowEqual(this.props, next);
  }
  override render() {
    return <RowImpl {...this.props} />;
  }
}
export { COLORS };
