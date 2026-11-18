/** "✕ → points" guide under your card: 12 columns, one dot per colour at its current cross count. */
import { type Color, crossCount, triangular } from "@cd/engine";
import type { ViewRow } from "@cd/protocol";
import { COLORS, cssColor } from "../game/model";
import { colorName, t, useT } from "../i18n";

export interface ScoreGuideProps {
  rows: Readonly<Record<Color, ViewRow>>;
  /** Phone: a collapsed `<details>`; otherwise always open. */
  collapsible?: boolean;
}

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
            <th scope="row">{t("guide.crosses")}</th>
            {cols.map((k) => (
              <td key={k}>{k}</td>
            ))}
          </tr>
          <tr class="g-guide-pts">
            <th scope="row">{t("guide.pts")}</th>
            {cols.map((k) => (
              <td key={k} data-pts={triangular(k)}>
                {triangular(k)}
              </td>
            ))}
          </tr>
          <tr class="g-guide-dots">
            <th scope="row">{t("guide.you")}</th>
            {cols.map((k) => (
              <td key={k}>
                {counts
                  .filter((x) => x.n === k)
                  .map((x) => (
                    <span
                      key={x.color}
                      class={`g-guide-dot c-${cssColor(x.color)}`}
                      role="img"
                      aria-label={t("guide.dot", { color: colorName(x.color), k })}
                    />
                  ))}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
      <p class="g-guide-cap">{t("guide.caption")}</p>
    </div>
  );
}

export function ScoreGuide(p: ScoreGuideProps) {
  useT();
  if (p.collapsible) {
    return (
      <details class="g-guide card">
        <summary>{t("guide.title")}</summary>
        <Guide rows={p.rows} />
      </details>
    );
  }
  return (
    <section class="g-guide card" aria-label={t("guide.title")}>
      <Guide rows={p.rows} />
    </section>
  );
}
