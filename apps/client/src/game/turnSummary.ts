/** T-NEW-12: what every player did last turn, built only from events already in the view. */
import type { Color, GameEvent } from "@cd/engine";
import type { Profile, ViewMessage } from "@cd/protocol";
import { seatName, seatOfPlayer, seatProfile } from "./model";

type Face = 1 | 2 | 3 | 4 | 5 | 6;

export interface SummaryDie {
  color: "WHITE" | Color;
  face: Face;
}
export interface SummaryMark {
  action: 1 | 2;
  color: Color;
  number: number;
  index: number;
  /** The dice that made the number (white pair, or one white + the coloured die). */
  dice: SummaryDie[];
}
export interface SummaryPlayer {
  seat: number;
  name: string;
  profile?: Profile;
  marks: SummaryMark[];
  penalty: boolean;
  locks: Color[];
}
export interface TurnSummary {
  turn: number;
  players: SummaryPlayer[];
}

/** Summary of the turn that just ended, or null when `fresh` holds no new turn boundary. */
export function summarizeTurn(view: ViewMessage, fresh: readonly GameEvent[]): TurnSummary | null {
  const g = view.game;
  if (!g || !fresh.some((e) => e.type === "TURN_STARTED")) return null;
  const all = g.events;
  let end = -1;
  let start = -1;
  for (let i = all.length - 1; i >= 0; i--) {
    if ((all[i] as GameEvent).type !== "TURN_STARTED") continue;
    if (end < 0) end = i;
    else {
      start = i;
      break;
    }
  }
  if (start < 0) return null;
  const turnEvent = all[start] as Extract<GameEvent, { type: "TURN_STARTED" }>;
  const evs = all.slice(start + 1, end);
  let roll: Extract<GameEvent, { type: "DICE_ROLLED" }> | null = null;
  const by = new Map<number, SummaryPlayer>();
  const entry = (id: string): SummaryPlayer | null => {
    const seat = seatOfPlayer(id, g);
    if (seat < 0) return null;
    let p = by.get(seat);
    if (!p) {
      p = { seat, name: seatName(view, seat), marks: [], penalty: false, locks: [] };
      const prof = seatProfile(view, seat);
      if (prof) p.profile = prof;
      by.set(seat, p);
    }
    return p;
  };
  for (const e of evs) {
    if (e.type === "DICE_ROLLED") roll = e;
    else if (e.type === "MARKED") {
      const p = entry(e.playerId);
      if (!p || !roll) continue;
      const dice: SummaryDie[] =
        e.action === 1 || e.whiteDie === undefined
          ? roll.white.map((face) => ({ color: "WHITE" as const, face }))
          : [{ color: "WHITE", face: roll.white[e.whiteDie] }];
      const cf = roll.colored[e.color];
      if (e.action === 2 && cf) dice.push({ color: e.color, face: cf });
      p.marks.push({ action: e.action, color: e.color, number: e.number, index: e.index, dice });
    } else if (e.type === "UNDO" && e.kind === "MARK") {
      const p = entry(e.playerId);
      if (!p) continue;
      for (let i = p.marks.length - 1; i >= 0; i--) {
        const m = p.marks[i] as SummaryMark;
        if (m.color === e.color && m.index === e.index) {
          p.marks.splice(i, 1);
          break;
        }
      }
    } else if (e.type === "PENALTY") {
      const p = entry(e.playerId);
      if (p) p.penalty = true;
    } else if (e.type === "ROW_LOCKED") {
      for (const id of e.lockedBy) {
        const p = entry(id);
        if (p && !p.locks.includes(e.color)) p.locks.push(e.color);
      }
    }
  }
  if (!roll) return null;
  const players: SummaryPlayer[] = [...g.players]
    .sort((a, b) => a.seat - b.seat)
    .map((p) => by.get(p.seat) ?? entry(p.seatId))
    .filter((p): p is SummaryPlayer => p !== null);
  // Active player first, the rest in seat order (stable sort keeps ties in seat order).
  players.sort(
    (a, b) => Number(b.seat === turnEvent.activeSeat) - Number(a.seat === turnEvent.activeSeat),
  );
  return { turn: turnEvent.turnNumber, players };
}
