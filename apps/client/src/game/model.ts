/** Small view-derived helpers shared by the game screen components. */
import type { Color } from "@cd/engine";
import type { ViewGame, ViewMessage, ViewPlayer, ViewRow, ViewSeat } from "@cd/protocol";

export const COLORS: readonly Color[] = ["RED", "YELLOW", "GREEN", "BLUE"];
export const COLOR_NAME: Readonly<Record<Color, string>> = {
  RED: "Red",
  YELLOW: "Yellow",
  GREEN: "Green",
  BLUE: "Blue",
};
export const COLOR_LETTER: Readonly<Record<Color, string>> = {
  RED: "R",
  YELLOW: "Y",
  GREEN: "G",
  BLUE: "B",
};
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
  return s?.name ?? `Player ${seat + 1}`;
}

export function seatInfo(view: ViewMessage, p: ViewPlayer): ViewSeat | undefined {
  return view.seats.find((s) => s.seatId === p.seatId);
}

export function youPlayer(view: ViewMessage): ViewPlayer | null {
  const seat = view.you.seat;
  return view.game?.players.find((p) => p.seat === seat) ?? null;
}

export function opponents(view: ViewMessage): ViewPlayer[] {
  const seat = view.you.seat;
  return (view.game?.players ?? []).filter((p) => p.seat !== seat);
}

export function markCount(row: ViewRow): number {
  return row.marked.filter(Boolean).length;
}

export const boxKey = (color: Color, number: number): string => `${color}:${number}`;

export function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}
