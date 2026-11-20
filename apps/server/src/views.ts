/**
 * Per-socket views (C7). Every field is copied from an allow-list: password
 * hashes, token hashes and other seats' hidden Action 1 decisions never reach
 * a socket. The game part comes only from the engine's `viewFor(state, seat)`.
 */
import { type GameState, legalEarlyAction2Options, viewFor } from "@cd/engine";
import {
  defaultProfile,
  type ViewGame,
  type ViewMessage,
  type ViewRollOff,
  type ViewSeat,
  type ViewYou,
} from "@cd/protocol";
import { pausedSeatIds } from "./pause";
import { byJoinOrder, isOnline, playerId, seatIdOf } from "./room-lobby-ops";
import type { RollOffState, RoomMeta, SeatRecord } from "./room-store";

function viewSeats(seats: SeatRecord[], sockets: WebSocket[]): ViewSeat[] {
  return byJoinOrder(seats).map((s) => ({
    seatId: s.seatId,
    name: s.name,
    host: s.host,
    online: isOnline(sockets, s.seatId),
    away: s.away,
    left: s.left === true,
    profile: s.profile ?? defaultProfile(s.joinOrder),
    record: {
      wins: s.record?.wins ?? 0,
      ties: s.record?.ties ?? 0,
      losses: s.record?.losses ?? 0,
    },
  }));
}

function lobbyYou(seat: SeatRecord): ViewYou {
  return {
    seatId: seat.seatId,
    host: seat.host,
    seat: null,
    action1Decision: null,
    pendingAction2: null,
    legalAction1: [],
    legalAction2: [],
    canRoll: false,
    canUndo: false,
  };
}

/** ACTION_1: early Action 2 options (own seat only, K1.2); otherwise the engine's list. */
function legalAction2For(
  state: GameState,
  seatIndex: number,
  engineList: ViewYou["legalAction2"],
): ViewYou["legalAction2"] {
  if (state.phase !== "ACTION_1") return engineList;
  return legalEarlyAction2Options(state, playerId(seatIndex)).map((o) =>
    o.kind === "PASS"
      ? { kind: "PASS" }
      : { kind: "MARK", whiteDie: o.whiteDie, color: o.color, number: o.number },
  );
}

/** The view for one seat. `state` is null before the game starts. */
export function buildView(
  meta: RoomMeta,
  seats: SeatRecord[],
  state: GameState | null,
  seat: SeatRecord,
  sockets: WebSocket[],
  rollOff: RollOffState | null = null,
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
        decided: p.decided,
      })),
    };
    you = {
      seatId: seat.seatId,
      host: seat.host,
      seat: v.you.seat,
      action1Decision: v.you.action1Decision,
      // Own seat only (the engine view already hides it from everyone else).
      pendingAction2: v.you.pendingAction2,
      legalAction1: v.you.legalAction1,
      legalAction2: legalAction2For(state, seat.seatIndex, v.you.legalAction2),
      canRoll: v.you.canRoll,
      canUndo: v.you.canUndo,
    };
  }
  // During the roll-off the seat's index is public to its owner (no game state yet).
  if (rollOff && !state && seat.seatIndex !== null) you = { ...you, seat: seat.seatIndex };
  const ro: ViewRollOff | null =
    rollOff && !state
      ? {
          round: rollOff.round,
          rolled: rollOff.current.map((f) => f !== null),
          // D-L1: a seat's face is public as soon as it rolls (server dice, no strategy).
          faces: [...rollOff.current],
          completed: rollOff.completed.map((r) => [...r]),
        }
      : null;
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
    rollOff: ro,
    // T-NEW-3: seats holding the game up (offline, not left). Empty = not paused.
    pausedSeatIds: meta.status === "lobby" ? [] : pausedSeatIds(seats, sockets, state),
    you,
  };
}

/** Sends each open, authenticated socket the view for its own seat only. */
export function broadcastViews(
  sockets: WebSocket[],
  meta: RoomMeta,
  seats: SeatRecord[],
  state: GameState | null,
  rollOff: RollOffState | null = null,
): void {
  for (const ws of sockets) {
    if (ws.readyState !== WebSocket.OPEN) continue;
    const seatId = seatIdOf(ws);
    const seat = seatId === null ? undefined : seats.find((s) => s.seatId === seatId);
    if (!seat) continue;
    try {
      ws.send(JSON.stringify(buildView(meta, seats, state, seat, sockets, rollOff)));
    } catch {
      // socket is closing; ignore
    }
  }
}
