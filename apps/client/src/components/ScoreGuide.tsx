/** "✕ → points" guide under your card: 12 columns, one dot per colour at its current cross count. */
import { type Color, crossCount, triangular } from "@cd/engine";
import type { ViewRow } from "@cd/protocol";
import { COLOR_NAME, COLORS, cssColor } from "../game/model";

export interface ScoreGuideProps {
  rows: Readonly<Record<Color, ViewRow>>;
  /** Phone: a collapsed `<details>`; otherwise always open. */
  collapsible?: boolean;
}

const CAPTION = "Lock: 5 ✕ in a row first · the lock counts as an extra ✕";

function Guide({ rows }: Pick<ScoreGuideProps, "rows">) {
  const counts = COLORS.map((c) => ({
    color: c,
    n: crossCount({ color: c, marked: rows[c].marked, lockCrossed: rows[c].lockCrossed }),
  }));
  const cols = Array.from({ length: 12 }, (_, i) => i + 1);
  return (
    <div class="g-guide-body">
      <table class="g-guide-table">
        <tbody>
          <tr>
            <th scope="row">✕</th>
            {cols.map((k) => (
              <td key={k}>{k}</td>
            ))}
          </tr>
          <tr class="g-guide-pts">
            <th scope="row">pts</th>
            {cols.map((k) => (
              <td key={k} data-pts={triangular(k)}>
                {triangular(k)}
              </td>
            ))}
          </tr>
          <tr class="g-guide-dots">
            <th scope="row">You</th>
            {cols.map((k) => (
              <td key={k}>
                {counts
                  .filter((x) => x.n === k)
                  .map((x) => (
                    <span
                      key={x.color}
                      class={`g-guide-dot c-${cssColor(x.color)}`}
                      role="img"
                      aria-label={`${COLOR_NAME[x.color]}: ${k} ✕`}
                    />
                  ))}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
      <p class="g-guide-cap">{CAPTION}</p>
    </div>
  );
}

export function ScoreGuide(p: ScoreGuideProps) {
  if (p.collapsible) {
    return (
      <details class="g-guide card">
        <summary>How scoring works</summary>
        <Guide rows={p.rows} />
      </details>
    );
  }
  return (
    <section class="g-guide card" aria-label="How scoring works">
      <Guide rows={p.rows} />
    </section>
  );
}
