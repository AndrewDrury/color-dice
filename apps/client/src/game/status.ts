/** Status line (D2 + H15) and the H13 roll / reveal announcements. */
import type { ViewMessage } from "@cd/protocol";
import { COLOR_NAME, COLORS, joinNames, seatName, seatOfPlayer } from "./model";

export function statusText(view: ViewMessage): string {
  const g = view.game;
  if (!g) return "";
  const active = g.turn?.activeSeat ?? -1;
  const you = view.you.seat;
  const activeName = active >= 0 ? seatName(view, active) : "";
  switch (g.phase) {
    case "AWAIT_ROLL":
      return active === you ? "Your turn — roll the dice" : `Waiting for ${activeName} to roll…`;
    case "ACTION_1": {
      const mine = g.players.find((p) => p.seat === you);
      if (mine?.action1Submitted || view.you.action1Decision) {
        const waiting = g.players
          .filter((p) => !p.action1Submitted && p.seat !== you)
          .map((p) => seatName(view, p.seat));
        return waiting.length > 0 ? `Waiting for ${joinNames(waiting)}` : "Revealing…";
      }
      return `Everyone: use white ${g.roll?.whiteSum ?? ""} in one row, or pass`;
    }
    case "ACTION_2":
      return active === you
        ? "Your turn — combine a white and a coloured die, or pass"
        : `${activeName} is choosing…`;
    case "GAME_OVER":
      return "Game over";
    default:
      return "";
  }
}

/** "Cleo rolled. White 3 and 5, sum 8. Red 2, Green 6, Blue 1." */
export function rollAnnouncement(view: ViewMessage): string {
  const g = view.game;
  if (!g?.roll || !g.turn) return "";
  const colored = COLORS.filter((c) => g.roll?.colored[c] !== undefined).map(
    (c) => `${COLOR_NAME[c]} ${g.roll?.colored[c]}`,
  );
  const [w1, w2] = g.roll.white;
  return `${seatName(view, g.turn.activeSeat)} rolled. White ${w1} and ${w2}, sum ${g.roll.whiteSum}. ${colored.join(", ")}.`;
}

/** "Dev marked Red 8. Ria passed." from the latest ACTION1_REVEALED event. */
export function revealAnnouncement(view: ViewMessage): string {
  const g = view.game;
  if (!g) return "";
  let rev: Extract<(typeof g.events)[number], { type: "ACTION1_REVEALED" }> | undefined;
  for (const e of g.events) if (e.type === "ACTION1_REVEALED") rev = e;
  if (!rev) return "";
  const sum = g.roll?.whiteSum;
  return rev.decisions
    .map((d) => {
      const name = seatName(view, seatOfPlayer(d.playerId, g));
      return d.decision.kind === "PASS"
        ? `${name} passed.`
        : `${name} marked ${COLOR_NAME[d.decision.color]} ${sum ?? ""}.`.replace(" .", ".");
    })
    .join(" ");
}

/** End-of-game reason in plain words. */
export function endReasonText(view: ViewMessage): string {
  const r = view.game?.endReason;
  if (!r) return "";
  if (r.kind === "TWO_ROWS_LOCKED") return "Two rows locked";
  const names = r.playerIds.map((id) => seatName(view, seatOfPlayer(id, view.game)));
  return `${joinNames(names)} took a 4th penalty`;
}
