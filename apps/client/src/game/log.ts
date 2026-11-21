/** Move log lines from engine events (names and avatars from view.seats). */
import type { Color, GameEvent } from "@cd/engine";
import type { Profile, ViewMessage } from "@cd/protocol";
import { colorName, t } from "../i18n";
import { seatName, seatOfPlayer, seatProfile } from "./model";

export interface TurnActor {
  seat: number;
  name: string;
  profile?: Profile;
  marks: { color: Color; number: number }[];
  passed: boolean;
  penalty: boolean;
  locks: Color[];
}

export interface LogLine {
  id: number;
  /** Full sentence: screen readers and e2e helpers read this. */
  text: string;
  kind: "turn";
  turn: number;
  actors: TurnActor[];
  /** Typewriter text. */
  typed: string;
}

/** Newest first. */
export function logLines(view: ViewMessage): LogLine[] {
  const out: LogLine[] = [];
  const g = view.game;
  if (!g) return out;
  const starts = g.events
    .map((e, i) => ({ e, i }))
    .filter((x): x is { e: Extract<GameEvent, { type: "TURN_STARTED" }>; i: number } => {
      return x.e.type === "TURN_STARTED";
    });
  if (starts.length < 2) return out;
  const actor = (playerId: string): TurnActor | null => {
    const seat = seatOfPlayer(playerId, g);
    if (seat < 0) return null;
    return {
      seat,
      name: seatName(view, seat),
      profile: seatProfile(view, seat),
      marks: [],
      passed: false,
      penalty: false,
      locks: [],
    };
  };
  const lineText = (turn: number, actors: TurnActor[]): string => {
    const actionSep = t("log.turnActionSep");
    const actorSep = t("log.turnActorSep");
    const describe = (a: TurnActor) => {
      const parts = [
        ...a.marks.map((m) => t("summary.mark", { color: colorName(m.color), n: m.number })),
        ...(a.passed ? [t("summary.none")] : []),
        ...(a.penalty ? [t("summary.penalty")] : []),
        ...a.locks.map((c) => t("summary.lock", { color: colorName(c) })),
      ];
      return t("log.turnActor", { name: a.name, actions: parts.join(actionSep) });
    };
    return t("log.turnLine", { n: turn, entries: actors.map(describe).join(actorSep) });
  };
  for (let s = 0; s < starts.length - 1; s++) {
    const start = starts[s] as { e: Extract<GameEvent, { type: "TURN_STARTED" }>; i: number };
    const next = starts[s + 1] as { e: Extract<GameEvent, { type: "TURN_STARTED" }>; i: number };
    const segment = g.events.slice(start.i + 1, next.i);
    const bySeat = new Map<number, TurnActor>();
    const ensure = (playerId: string) => {
      const nextActor = actor(playerId);
      if (!nextActor) return null;
      const found = bySeat.get(nextActor.seat);
      if (found) return found;
      bySeat.set(nextActor.seat, nextActor);
      return nextActor;
    };
    for (const e of segment) {
      switch (e.type) {
        case "ACTION1_REVEALED":
          for (const d of e.decisions) {
            if (d.decision.kind !== "PASS") continue;
            const p = ensure(d.playerId);
            if (p) p.passed = true;
          }
          break;
        case "MARKED": {
          const p = ensure(e.playerId);
          if (p) p.marks.push({ color: e.color, number: e.number });
          break;
        }
        case "UNDO": {
          if (e.kind !== "MARK") break;
          const p = ensure(e.playerId);
          if (!p) break;
          for (let i = p.marks.length - 1; i >= 0; i--) {
            const m = p.marks[i] as { color: Color; number: number };
            if (m.color === e.color) {
              p.marks.splice(i, 1);
              break;
            }
          }
          break;
        }
        case "ACTION2_PASSED": {
          const p = ensure(e.playerId);
          if (p) p.passed = true;
          break;
        }
        case "PENALTY": {
          const p = ensure(e.playerId);
          if (p) p.penalty = true;
          break;
        }
        case "ROW_LOCKED":
          for (const id of e.lockedBy) {
            const p = ensure(id);
            if (p && !p.locks.includes(e.color)) p.locks.push(e.color);
          }
          break;
      }
    }
    const actors = [...bySeat.values()]
      .sort((a, b) => a.seat - b.seat)
      .sort(
        (a, b) => Number(b.seat === start.e.activeSeat) - Number(a.seat === start.e.activeSeat),
      );
    if (actors.length === 0) continue;
    const text = lineText(start.e.turnNumber, actors);
    out.push({
      id: start.i * 10,
      kind: "turn",
      turn: start.e.turnNumber,
      actors,
      text,
      typed: text,
    });
  }
  return out.reverse();
}
