/**
 * Automatic pause (T-NEW-3). A game in progress (or its opening roll-off) is paused while any
 * seat that has not left has no open, authenticated socket. Nothing advances while paused:
 * no rolls or actions, no auto-pass, no penalties. It resumes by itself once every such seat
 * has reconnected and authenticated. Presence is derived from sockets, never stored.
 */
import type { GameState } from "@cd/engine";
import { isOnline } from "./room-lobby-ops";
import type { SeatRecord } from "./room-store";

/** Seat ids that hold the game up; empty = not paused. `state` null = lobby or roll-off. */
export function pausedSeatIds(
  seats: SeatRecord[],
  sockets: WebSocket[],
  state: GameState | null,
): string[] {
  if (state?.phase === "GAME_OVER") return [];
  return seats
    .filter(
      (s) => s.kind !== "cpu" && s.seatIndex !== null && !s.left && !isOnline(sockets, s.seatId),
    )
    .map((s) => s.seatId);
}
