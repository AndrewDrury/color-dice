/** How to play (H12): short bullets in our own words, an example row and the scoring table. */
import { triangular } from "@cd/engine";
import { type MessageKey, t, useT } from "../i18n";
import { BottomSheet } from "./BottomSheet";

const POINTS = Array.from({ length: 12 }, (_, i) => [i + 1, triangular(i + 1)] as const);

const BULLETS: readonly MessageKey[] = [
  "help.b1",
  "help.b2",
  "help.b3",
  "help.b4",
  "help.b5",
  "help.b6",
  "help.b7",
  "help.b8",
];

const EXAMPLE = [2, 3, 4, 5, 6, 7, 8];

export function HowToPlay({ onClose }: { onClose: () => void }) {
  useT();
  return (
    <BottomSheet title={t("help.title")} onClose={onClose}>
      <ol class="htp-list">
        {BULLETS.map((b) => (
          <li key={b}>{t(b)}</li>
        ))}
      </ol>
      <div>
        <h3>{t("help.example")}</h3>
        <p class="muted htp-cap">{t("help.exampleCap")}</p>
        <div class="htp-row" role="img" aria-label={t("help.exampleAria")}>
          {EXAMPLE.map((n) => (
            <span key={n} class={n === 2 || n === 5 ? "is-x" : n === 3 || n === 4 ? "is-skip" : ""}>
              {n === 2 || n === 5 ? "✕" : n}
            </span>
          ))}
        </div>
      </div>
      <div>
        <h3>{t("help.scoring")}</h3>
        <p class="muted htp-cap">{t("help.scoringCap")}</p>
        <table class="htp-table">
          <thead>
            <tr>
              <th scope="col">{t("help.crosses")}</th>
              {POINTS.map(([n]) => (
                <th key={n} scope="col">
                  {n}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">{t("help.points")}</th>
              {POINTS.map(([n, pts]) => (
                <td key={n} class="num">
                  {pts}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
        <p class="muted htp-cap">{t("help.lockCap")}</p>
      </div>
    </BottomSheet>
  );
}
