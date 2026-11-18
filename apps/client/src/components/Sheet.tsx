/**
 * Your big score sheet: four rows (each with its points pill) and the one-line footer:
 * the score equation on the left, the four penalty boxes right-aligned (K3.2, K3.4).
 */
import type { Color } from "@cd/engine";
import type { FullViewPlayer } from "@cd/protocol";
import { Fragment } from "preact";
import { COLORS, cssColor } from "../game/model";
import { useTween } from "../game/useTween";
import { colorLetter, colorLower, colorName, t, useT } from "../i18n";
import { markGain, Row } from "./Row";
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
  staged: { color: Color; number: number } | null;
  ghost: { color: Color; number: number } | null;
  disabled: boolean;
  fx: SheetFx;
  /** Read-only full sheet (opponent bottom sheet): no inputs, no effects. */
  readOnly?: boolean;
  /** Error shake of the staged box. */
  errorShake?: boolean;
  /** A staged Pass will cost a penalty: the next empty penalty box shakes. */
  warnPenalty?: boolean;
  onPick: (color: Color, number: number) => void;
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
      <abbr
        title={colorName(p.color)}
        aria-label={t("sheet.scoreAbbr", { color: colorLower(p.color) })}
      >
        {colorLetter(p.color)}
      </abbr>{" "}
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
      <span class="num" data-total={p.total} aria-hidden="true">
        {v}
      </span>
      {p.next !== null ? (
        <>
          <span class="g-arrow" aria-hidden="true">
            →
          </span>
          <span class="num g-next" data-next={p.next} aria-hidden="true">
            {p.next}
          </span>
        </>
      ) : null}
    </span>
  );
}

export function Sheet(p: SheetProps) {
  useT();
  const { sheet, score } = p.player;
  const allLegal = (c: Color) =>
    p.readOnly
      ? []
      : Array.from({ length: 11 }, (_, i) => i + 2).filter((n) => p.legal.has(`${c}:${n}`));
  const gain = p.staged ? markGain(p.staged.color, sheet.rows[p.staged.color], p.staged.number) : 0;
  const penaltyPoints = Math.abs(score.penalties);
  return (
    <div class={`sheet-card g-sheet${p.fx.shakeKey ? " is-shaking" : ""}`} key={p.fx.shakeKey}>
      {COLORS.map((c) => (
        <Row
          key={c}
          color={c}
          row={sheet.rows[c]}
          lockedColors={p.lockedColors}
          legal={allLegal(c)}
          stagedNumber={p.staged?.color === c ? p.staged.number : null}
          ghostNumber={p.ghost?.color === c ? p.ghost.number : null}
          flash={p.fx.flash[c] ?? []}
          disabled={p.disabled || !!p.readOnly}
          shake={!!p.errorShake}
          glint={p.fx.glint === c}
          onPick={p.onPick}
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
          <Total total={score.total} next={p.staged ? score.total + gain : null} />
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
