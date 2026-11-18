/**
 * Live play over the game socket (C6): auth, commands, setAway, rematch,
 * presence. GameRoom runs every handler inside its serial queue, and between
 * reading and writing state only storage calls are awaited.
 */
import {
  type Command,
  createGame,
  type DiceSource,
  dispatch,
  fromJSON,
  type GameState,
  toJSON,
} from "@cd/engine";
import {
  AWAY_AFTER_OFFLINE_MS,
  CLOSE,
  type ClientMessage,
  type ClientMessageType,
  type ErrorCode,
  type ErrorMessage,
  parseClientMessage,
} from "@cd/protocol";
import { autopass } from "./autopass";
import { hashToken, tokenHashEquals } from "./crypto";
import type { Env } from "./env";
import { isOnline, playerId } from "./room-lobby-ops";
import type { RoomMeta, RoomStore, SeatRecord } from "./room-store";
import { loadDice } from "./test-hooks";

/** Unauthenticated sockets older than this are closed with 4001. */
export const AUTH_TIMEOUT_MS = 10_000;
/** Invalid frames tolerated before closing with 4008. */
export const MAX_INVALID_FRAMES = 5;
/** Per-socket message cap: this many messages per window, then close 4008. */
export const MAX_MESSAGES = 30;
export const MESSAGE_WINDOW_MS = 10_000;

export interface PlayAttachment {
  seatId: string | null;
  openedAt: number;
  invalid: number;
  /** Start of the current message-rate window and its count. */
  winStart: number;
  winCount: number;
}

export function getAttachment(ws: WebSocket): PlayAttachment {
  try {
    const a = ws.deserializeAttachment() as Partial<PlayAttachment> | null;
    return {
      seatId: typeof a?.seatId === "string" ? a.seatId : null,
      openedAt: typeof a?.openedAt === "number" ? a.openedAt : 0,
      invalid: typeof a?.invalid === "number" ? a.invalid : 0,
      winStart: typeof a?.winStart === "number" ? a.winStart : 0,
      winCount: typeof a?.winCount === "number" ? a.winCount : 0,
    };
  } catch {
    return { seatId: null, openedAt: 0, invalid: 0, winStart: 0, winCount: 0 };
  }
}

function send(ws: WebSocket, msg: unknown): void {
  try {
    ws.send(JSON.stringify(msg));
  } catch {
    // socket is closing; ignore
  }
}

function sendError(
  ws: WebSocket,
  code: ErrorCode,
  command: ClientMessageType | null,
  reason?: string,
): void {
  const msg: ErrorMessage = { type: "error", code, command };
  if (reason !== undefined) msg.reason = reason;
  send(ws, msg);
}

/** Unbinds the seat (so no further views are sent) and closes. */
export function closeWith(ws: WebSocket, code: number, reason: string): void {
  try {
    ws.serializeAttachment({ ...getAttachment(ws), seatId: null });
    ws.close(code, reason);
  } catch {
    // already closed
  }
}

function endSession(ws: WebSocket): void {
  send(ws, { type: "sessionEnded" });
  closeWith(ws, CLOSE.SESSION_ENDED, "sessionEnded");
}

type PlayMsg = Extract<ClientMessage, { type: "roll" | "action1" | "action2" }>;

function toCommand(msg: PlayMsg, id: string): Command {
  switch (msg.type) {
    case "roll":
      return { type: "ROLL", playerId: id };
    case "action1":
      return {
        type: "ACTION1",
        playerId: id,
        decision: msg.kind === "PASS" ? { kind: "PASS" } : { kind: "MARK", color: msg.color },
      };
    case "action2":
      return {
        type: "ACTION2",
        playerId: id,
        decision:
          msg.kind === "PASS"
            ? { kind: "PASS" }
            : { kind: "MARK", whiteDie: msg.whiteDie, color: msg.color },
      };
  }
}

function awaySeats(seats: SeatRecord[]): Set<number> {
  const out = new Set<number>();
  for (const s of seats) if (s.away && s.seatIndex !== null) out.add(s.seatIndex);
  return out;
}

export interface PlayDeps {
  /** Read on every use so tests can swap the env. */
  env(): Env;
  storage: DurableObjectStorage;
  store: RoomStore;
  sockets(): WebSocket[];
  now(): number;
  /** Persist (version +1), re-arm the alarm, sync the lobby, broadcast views. */
  commit(meta: RoomMeta, seats: SeatRecord[], state?: string): Promise<void>;
  /** Send views to every authenticated socket without persisting anything. */
  broadcast(meta: RoomMeta, seats: SeatRecord[]): Promise<void>;
}

