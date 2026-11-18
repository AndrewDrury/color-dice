/** Human-readable move log lines from engine events (names from view.seats). */
import type { GameEvent } from "@cd/engine";
import type { ViewMessage } from "@cd/protocol";
import { colorName, t } from "../i18n";
import { seatName, seatOfPlayer } from "./model";

export function describeEvent(view: ViewMessage, e: GameEvent): string[] {
  const g = view.game;
  const name = (id: string) => seatName(view, seatOfPlayer(id, g));
  switch (e.type) {
    case "TURN_STARTED":
      return [t("log.turn", { n: e.turnNumber, name: seatName(view, e.activeSeat) })];
    case "DICE_ROLLED":
      return [t("log.dice", { a: e.white[0], b: e.white[1], sum: e.whiteSum })];
    case "ACTION1_REVEALED":
      return e.decisions
        .filter((d) => d.decision.kind === "PASS")
        .map((d) => t("log.passed", { name: name(d.playerId) }));
    case "MARKED":
      return [t("log.marked", { name: name(e.playerId), color: colorName(e.color), n: e.number })];
    case "ACTION2_PASSED":
      return [t("log.passed", { name: name(e.playerId) })];
    case "PENALTY":
      return [t("log.penalty", { name: name(e.playerId) })];
    case "ROW_LOCKED":
      return [t("log.locked", { color: colorName(e.color) })];
    case "GAME_ENDED":
      return [t("log.gameOver")];
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
