/** Move log lines from engine events (names and avatars from view.seats). */
import type { Color, GameEvent } from "@cd/engine";
import type { Profile, ViewMessage } from "@cd/protocol";
import { colorName, t } from "../i18n";
import { seatName, seatOfPlayer, seatProfile } from "./model";

export interface LogLine {
  id: number;
  /** Full sentence: screen readers and e2e helpers read this. */
  text: string;
  kind: "turn" | "mark" | "pass" | "penalty" | "lock" | "over";
  /** The part the typewriter types: the name (or the whole short text for turn/lock/over). */
  typed: string;
  profile?: Profile;
  color?: Color;
  number?: number;
}

type Line = Omit<LogLine, "id">;

export function describeEvent(view: ViewMessage, e: GameEvent): Line[] {
  /** A line about a player: avatar + name typed, `text` for screen readers. */
  const by = (
    id: string,
    kind: Line["kind"],
    key: "log.passed" | "log.marked" | "log.penalty",
    extra: Partial<Line> = {},
  ): Line => {
    const seat = seatOfPlayer(id, view.game);
    const name = seatName(view, seat);
    const profile = seatProfile(view, seat);
    const color = extra.color ? colorName(extra.color) : "";
    return {
      kind,
      text: t(key, { name, color, n: extra.number ?? "" }),
      typed: name,
      ...(profile && { profile }),
      ...extra,
    };
  };
  const plain = (kind: Line["kind"], text: string, extra: Partial<Line> = {}): Line => ({
    kind,
    text,
    typed: text,
    ...extra,
  });
  switch (e.type) {
    case "TURN_STARTED": {
      const profile = seatProfile(view, e.activeSeat);
      const text = t("log.turn", { n: e.turnNumber, name: seatName(view, e.activeSeat) });
      return [plain("turn", text, profile && { profile })];
    }
    // The white-dice sum (DICE_ROLLED) is not logged: the dice tray shows it.
    case "ACTION1_REVEALED":
      return e.decisions
        .filter((d) => d.decision.kind === "PASS")
        .map((d) => by(d.playerId, "pass", "log.passed"));
    case "MARKED":
      return [by(e.playerId, "mark", "log.marked", { color: e.color, number: e.number })];
    case "ACTION2_PASSED":
      return [by(e.playerId, "pass", "log.passed")];
    case "PENALTY":
      return [by(e.playerId, "penalty", "log.penalty")];
    case "ROW_LOCKED":
      return [plain("lock", t("log.locked", { color: colorName(e.color) }), { color: e.color })];
    case "GAME_ENDED":
      return [plain("over", t("log.gameOver"))];
    default:
      return [];
  }
}

/** Newest first. */
export function logLines(view: ViewMessage): LogLine[] {
  const out: LogLine[] = [];
  const events = view.game?.events ?? [];
  events.forEach((e, i) => {
    describeEvent(view, e).forEach((line, j) => {
      out.push({ id: i * 10 + j, ...line });
    });
  });
  return out.reverse();
}
