/**
 * Pure helpers for GameRoom lobby operations (C4/C5): results, public entry,
 * host transfer, presence, alarm times. No storage or I/O here.
 */
import {
  ABANDONED_ROOM_MS,
  type ErrorCode,
  FINISHED_ROOM_TTL_MS,
  IDLE_ROOM_TTL_MS,
  type PublicGame,
} from "@cd/protocol";
import type { RoomMeta, SeatRecord } from "./room-store";

export type Fail = { ok: false; status: number; code: ErrorCode; reason?: string };
export type Ok<T> = { ok: true; value: T };
export type OpResult<T> = Ok<T> | Fail;

export const ok = <T>(value: T): Ok<T> => ({ ok: true, value });
export const fail = (status: number, code: ErrorCode, reason?: string): Fail =>
  reason === undefined ? { ok: false, status, code } : { ok: false, status, code, reason };

/** Same body for unknown code, lockout and wrong password (C4). */
export const BAD_CREDENTIALS: Fail = fail(401, "E_BAD_CREDENTIALS");
/** Missing/invalid Bearer token, or a room that no longer exists. */
export const NOT_AUTHED: Fail = fail(401, "E_NOT_AUTHED");
export const NOT_HOST: Fail = fail(403, "E_NOT_HOST");
export const NOT_IN_LOBBY: Fail = fail(409, "E_NOT_IN_LOBBY");

/** Name of the single Lobby DO instance (C2). */
export const LOBBY_NAME = "main";

/** What the room tells the Lobby. Only the public room shape is needed. */
export interface LobbySync {
  upsert(entry: PublicGame): Promise<void>;
  remove(code: string): Promise<void>;
}

/** WebSocket attachment written by the game socket (T11). */
export interface SocketAttachment {
  seatId?: string;
}

/** Engine PlayerId for a started seat. */
export const playerId = (seatIndex: number): string => `seat-${seatIndex}`;

export function sameName(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

export function findByName(seats: SeatRecord[], name: string): SeatRecord | undefined {
  return seats.find((s) => sameName(s.name, name));
}

/** Seats sorted by joinOrder (copy). */
export function byJoinOrder(seats: SeatRecord[]): SeatRecord[] {
  return [...seats].sort((a, b) => a.joinOrder - b.joinOrder);
}

/**
 * Removes `seatId`. If it was the host, the remaining seat with the lowest
 * joinOrder becomes host. Returns the new list (possibly empty).
 */
export function removeSeat(seats: SeatRecord[], seatId: string): SeatRecord[] {
  const gone = seats.find((s) => s.seatId === seatId);
  const rest = byJoinOrder(seats.filter((s) => s.seatId !== seatId));
  if (gone?.host && rest.length > 0 && !rest.some((s) => s.host)) {
    (rest[0] as SeatRecord).host = true;
  }
  return rest;
}

/**
 * In-game leave (K2.2): the seat is marked left + away (auto-passed) and its token
 * stops working. A leaving host hands the flag to the next present seat by joinOrder.
 * Mutates `seats`; returns true when every seat has now left.
 */
export function markLeft(seats: SeatRecord[], seatId: string): boolean {
  const me = seats.find((s) => s.seatId === seatId);
  if (!me) return false;
  me.left = true;
  me.away = true;
  me.tokenHash = "";
  if (me.host) {
    const next = byJoinOrder(seats).find((s) => !s.left);
    if (next) {
      me.host = false;
      next.host = true;
    }
  }
  return seats.every((s) => s.left);
}

export function seatIdOf(ws: WebSocket): string | null {
  try {
    const a = ws.deserializeAttachment() as SocketAttachment | null;
    return typeof a?.seatId === "string" ? a.seatId : null;
  } catch {
    return null;
  }
}

/** Presence is never stored (C1): online = an open socket bound to the seat. */
export function isOnline(sockets: WebSocket[], seatId: string): boolean {
  return sockets.some((ws) => ws.readyState === WebSocket.OPEN && seatIdOf(ws) === seatId);
}

/** True while any open socket is bound to a seat. */
export function hasAuthedSocket(sockets: WebSocket[]): boolean {
  return sockets.some((ws) => ws.readyState === WebSocket.OPEN && seatIdOf(ws) !== null);
}

/** K2.2: last sign of life (HTTP change or a seat's last socket) + 30 min. */
export function abandonedAt(meta: RoomMeta, seats: SeatRecord[]): number {
  return Math.max(meta.lastActivityAt, ...seats.map((s) => s.lastSeenAt)) + ABANDONED_ROOM_MS;
}

/** Explicit allow-list (C2): null when the room must not be listed. No player names (K2.3). */
export function publicEntry(meta: RoomMeta, seats: SeatRecord[]): PublicGame | null {
  if (!meta.listed || meta.status !== "lobby" || seats.length >= meta.maxPlayers) return null;
  if (seats.length === 0) return null;
  return {
    code: meta.code,
    roomName: meta.roomName,
    players: seats.length,
    maxPlayers: meta.maxPlayers,
    createdAt: meta.createdAt,
  };
}

/** min(lastActivity + 7 d, finishedAt + 24 h). */
export function expiresAt(meta: RoomMeta): number {
  const idle = meta.lastActivityAt + IDLE_ROOM_TTL_MS;
  return meta.finishedAt === null ? idle : Math.min(idle, meta.finishedAt + FINISHED_ROOM_TTL_MS);
}
