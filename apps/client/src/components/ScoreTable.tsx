/** Ranked results (H7): names, row scores, penalties, total; a sole winner gets a crown, tied top players a Tie badge; equal totals share a rank. */
import type { ViewMessage, ViewPlayer } from "@cd/protocol";
import {
  COLOR_LETTER,
  COLORS,
  cssColor,
  recordLabel,
  recordText,
  seatInfo,
  tieInfo,
} from "../game/model";
import { useTween } from "../game/useTween";
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

function Count({ value }: { value: number }) {
  const v = useTween(value, COUNT_MS, 0);
  return (
    <span class="num" data-value={value}>
      {v}
    </span>
  );
}

export function ScoreTable({ view }: { view: ViewMessage }) {
  const { winnerSeats, tie } = tieInfo(view);
  const winners = new Set(winnerSeats);
  const ranked = rankPlayers(view);
  const ranks = rankNumbers(ranked);
  return (
    <table class="g-results">
      <thead>
        <tr>
          <th scope="col">Player</th>
          {COLORS.map((c) => (
            <th key={c} scope="col" class={`c-${cssColor(c)}`}>
              {COLOR_LETTER[c]}
            </th>
          ))}
          <th scope="col">Pen.</th>
          <th scope="col">Total</th>
          <th scope="col">Record</th>
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
                    <TieIcon size={14} /> Tie
                  </span>
                ) : win ? (
                  <CrownIcon size={16} title="Winner" />
                ) : null}{" "}
                <span class="g-name">{seatInfo(view, p)?.name ?? `Player ${p.seat + 1}`}</span>
              </th>
              {COLORS.map((c) => (
                <td key={c}>
                  <Count value={p.score.rows?.[c] ?? 0} />
                </td>
              ))}
              <td>
                <Count value={p.score.penalties} />
              </td>
              <td class="g-total-cell">
                <Count value={p.score.total} />
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
