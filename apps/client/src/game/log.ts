/** Human-readable move log lines from engine events (names from view.seats). */
import type { GameEvent } from "@cd/engine";
import type { ViewMessage } from "@cd/protocol";
import { COLOR_NAME, seatName, seatOfPlayer } from "./model";

export function describeEvent(view: ViewMessage, e: GameEvent): string[] {
  const g = view.game;
  const name = (id: string) => seatName(view, seatOfPlayer(id, g));
  switch (e.type) {
    case "TURN_STARTED":
      return [`Turn ${e.turnNumber} — ${seatName(view, e.activeSeat)} rolls`];
    case "DICE_ROLLED":
      return [`Dice: white ${e.white[0]} + ${e.white[1]} = ${e.whiteSum}`];
    case "ACTION1_REVEALED":
      return e.decisions
        .filter((d) => d.decision.kind === "PASS")
        .map((d) => `${name(d.playerId)} passed`);
    case "MARKED":
      return [`${name(e.playerId)} marked ${COLOR_NAME[e.color]} ${e.number}`];
    case "ACTION2_PASSED":
      return [`${name(e.playerId)} passed`];
    case "PENALTY":
      return [`${name(e.playerId)} took a penalty (−5)`];
    case "ROW_LOCKED":
      return [`${COLOR_NAME[e.color]} row locked`];
    case "GAME_ENDED":
      return ["Game over"];
    default:
      return [];
  }
}

/** Newest first. */
export function logLines(view: ViewMessage): { id: number; text: string }[] {
  const out: { id: number; text: string }[] = [];
  const events = view.game?.events ?? [];
  events.forEach((e, i) => {
    describeEvent(view, e).forEach((text, j) => {
      out.push({ id: i * 10 + j, text });
    });
  });
  return out.reverse();
}
