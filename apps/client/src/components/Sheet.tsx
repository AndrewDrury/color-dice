/**
 * Your big score sheet: four rows (each with its points pill) and the one-line footer:
 * the score equation on the left, the four penalty boxes right-aligned (K3.2, K3.4).
 */
import type { Color } from "@cd/engine";
import type { FullViewPlayer } from "@cd/protocol";
import { Fragment } from "preact";
import { COLORS, cssColor } from "../game/model";
import { useTween } from "../game/useTween";
import { colorLower, t, useT } from "../i18n";
import { LockIcon } from "./icons";
import { Row, stagedGain } from "./Row";
import { ScoreFloat } from "./ScoreFloat";

export interface SheetFx {
  /** Box indices flashing, per colour. */
  flash: Partial<Record<Color, number[]>>;
  glint: Color | null;
  floats: { id: number; color: Color; amount: number }[];
  shakeKey: number;
}

export interface SheetProps {
  player: FullViewPlayer;
  lockedColors: readonly Color[];
  legal: ReadonlySet<string>;
  /** The legal keys that are colour moves (the rest of `legal` are white-sum boxes). */
  colour?: ReadonlySet<string>;
  /** Staged marks in order (step 1, then step 2). */
  staged: readonly { color: Color; number: number; step?: 1 | 2 }[];
  /** Sent / decided marks waiting for the reveal (50 % ✕). */
  ghost: readonly { color: Color; number: number }[];
  disabled: boolean;
  fx: SheetFx;
  /** Read-only full sheet (opponent bottom sheet): no inputs, no effects. */
  readOnly?: boolean;
  /** Error shake of the staged box. */
  errorShake?: boolean;
  /** A staged Pass will cost a penalty: the next empty penalty box shakes. */
  warnPenalty?: boolean;
  onPick: (color: Color, number: number) => void;
  onHover?: (color: Color, number: number | null) => void;
  onFloatDone?: (id: number) => void;
}

function RowScore(p: {
  color: Color;
  value: number;
  floats: SheetFx["floats"];
  done?: (id: number) => void;
}) {
  const v = useTween(p.value);
  return (
    <span class={`g-score c-${cssColor(p.color)}`}>
      <span class="sr-only">{t("sheet.scoreAbbr", { color: colorLower(p.color) })}</span>
      <span class="num" data-value={p.value}>
        {v}
      </span>
      {p.floats
        .filter((f) => f.color === p.color)
        .map((f) => (
          <ScoreFloat key={f.id} amount={f.amount} onDone={() => p.done?.(f.id)} />
        ))}
    </span>
  );
}

function Total(p: { total: number; next: number | null }) {
  const v = useTween(p.total);
  return (
    <span
      class={`g-total g-total--xl${p.next !== null ? " is-preview" : ""}`}
      role="img"
      aria-label={
        p.next !== null
          ? t("sheet.totalPreview", { n: p.total, next: p.next })
          : t("sheet.totalAria", { n: p.total })
      }
    >
      <span class="g-total-main" aria-hidden="true">
        <span class="num" data-total={p.total}>
          {v}
        </span>
        {p.next !== null ? (
          <>
            <span class="g-arrow">→</span>
            <span class="num g-next" data-next={p.next}>
              {p.next}
            </span>
          </>
        ) : null}
      </span>
      <span class="g-total-cap" aria-hidden="true">
        {t("sheet.totalCaption")}
      </span>
    </span>
  );
}

export function Sheet(p: SheetProps) {
  useT();
  const { sheet, score } = p.player;
  const pick = (c: Color, keys: ReadonlySet<string> | undefined) =>
    p.readOnly
      ? []
      : Array.from({ length: 11 }, (_, i) => i + 2).filter((n) => keys?.has(`${c}:${n}`));
  const numbersOf = (list: SheetProps["staged"], c: Color) =>
    list.filter((m) => m.color === c).map((m) => m.number);
  const gain = COLORS.reduce(
    (sum, c) => sum + stagedGain(c, sheet.rows[c], numbersOf(p.staged, c)),
    0,
  );
  const penaltyPoints = Math.abs(score.penalties);
  return (
    <div class={`sheet-card g-sheet${p.fx.shakeKey ? " is-shaking" : ""}`} key={p.fx.shakeKey}>
      <div class="g-lockhead">
        <span class="g-locktab" role="img" aria-label={t("sheet.lockColumn")}>
          <LockIcon size={12} />
        </span>
      </div>
      {COLORS.map((c) => (
        <Row
          key={c}
          color={c}
          row={sheet.rows[c]}
          lockedColors={p.lockedColors}
          legal={pick(c, p.legal)}
          colour={pick(c, p.colour)}
          stagedNumbers={numbersOf(p.staged, c)}
          stagedSteps={p.staged.filter((m) => m.color === c && m.step).map((m) => m.step as 1 | 2)}
          ghostNumbers={numbersOf(p.ghost, c)}
          flash={p.fx.flash[c] ?? []}
          disabled={p.disabled || !!p.readOnly}
          shake={!!p.errorShake}
          glint={p.fx.glint === c}
          onPick={p.onPick}
          onHover={p.onHover}
        />
      ))}
      <div class="g-foot">
        <span class="g-scores g-eq">
          {COLORS.map((c, i) => (
            <Fragment key={c}>
              {i > 0 ? <span class="g-op">+</span> : null}
              <RowScore color={c} value={score.rows[c]} floats={p.fx.floats} done={p.onFloatDone} />
            </Fragment>
          ))}
          <span class="g-op">−</span>
          <span class="g-score g-penscore" title={t("sheet.penaltyPoints")}>
            <span class="num" data-penalty-points={penaltyPoints}>
              {penaltyPoints}
            </span>
            <span class="g-pencap">{t("sheet.penaltiesCaption")}</span>
          </span>
          <span class="g-op">=</span>
          <Total total={score.total} next={p.staged.length > 0 ? score.total + gain : null} />
        </span>
        <span
          class="g-pen"
          role="img"
          aria-label={t("sheet.penaltyAria", { n: sheet.penalties })}
          title={t("sheet.penaltyTip")}
        >
          <span class="g-pen-label">{t("sheet.penaltyLabel")}</span>
          {Array.from({ length: 4 }, (_, i) => (
            <span
              key={i}
              class={`g-pbox${i < sheet.penalties ? " is-on" : ""}${p.warnPenalty && i === sheet.penalties ? " is-warn" : ""}`}
            >
              {i < sheet.penalties ? "✕" : "−5"}
            </span>
          ))}
        </span>
      </div>
    </div>
  );
}
