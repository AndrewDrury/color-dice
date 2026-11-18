import type { Color } from "@cd/engine";
import type { FullViewPlayer, ViewMessage, ViewPlayer, ViewRow } from "@cd/protocol";

export const CODE = "K7QF2";
const NAMES = ["Andrew", "Cleo", "Dev", "Ria", "Sam"];
export const seatIdOf = (i: number) => `seat${String(i).padStart(4, "0")}`.slice(0, 8);

const emptyRow = (): ViewRow => ({ marked: Array(11).fill(false), lockCrossed: false });

export function player(seat: number, over: Partial<FullViewPlayer> = {}): FullViewPlayer {
  const rows = { RED: emptyRow(), YELLOW: emptyRow(), GREEN: emptyRow(), BLUE: emptyRow() };
  return {
    seat,
    seatId: seatIdOf(seat),
    sheet: { rows, penalties: 0 },
    score: { rows: { RED: 0, YELLOW: 0, GREEN: 0, BLUE: 0 }, penalties: 0, total: 0 },
    action1Submitted: false,
    ...over,
  };
}

/** What the server sends for another seat before GAME_OVER (J1). */
export function hide(p: ViewPlayer): ViewPlayer {
  return { ...p, sheet: null, score: { ...p.score, rows: null } };
}

export function mark(p: FullViewPlayer, color: Color, index: number): FullViewPlayer {
  const rows = { ...p.sheet.rows, [color]: { ...p.sheet.rows[color] } };
  rows[color].marked = rows[color].marked.map((v, i) => v || i === index);
  const n = rows[color].marked.filter(Boolean).length;
  const rowScore = (n * (n + 1)) / 2;
  const score = { ...p.score, rows: { ...p.score.rows, [color]: rowScore } };
  score.total = Object.values(score.rows).reduce((a, b) => a + b, 0) + score.penalties;
  return { ...p, sheet: { ...p.sheet, rows }, score };
}

export interface Opts {
  version?: number;
  players?: number;
  phase?: "AWAIT_ROLL" | "ACTION_1" | "ACTION_2" | "GAME_OVER";
  active?: number;
  you?: number;
  roll?: boolean;
  /** Full cards; opponents are redacted before GAME_OVER like the server does. */
  gamePlayers?: FullViewPlayer[];
  legal1?: Color[];
  legal2?: { whiteDie: 0 | 1; color: Color; number: number }[];
  pass1?: boolean;
  pass2?: boolean;
  canRoll?: boolean;
  lockedColors?: Color[];
  events?: unknown[];
  winners?: string[] | null;
  endReason?: unknown;
  decision?: boolean;
  host?: boolean;
}

export function makeGameView(o: Opts = {}): ViewMessage {
  const n = o.players ?? 3;
  const you = o.you ?? 0;
  const phase = o.phase ?? "ACTION_1";
  const full = o.gamePlayers ?? Array.from({ length: n }, (_, i) => player(i));
  const players = full.map((p) => (phase === "GAME_OVER" || p.seat === you ? p : hide(p)));
  const roll =
    o.roll === false || phase === "AWAIT_ROLL"
      ? null
      : {
          white: [3, 5] as [3, 5],
          colored: { RED: 2, YELLOW: 4, GREEN: 6, BLUE: 1 } as Partial<
            Record<Color, 1 | 2 | 3 | 4 | 5 | 6>
          >,
          whiteSum: 8,
        };
  return {
    type: "view",
    version: o.version ?? 5,
    code: CODE,
    room: {
      name: "Friday dice",
      listed: true,
      maxPlayers: 5,
      status: "playing",
      joinLockedUntil: null,
    },
    seats: Array.from({ length: n }, (_, i) => ({
      seatId: seatIdOf(i),
      name: NAMES[i] as string,
      host: i === 0,
      online: true,
      away: false,
      left: false,
      record: { wins: 0, ties: 0, losses: 0 },
    })),
    game: {
      phase,
      turn: { number: 9, activeSeat: o.active ?? 0 },
      roll,
      lockedColors: o.lockedColors ?? [],
      players,
      events: (o.events ?? []) as never,
      endReason: (o.endReason ?? null) as never,
      winners: o.winners ?? null,
    },
    you: {
      seatId: seatIdOf(you),
      host: o.host ?? you === 0,
      seat: you,
      action1Decision: o.decision ? { kind: "PASS" } : null,
      pendingAction2: null,
      legalAction1: [
        ...(o.legal1 ?? []).map((color) => ({ kind: "MARK" as const, color })),
        ...(o.pass1 === false ? [] : phase === "ACTION_1" ? [{ kind: "PASS" as const }] : []),
      ],
      legalAction2: [
        ...(o.legal2 ?? []).map((a) => ({ kind: "MARK" as const, ...a })),
        ...(o.pass2 === false ? [] : phase === "ACTION_2" ? [{ kind: "PASS" as const }] : []),
      ],
      canRoll: o.canRoll ?? false,
    },
  };
}
