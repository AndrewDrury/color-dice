/** Ranked results (H7): names, row scores, penalties, total; winners get a crown. */
import type { ViewMessage, ViewPlayer } from "@cd/protocol";
import { COLOR_LETTER, COLORS, cssColor, seatInfo, seatOfPlayer } from "../game/model";
import { useTween } from "../game/useTween";
import { CrownIcon } from "./icons";

export function rankPlayers(view: ViewMessage): ViewPlayer[] {
  const players = [...(view.game?.players ?? [])];
  return players.sort((a, b) => b.score.total - a.score.total || a.seat - b.seat);
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
  const g = view.game;
  const winners = new Set((g?.winners ?? []).map((id) => seatOfPlayer(id, g)));
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
        </tr>
      </thead>
      <tbody>
        {rankPlayers(view).map((p) => {
          const win = winners.has(p.seat);
          return (
            <tr key={p.seat} class={win ? "is-winner" : ""} data-winner={win ? "true" : undefined}>
              <th scope="row">
                {win ? <CrownIcon size={16} aria-label="winner" /> : null}{" "}
                <span class="g-name">{seatInfo(view, p)?.name ?? `Player ${p.seat + 1}`}</span>
              </th>
              {COLORS.map((c) => (
                <td key={c}>
                  <Count value={p.score.rows[c]} />
                </td>
              ))}
              <td>
                <Count value={p.score.penalties} />
              </td>
              <td class="g-total-cell">
                <Count value={p.score.total} />
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
