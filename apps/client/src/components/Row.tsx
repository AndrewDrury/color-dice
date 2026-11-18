/** One colour row: letter rail, 11 number boxes, the lock box. Memoised by its data. */
import { boxStatus, type Color, LOCK_MIN_MARKS, numberAt } from "@cd/engine";
import type { ViewRow } from "@cd/protocol";
import { memo } from "preact/compat";
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
  stagedNumber: number | null;
  ghostNumber: number | null;
  flash: readonly number[];
  disabled: boolean;
  shake: boolean;
  glint: boolean;
  onPick: (color: Color, number: number) => void;
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
            staged={p.stagedNumber === n}
            ghost={p.ghostNumber === n}
            flash={p.flash.includes(i)}
            disabled={p.disabled}
            shake={p.shake && p.stagedNumber === n}
            onPick={() => p.onPick(p.color, n)}
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
        <LockIcon size={14} />
        {pips ? (
          <span class="g-pips" data-marks={Math.min(marks, LOCK_MIN_MARKS)} aria-hidden="true">
            {Array.from({ length: LOCK_MIN_MARKS }, (_, i) => (
              <i key={i} class={i < marks ? "is-on" : ""} />
            ))}
          </span>
        ) : null}
      </span>
    </div>
  );
}

const same = (a: readonly number[], b: readonly number[]) => a.join() === b.join();
export const Row = memo(
  RowImpl,
  (a, b) =>
    a.color === b.color &&
    a.row.marked.join() === b.row.marked.join() &&
    a.row.lockCrossed === b.row.lockCrossed &&
    a.lockedColors.join() === b.lockedColors.join() &&
    same(a.legal, b.legal) &&
    same(a.flash, b.flash) &&
    a.stagedNumber === b.stagedNumber &&
    a.ghostNumber === b.ghostNumber &&
    a.disabled === b.disabled &&
    a.shake === b.shake &&
    a.glint === b.glint &&
    a.onPick === b.onPick,
);
export { COLORS };
