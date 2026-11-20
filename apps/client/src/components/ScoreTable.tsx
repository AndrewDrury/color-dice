/** Ranked results (H7): names, row scores, penalties, total; a sole winner gets a crown, tied top players a Tie badge; equal totals share a rank. */
import type { ViewMessage, ViewPlayer } from "@cd/protocol";
import { Fragment } from "preact";
import { COLORS, cssColor, recordLabel, recordText, seatInfo, tieInfo } from "../game/model";
import { useTween } from "../game/useTween";
import { t, useT } from "../i18n";
import { AvatarHover } from "./AvatarHover";
import { CrownIcon, TieIcon } from "./icons";

export function rankPlayers(view: ViewMessage): ViewPlayer[] {
  const players = [...(view.game?.players ?? [])];
  return players.sort((a, b) => b.score.total - a.score.total || a.seat - b.seat);
}

/** Competition ranking by total (1, 1, 3): equal totals share a rank. Parallel to `rankPlayers`. */
export function rankNumbers(ranked: readonly ViewPlayer[]): number[] {
  return ranked.map((p, i) => {
    const first = ranked.findIndex((q) => q.score.total === p.score.total);
    return (first === -1 ? i : first) + 1;
  });
}

const COUNT_MS = 900;

function Count({
  value,
  cls = "num",
  ms = COUNT_MS,
}: {
  value: number;
  cls?: string;
  ms?: number;
}) {
  const v = useTween(value, ms, 0);
  return (
    <span class={cls} data-value={value}>
      {v}
    </span>
  );
}

/**
 * Row scores − penalties = total (K5.6, no colour letters), each term in its row colour with the same classes and
 * tokens as the in-game footer equation. Only the total carries `.num[data-value]`.
 */
export function ResultEquation({
  player,
  name,
  ms = COUNT_MS,
}: {
  player: ViewPlayer;
  name: string;
  ms?: number;
}) {
  useT();
  const { rows, penalties, total } = player.score;
  const pen = Math.abs(penalties);
  return (
    <span
      class="g-eq g-res-eq"
      role="img"
      aria-label={t("over.equationAria", {
        name,
        r: rows?.RED ?? 0,
        y: rows?.YELLOW ?? 0,
        g: rows?.GREEN ?? 0,
        b: rows?.BLUE ?? 0,
        p: pen,
        total,
      })}
    >
      {COLORS.map((c, i) => (
        <Fragment key={c}>
          {i > 0 ? <span class="g-op">+</span> : null}
          <span class={`g-score c-${cssColor(c)}`} data-term={c}>
            <Count value={rows?.[c] ?? 0} cls="eqn" ms={ms} />
          </span>
        </Fragment>
      ))}
      <span class="g-op">−</span>
      <span class="g-score g-penscore" data-term="PEN">
        <Count value={pen} cls="eqn" ms={ms} />
        <span class="g-pencap">{t("sheet.penaltiesCaption")}</span>
      </span>
      <span class="g-op">=</span>
      <span class="g-total g-total--xl">
        <span class="g-total-main">
          <Count value={total} ms={ms} />
        </span>
        <span class="g-total-cap">{t("sheet.totalCaption")}</span>
      </span>
    </span>
  );
}

export function ScoreTable({ view }: { view: ViewMessage }) {
  useT();
  const { winnerSeats, tie } = tieInfo(view);
  const winners = new Set(winnerSeats);
  const ranked = rankPlayers(view);
  const ranks = rankNumbers(ranked);
  return (
    <table class="g-results">
      <thead>
        <tr>
          <th scope="col">{t("table.player")}</th>
          <th scope="col">{t("table.total")}</th>
          <th scope="col">{t("table.record")}</th>
        </tr>
      </thead>
      <tbody>
        {ranked.map((p, i) => {
          const win = winners.has(p.seat);
          const rec = seatInfo(view, p)?.record;
          return (
            <tr key={p.seat} class={win ? "is-winner" : ""} data-winner={win ? "true" : undefined}>
              <th scope="row">
                <span class="num g-rank">{ranks[i]}.</span>{" "}
                {win && tie ? (
                  <span class="g-tie-badge">
                    <TieIcon size={14} /> {t("table.tie")}
                  </span>
                ) : win ? (
                  <CrownIcon size={16} title={t("table.winner")} />
                ) : null}{" "}
                <AvatarHover
                  profile={seatInfo(view, p)?.profile}
                  size={20}
                  name={seatInfo(view, p)?.name ?? t("player.fallback", { n: p.seat + 1 })}
                />{" "}
                <span class="g-name">
                  {seatInfo(view, p)?.name ?? t("player.fallback", { n: p.seat + 1 })}
                </span>
              </th>
              <td class="g-total-cell g-eq-cell">
                <ResultEquation player={p} name={seatInfo(view, p)?.name ?? ""} />
              </td>
              <td class="num" data-record>
                {rec ? (
                  <span role="img" aria-label={recordLabel(rec)}>
                    {recordText(rec)}
                  </span>
                ) : (
                  "–"
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
