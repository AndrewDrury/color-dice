/**
 * Per-socket views (C7). Every field is copied from an allow-list: password
 * hashes, token hashes and other seats' hidden Action 1 decisions never reach
 * a socket. The game part comes only from the engine's `viewFor(state, seat)`.
 */
import { type GameState, viewFor } from "@cd/engine";
import type { ViewGame, ViewMessage, ViewSeat, ViewYou } from "@cd/protocol";
import { byJoinOrder, isOnline, seatIdOf } from "./room-lobby-ops";
import type { RoomMeta, SeatRecord } from "./room-store";

function viewSeats(seats: SeatRecord[], sockets: WebSocket[]): ViewSeat[] {
  return byJoinOrder(seats).map((s) => ({
    seatId: s.seatId,
    name: s.name,
    host: s.host,
    online: isOnline(sockets, s.seatId),
    away: s.away,
    record: { wins: s.record?.wins ?? 0, losses: s.record?.losses ?? 0 },
  }));
}

function lobbyYou(seat: SeatRecord): ViewYou {
  return {
    seatId: seat.seatId,
    host: seat.host,
    seat: null,
    action1Decision: null,
    legalAction1: [],
    legalAction2: [],
    canRoll: false,
  };
}

/** The view for one seat. `state` is null before the game starts. */
export function buildView(
  meta: RoomMeta,
  seats: SeatRecord[],
  state: GameState | null,
  seat: SeatRecord,
  sockets: WebSocket[],
): ViewMessage {
  let game: ViewGame | null = null;
  let you = lobbyYou(seat);
  if (state && seat.seatIndex !== null) {
    const v = viewFor(state, seat.seatIndex);
    const idBySeat = new Map(seats.map((s) => [s.seatIndex, s.seatId]));
    const g = v.game;
    game = {
      phase: g.phase,
      turn: g.turn,
      roll: g.roll,
      lockedColors: g.lockedColors,
      events: g.events,
      endReason: g.endReason,
      winners: g.winners,
      players: v.game.players.map((p) => ({
        seat: p.seat,
        seatId: idBySeat.get(p.seat) ?? "",
        sheet: p.sheet,
        score: p.score,
        action1Submitted: p.action1Submitted,
      })),
    };
    you = {
      seatId: seat.seatId,
      host: seat.host,
      seat: v.you.seat,
      action1Decision: v.you.action1Decision,
      legalAction1: v.you.legalAction1,
      legalAction2: v.you.legalAction2,
      canRoll: v.you.canRoll,
    };
  }
  return {
    type: "view",
    version: meta.version,
    code: meta.code,
    room: {
      name: meta.roomName,
      listed: meta.listed,
      maxPlayers: meta.maxPlayers,
      status: meta.status,
      // Lockout warnings are for the host only.
      joinLockedUntil: seat.host ? meta.joinLockedUntil : null,
    },
    seats: viewSeats(seats, sockets),
    game,
    you,
  };
}

/** Sends each open, authenticated socket the view for its own seat only. */
export function broadcastViews(
  sockets: WebSocket[],
  meta: RoomMeta,
  seats: SeatRecord[],
  state: GameState | null,
): void {
  for (const ws of sockets) {
    if (ws.readyState !== WebSocket.OPEN) continue;
    const seatId = seatIdOf(ws);
    const seat = seatId === null ? undefined : seats.find((s) => s.seatId === seatId);
    if (!seat) continue;
    try {
      ws.send(JSON.stringify(buildView(meta, seats, state, seat, sockets)));
    } catch {
      // socket is closing; ignore
    }
  }
}