type Loaded = { meta: RoomMeta; seats: SeatRecord[]; me: SeatRecord };

export class RoomPlay {
  constructor(private readonly d: PlayDeps) {}

  /** New socket: unauthenticated until a valid `auth`. */
  open(ws: WebSocket): void {
    const a: PlayAttachment = {
      seatId: null,
      openedAt: this.d.now(),
      invalid: 0,
      winStart: 0,
      winCount: 0,
    };
    ws.serializeAttachment(a);
  }

  /** Closes unauthenticated sockets older than 10 s; returns the next deadline or null. */
  sweepUnauthed(): number | null {
    const now = this.d.now();
    let next: number | null = null;
    for (const ws of this.d.sockets()) {
      if (ws.readyState !== WebSocket.OPEN) continue;
      const a = getAttachment(ws);
      if (a.seatId !== null) continue;
      const deadline = a.openedAt + AUTH_TIMEOUT_MS;
      if (now > deadline) closeWith(ws, CLOSE.NOT_AUTHED, "auth timeout");
      else next = Math.min(next ?? Number.POSITIVE_INFINITY, deadline + 1);
    }
    return next;
  }

  async message(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    this.sweepUnauthed();
    if (ws.readyState !== WebSocket.OPEN) return;
    const att = getAttachment(ws);
    const now = this.d.now();
    if (now - att.winStart >= MESSAGE_WINDOW_MS) {
      att.winStart = now;
      att.winCount = 0;
    }
    att.winCount += 1;
    if (att.winCount > MAX_MESSAGES) {
      closeWith(ws, CLOSE.POLICY_VIOLATION, "rate");
      return;
    }
    ws.serializeAttachment(att);
    const msg = parseClientMessage(raw);
    if (att.seatId === null) {
      if (msg?.type === "auth") await this.auth(ws, att, msg.token);
      else closeWith(ws, CLOSE.NOT_AUTHED, "auth first");
      return;
    }
    if (!msg) {
      att.invalid += 1;
      ws.serializeAttachment(att);
      sendError(ws, "E_INVALID_COMMAND", null);
      if (att.invalid >= MAX_INVALID_FRAMES) closeWith(ws, CLOSE.POLICY_VIOLATION, "invalid");
      return;
    }
    switch (msg.type) {
      case "ping":
        send(ws, { type: "pong" });
        return;
      case "auth":
        sendError(ws, "E_INVALID_COMMAND", "auth", "already authenticated");
        return;
      case "roll":
      case "action1":
      case "action2":
        return this.command(ws, att.seatId, msg);
      case "setAway":
        return this.setAway(ws, att.seatId, msg.seatId, msg.away);
      case "rematch":
        return this.rematch(ws, att.seatId);
    }
  }

  /** Presence: remember when the seat was last connected, then broadcast. */
  async close(ws: WebSocket): Promise<void> {
    const seatId = getAttachment(ws).seatId;
    closeWith(ws, 1000, "bye");
    if (seatId === null) return;
    const meta = await this.d.store.getMeta();
    const seats = await this.d.store.getSeats();
    const seat = seats.find((s) => s.seatId === seatId);
    if (!meta || !seat) return;
    seat.lastSeenAt = this.d.now();
    await this.d.store.putSeatsQuiet(seats);
    await this.d.broadcast(meta, seats);
  }

  private async auth(ws: WebSocket, att: PlayAttachment, token: string): Promise<void> {
    // Hash before reading state.
    const hash = await hashToken(token);
    const meta = await this.d.store.getMeta();
    const seats = await this.d.store.getSeats();
    let me: SeatRecord | undefined;
    for (const s of seats) if (tokenHashEquals(s.tokenHash, hash)) me = s;
    if (!meta || !me) {
      endSession(ws);
      return;
    }
    ws.serializeAttachment({ ...att, seatId: me.seatId });
    // Presence only: no version/lastActivityAt bump, no persist (lastSeenAt is saved on close).
    await this.d.broadcast(meta, seats); // this socket gets its view, everyone presence
  }

