/** Small view-derived helpers shared by the game screen components. */
import type { Color } from "@cd/engine";
import type {
  FullViewPlayer,
  ViewGame,
  ViewMessage,
  ViewPlayer,
  ViewRow,
  ViewSeat,
} from "@cd/protocol";
import { t, tn } from "../i18n";

export const COLORS: readonly Color[] = ["RED", "YELLOW", "GREEN", "BLUE"];
export const cssColor = (c: Color): string => c.toLowerCase();

/** The server names engine players `seat-<index>`. */
export const playerIdOf = (seat: number): string => `seat-${seat}`;

/** Seat index of an engine player id, or -1. */
export function seatOfPlayer(id: string, game?: ViewGame | null): number {
  const m = /^seat-(\d+)$/.exec(id);
  if (m) return Number(m[1]);
  return game?.players.find((p) => p.seatId === id)?.seat ?? -1;
}

/** Display name for an engine seat index (names always come from `view.seats`). */
export function seatName(view: ViewMessage, seat: number): string {
  const player = view.game?.players.find((p) => p.seat === seat);
  const s = player ? view.seats.find((x) => x.seatId === player.seatId) : undefined;
  return s?.name ?? t("player.fallback", { n: seat + 1 });
}

export function seatProfile(view: ViewMessage, seat: number): ViewSeat["profile"] {
  const player = view.game?.players.find((p) => p.seat === seat);
  return view.seats.find((s) => s.seatId === player?.seatId)?.profile;
}

export function seatInfo(view: ViewMessage, p: ViewPlayer): ViewSeat | undefined {
  return view.seats.find((s) => s.seatId === p.seatId);
}

/** A player entry whose card was sent (yours, or anyone's at GAME_OVER). */
export function hasCard(p: ViewPlayer): p is FullViewPlayer {
  return p.sheet !== null && p.score.rows !== null;
}

export function youPlayer(view: ViewMessage): FullViewPlayer | null {
  const seat = view.you.seat;
  const p = view.game?.players.find((x) => x.seat === seat);
  return p && hasCard(p) ? p : null;
}

export function opponents(view: ViewMessage): ViewPlayer[] {
  const seat = view.you.seat;
  return (view.game?.players ?? []).filter((p) => p.seat !== seat);
}

export function markCount(row: ViewRow): number {
  return row.marked.filter(Boolean).length;
}

export const boxKey = (color: Color, number: number): string => `${color}:${number}`;

/** "2–1–0" (wins–ties–losses). */
export function recordText(r: { wins: number; ties: number; losses: number }): string {
  return `${r.wins}–${r.ties}–${r.losses}`;
}

/** Screen-reader spelling of a record: "2 wins, 1 tie, 0 losses". */
export function recordLabel(r: { wins: number; ties: number; losses: number }): string {
  return [tn("record.wins", r.wins), tn("record.ties", r.ties), tn("record.losses", r.losses)].join(
    ", ",
  );
}

/** Seats sharing the highest total (the engine's `winners`), as a tie/win summary. */
export function tieInfo(view: ViewMessage): {
  winnerSeats: number[];
  tie: boolean;
  allTied: boolean;
} {
  const g = view.game;
  const winnerSeats = (g?.winners ?? []).map((id) => seatOfPlayer(id, g));
  const tie = winnerSeats.length > 1;
  return {
    winnerSeats,
    tie,
    allTied: tie && winnerSeats.length === (g?.players.length ?? 0),
  };
}
