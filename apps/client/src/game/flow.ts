/** Pure helpers for the roll-off overlay (K4.1) and the lock popup (K4.2). */
import type { Color, GameEvent } from "@cd/engine";
import type { ViewMessage } from "@cd/protocol";
import { colorName, joinNames, t } from "../i18n";
import { seatName, seatOfPlayer } from "./model";

type RowLocked = Extract<GameEvent, { type: "ROW_LOCKED" }>;
type FirstChosen = Extract<GameEvent, { type: "FIRST_PLAYER_CHOSEN" }>;

export interface LockItem {
  id: number;
  color: Color;
  text: string;
}

/** "Ana locked the Red row!" / "You locked the Red row!" / "You and Ben locked …". */
export function lockMessage(view: ViewMessage, e: RowLocked): string {
  const me = view.you.seat;
  const mine = e.lockedBy.filter((id) => seatOfPlayer(id, view.game) === me);
  const others = e.lockedBy
    .filter((id) => seatOfPlayer(id, view.game) !== me)
    .map((id) => seatName(view, seatOfPlayer(id, view.game)));
  const names = [...(mine.length > 0 ? [t("lock.you")] : []), ...others];
  const color = colorName(e.color);
  if (others.length === 0 && mine.length > 0) return t("lock.byYou", { color });
  return t("lock.by", { names: joinNames(names), color });
}

/** The roll-off that decided who starts, while nobody has rolled yet (or null). */
export function rollOffEvent(view: ViewMessage): FirstChosen | null {
  const ev = view.game?.events ?? [];
  let i = -1;
  ev.forEach((e, k) => {
    if (e.type === "FIRST_PLAYER_CHOSEN") i = k;
  });
  const e = ev[i];
  if (!e || e.type !== "FIRST_PLAYER_CHOSEN" || e.method !== "ROLL_OFF" || e.rounds.length === 0) {
    return null;
  }
  return ev.slice(i).some((x) => x.type === "DICE_ROLLED") ? null : e;
}

/** Caption for one round: no 6, several 6s, or the unique 6 (the winner). */
export function roundCaption(view: ViewMessage, faces: readonly number[]): string {
  const sixes = faces.flatMap((f, seat) => (f === 6 ? [seat] : []));
  if (sixes.length === 0) return t("rolloff.none");
  if (sixes.length > 1) return t("rolloff.many", { n: sixes.length });
  return t("rolloff.winner", { name: seatName(view, sixes[0] as number) });
}