  /** Loads meta + seats and this socket's seat; ends the session if it is gone. */
  private async load(ws: WebSocket, seatId: string): Promise<Loaded | null> {
    const meta = await this.d.store.getMeta();
    const seats = await this.d.store.getSeats();
    const me = seats.find((s) => s.seatId === seatId);
    if (!meta || !me) {
      endSession(ws);
      return null;
    }
    return { meta, seats, me };
  }

  private async loadState(): Promise<GameState | null> {
    const raw = await this.d.store.getState();
    return raw === undefined ? null : fromJSON(raw);
  }

  /** Runs autopass, updates status/finishedAt and commits. */
  private async save(
    meta: RoomMeta,
    seats: SeatRecord[],
    state: GameState,
    dice: { dice: DiceSource; save(): Promise<void> },
  ): Promise<void> {
    const next = autopass(state, awaySeats(seats), dice.dice);
    if (next.phase === "GAME_OVER") {
      if (meta.status !== "finished") {
        meta.status = "finished";
        meta.finishedAt = this.d.now();
      }
    } else {
      meta.status = "playing";
      meta.finishedAt = null;
    }
    await dice.save();
    await this.d.commit(meta, seats, toJSON(next));
  }

  private async command(ws: WebSocket, seatId: string, msg: PlayMsg): Promise<void> {
    const l = await this.load(ws, seatId);
    if (!l) return;
    const state = await this.loadState();
    if (!state || l.meta.status === "lobby" || l.me.seatIndex === null) {
      return sendError(ws, "E_WRONG_PHASE", msg.type);
    }
    if (state.phase === "GAME_OVER") return sendError(ws, "E_GAME_OVER", msg.type);
    if (msg.turn !== state.turn?.turnNumber) return sendError(ws, "E_STALE_TURN", msg.type);
    const dice = await loadDice(this.d.env(), this.d.storage);
    const r = dispatch(state, toCommand(msg, playerId(l.me.seatIndex)), dice.dice);
    if (!r.ok) return sendError(ws, r.error.code, msg.type, r.error.reason);
    await this.save(l.meta, l.seats, r.state, dice);
  }

  /** D3: host marks an offline (≥ 2 min) seat away; host or the seat itself clears it. */
  private async setAway(ws: WebSocket, seatId: string, target: string, away: boolean) {
    const l = await this.load(ws, seatId);
    if (!l) return;
    const seat = l.seats.find((s) => s.seatId === target);
    if (!seat) return sendError(ws, "E_INVALID_COMMAND", "setAway", "unknown seat");
    if (l.meta.status === "lobby") return sendError(ws, "E_WRONG_PHASE", "setAway");
    if (away) {
      if (!l.me.host) return sendError(ws, "E_NOT_HOST", "setAway");
      const offline = !isOnline(this.d.sockets(), seat.seatId);
      if (!offline || this.d.now() - seat.lastSeenAt < AWAY_AFTER_OFFLINE_MS) {
        return sendError(ws, "E_TOO_SOON", "setAway");
      }
    } else if (!l.me.host && l.me.seatId !== seat.seatId) {
      return sendError(ws, "E_NOT_HOST", "setAway");
    }
    if (seat.away === away) return;
    seat.away = away;
    const state = await this.loadState();
    if (!state) return this.d.commit(l.meta, l.seats);
    const dice = await loadDice(this.d.env(), this.d.storage);
    await this.save(l.meta, l.seats, state, dice);
  }

  /** Host only, at GAME_OVER: a new game with the same seats and seat indexes. */
  private async rematch(ws: WebSocket, seatId: string): Promise<void> {
    const l = await this.load(ws, seatId);
    if (!l) return;
    if (!l.me.host) return sendError(ws, "E_NOT_HOST", "rematch");
    const state = await this.loadState();
    if (!state || state.phase !== "GAME_OVER") return sendError(ws, "E_WRONG_PHASE", "rematch");
    const ordered = l.seats
      .filter((s): s is SeatRecord & { seatIndex: number } => s.seatIndex !== null)
      .sort((a, b) => a.seatIndex - b.seatIndex);
    const dice = await loadDice(this.d.env(), this.d.storage);
    const res = createGame(
      ordered.map((s) => ({ id: playerId(s.seatIndex), displayName: s.name })),
      { dice: dice.dice },
    );
    if (!res.ok) return sendError(ws, res.error.code, "rematch");
    await this.save(l.meta, l.seats, res.state, dice);
  }
}
