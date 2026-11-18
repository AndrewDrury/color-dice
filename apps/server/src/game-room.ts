import { DurableObject } from "cloudflare:workers";
import { CryptoDice, createGame, type DiceSource, ScriptedDice, toJSON } from "@cd/engine";
import {
  type AuthRes,
  CLOSE,
  LOCKOUT_FAILED_ATTEMPTS,
  LOCKOUT_MS,
  type MaxPlayers,
  type MeRes,
  MIN_PLAYERS,
  TokenSchema,
} from "@cd/protocol";
import {
  hashPassword,
  hashToken,
  iterationsFromEnv,
  newSeatId,
  newToken,
  tokenHashEquals,
  verifyPassword,
} from "./crypto";
import type { Env } from "./env";
import { error } from "./http";
import {
  BAD_CREDENTIALS,
  expiresAt,
  fail,
  findByName,
  isOnline,
  LOBBY_NAME,
  type LobbySync,
  NOT_AUTHED,
  NOT_HOST,
  NOT_IN_LOBBY,
  type OpResult,
  ok,
  playerId,
  publicEntry,
  removeSeat,
  seatIdOf,
} from "./room-lobby-ops";
import { type RoomMeta, RoomStore, type SeatRecord } from "./room-store";

export interface InitInput {
  code: string;
  roomName: string;
  name: string;
  password: string;
  maxPlayers: MaxPlayers;
  listed: boolean;
}

export interface PatchInput {
  roomName?: string;
  listed?: boolean;
  password?: string;
}

/** Fixed salt for the dummy PBKDF2 run that equalizes failure timing (never matches). */
const DUMMY_SALT_B64 = "AAAAAAAAAAAAAAAAAAAAAA==";

type Authed = { meta: RoomMeta; seats: SeatRecord[]; me: SeatRecord };

/**
 * One instance per game code. The Worker calls the public async methods via RPC
 * (rooms, passwords, sessions, start); gameplay sockets arrive in T11.
 */
export class GameRoom extends DurableObject<Env> {
  private readonly store: RoomStore;
  /** Serializes operations: PBKDF2 awaits are not storage ops, so input gates don't cover them. */
  private queue: Promise<unknown> = Promise.resolve();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.store = new RoomStore(ctx.storage);
  }

  /** Test seam: the clock. */
  protected now(): number {
    return Date.now();
  }

  /** Test seam: the lobby. */
  protected lobby(): LobbySync {
    return this.env.LOBBY.get(this.env.LOBBY.idFromName(LOBBY_NAME));
  }

  /** Hook for T11: send per-seat views to sockets. No-op for now. */
  protected broadcast(): void {}

  override async fetch(_request: Request): Promise<Response> {
    // Game sockets are implemented in T11.
    return error("E_NOT_IMPLEMENTED", 501);
  }

  /* ---------------- RPC ---------------- */

  async isFree(): Promise<boolean> {
    return (await this.store.getMeta()) === undefined;
  }

  /** Creates the room with the creator as host. Refuses if the code is taken. */
  init(input: InitInput): Promise<OpResult<AuthRes>> {
    return this.serial(async () => {
      if (await this.store.getMeta()) return fail(409, "E_INVALID_COMMAND", "code taken");
      const now = this.now();
      const pwd = await hashPassword(input.password, iterationsFromEnv(this.env));
      const meta: RoomMeta = {
        code: input.code,
        roomName: input.roomName,
        listed: input.listed,
        maxPlayers: input.maxPlayers,
        status: "lobby",
        pwd,
        failedJoins: 0,
        joinLockedUntil: null,
        createdAt: now,
        lastActivityAt: now,
        finishedAt: null,
        version: 0,
      };
      const token = newToken();
      const seat = await this.newSeat(input.name, 1, true, token, now);
      await this.commit(meta, [seat]);
      return ok({ code: meta.code, token, seatId: seat.seatId });
    });
  }

  join(name: string, password: string): Promise<OpResult<AuthRes>> {
    return this.serial(async () => {
      const meta = await this.checkCredentials(password);
      if (!meta) return BAD_CREDENTIALS;
      const seats = await this.store.getSeats();
      if (meta.status !== "lobby") return NOT_IN_LOBBY;
      if (seats.length >= meta.maxPlayers) return fail(409, "E_ROOM_FULL");
      if (findByName(seats, name)) return fail(409, "E_NAME_TAKEN");
      const token = newToken();
      const order = Math.max(0, ...seats.map((s) => s.joinOrder)) + 1;
      const seat = await this.newSeat(name, order, false, token, this.now());
      await this.commit(meta, [...seats, seat]);
      return ok({ code: meta.code, token, seatId: seat.seatId });
    });
  }

  /** code + password + name of an offline seat → new token; old sessions end. */
  reclaim(name: string, password: string): Promise<OpResult<AuthRes>> {
    return this.serial(async () => {
      const meta = await this.checkCredentials(password);
      if (!meta) return BAD_CREDENTIALS;
      const seats = await this.store.getSeats();
      const seat = findByName(seats, name);
      const sockets = this.ctx.getWebSockets();
      if (!seat || isOnline(sockets, seat.seatId)) return fail(409, "E_SEAT_ONLINE");
      const token = newToken();
      seat.tokenHash = await hashToken(token);
      seat.lastSeenAt = this.now();
      this.closeSeat(seat.seatId, CLOSE.SESSION_ENDED, "sessionEnded");
      await this.commit(meta, seats);
      return ok({ code: meta.code, token, seatId: seat.seatId });
    });
  }

  me(token: string): Promise<OpResult<MeRes>> {
    return this.serial(async () => {
      const a = await this.auth(token);
      if (!a.ok) return a;
      const { me, meta } = a.value;
      return ok({ seatId: me.seatId, name: me.name, host: me.host, status: meta.status });
    });
  }

  leave(token: string): Promise<OpResult<null>> {
    return this.serial(async () => {
      const a = await this.auth(token);
      if (!a.ok) return a;
      const { meta, seats, me } = a.value;
      if (meta.status !== "lobby") return NOT_IN_LOBBY;
      const rest = removeSeat(seats, me.seatId);
      this.closeSeat(me.seatId, CLOSE.SESSION_ENDED, "sessionEnded");
      if (rest.length === 0) await this.destroy(meta.code);
      else await this.commit(meta, rest);
      return ok(null);
    });
  }

  kick(token: string, seatId: string): Promise<OpResult<null>> {
    return this.serial(async () => {
      const a = await this.host(token);
      if (!a.ok) return a;
      const { meta, seats, me } = a.value;
      if (meta.status !== "lobby") return NOT_IN_LOBBY;
      if (seatId === me.seatId || !seats.some((s) => s.seatId === seatId)) {
        return fail(400, "E_INVALID_COMMAND", "unknown seat");
      }
      this.closeSeat(seatId, CLOSE.KICKED, "kicked");
      await this.commit(meta, removeSeat(seats, seatId));
      return ok(null);
    });
  }

  patch(token: string, input: PatchInput): Promise<OpResult<null>> {
    return this.serial(async () => {
      const a = await this.host(token);
      if (!a.ok) return a;
      const { meta, seats } = a.value;
      if (meta.status !== "lobby") return NOT_IN_LOBBY;
      if (input.roomName !== undefined) meta.roomName = input.roomName;
      if (input.listed !== undefined) meta.listed = input.listed;
      if (input.password !== undefined) {
        meta.pwd = await hashPassword(input.password, iterationsFromEnv(this.env));
      }
      await this.commit(meta, seats);
      return ok(null);
    });
  }

  /** Host only, lobby only, 2..max seats. `diceOverride` is for tests (T11 hooks). */
  start(token: string, diceOverride?: number[]): Promise<OpResult<null>> {
    return this.serial(async () => {
      const a = await this.host(token);
      if (!a.ok) return a;
      const { meta, seats } = a.value;
      if (meta.status !== "lobby") return NOT_IN_LOBBY;
      if (seats.length < MIN_PLAYERS || seats.length > meta.maxPlayers) {
        return fail(422, "E_PLAYER_COUNT");
      }
      const ordered = [...seats].sort((x, y) => x.joinOrder - y.joinOrder);
      ordered.forEach((s, i) => {
        s.seatIndex = i;
      });
      const dice: DiceSource = diceOverride ? new ScriptedDice(diceOverride) : new CryptoDice();
      const res = createGame(
        ordered.map((s) => ({ id: playerId(s.seatIndex as number), displayName: s.name })),
        { dice },
      );
      if (!res.ok) return fail(422, res.error.code);
      meta.status = "playing";
      await this.commit(meta, ordered, toJSON(res.state));
      return ok(null);
    });
  }

  /** Deletes the room once idle 7 d or finished 24 h; otherwise re-arms. */
  override async alarm(): Promise<void> {
    await this.serial(async () => {
      const meta = await this.store.getMeta();
      if (!meta) {
        await this.store.destroy();
        return;
      }
      const at = expiresAt(meta);
      if (this.now() >= at) await this.destroy(meta.code);
      else await this.store.setAlarm(at);
    });
  }

  /* ---------------- internals ---------------- */

  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(fn, fn);
    this.queue = run.catch(() => undefined);
    return run;
  }

  /**
   * C4 order: no meta / lockout / wrong password → null (caller sends 401).
   * Wrong passwords count toward the lockout; success resets it.
   */
  private async checkCredentials(password: string): Promise<RoomMeta | null> {
    const meta = await this.store.getMeta();
    const now = this.now();
    const locked = meta?.joinLockedUntil != null && now < meta.joinLockedUntil;
    if (!meta || locked) {
      // Same PBKDF2 cost as a real check, so failures are indistinguishable by timing.
      const iterations = meta?.pwd.iterations ?? iterationsFromEnv(this.env);
      await verifyPassword(password, { saltB64: DUMMY_SALT_B64, hashB64: "", iterations });
      return null;
    }
    if (!(await verifyPassword(password, meta.pwd))) {
      meta.failedJoins += 1;
      if (meta.failedJoins >= LOCKOUT_FAILED_ATTEMPTS) {
        meta.joinLockedUntil = now + LOCKOUT_MS;
        meta.failedJoins = 0;
        // Lock state is visible to the host (C7), so it counts as a change.
        await this.commit(meta);
      } else {
        await this.store.putMetaQuiet(meta);
      }
      return null;
    }
    if (meta.failedJoins !== 0 || meta.joinLockedUntil !== null) {
      meta.failedJoins = 0;
      meta.joinLockedUntil = null;
      await this.store.putMetaQuiet(meta);
    }
    return meta;
  }

  private async auth(token: string): Promise<OpResult<Authed>> {
    if (!TokenSchema.safeParse(token).success) return NOT_AUTHED;
    const meta = await this.store.getMeta();
    if (!meta) return NOT_AUTHED;
    const seats = await this.store.getSeats();
    const hash = await hashToken(token);
    let me: SeatRecord | undefined;
    for (const s of seats) if (tokenHashEquals(s.tokenHash, hash)) me = s;
    return me ? ok({ meta, seats, me }) : NOT_AUTHED;
  }

  private async host(token: string): Promise<OpResult<Authed>> {
    const a = await this.auth(token);
    if (a.ok && !a.value.me.host) return NOT_HOST;
    return a;
  }

  private async newSeat(
    name: string,
    joinOrder: number,
    host: boolean,
    token: string,
    now: number,
  ): Promise<SeatRecord> {
    return {
      seatId: newSeatId(),
      name,
      joinOrder,
      host,
      seatIndex: null,
      tokenHash: await hashToken(token),
      away: false,
      lastSeenAt: now,
    };
  }

  /** Persist an accepted change, re-arm the alarm, sync the lobby, broadcast. */
  private async commit(meta: RoomMeta, seats?: SeatRecord[], state?: string): Promise<void> {
    await this.store.commit(meta, this.now(), seats, state);
    await this.store.setAlarm(expiresAt(meta));
    await this.syncLobby(meta, seats ?? (await this.store.getSeats()));
    this.broadcast();
  }

  private async syncLobby(meta: RoomMeta, seats: SeatRecord[]): Promise<void> {
    try {
      const entry = publicEntry(meta, seats);
      if (entry) await this.lobby().upsert(entry);
      else await this.lobby().remove(meta.code);
    } catch (e) {
      // The lobby list is best-effort; the room change already succeeded.
      console.error("lobby sync failed", e instanceof Error ? e.message : "unknown");
    }
  }

  /** Ends the room: sockets closed with 4004, lobby entry removed, storage wiped. */
  private async destroy(code: string): Promise<void> {
    for (const ws of this.ctx.getWebSockets())
      this.closeSocket(ws, CLOSE.SESSION_ENDED, "sessionEnded");
    try {
      await this.lobby().remove(code);
    } catch (e) {
      console.error("lobby remove failed", e instanceof Error ? e.message : "unknown");
    }
    await this.store.destroy();
  }

  private closeSeat(seatId: string, code: number, type: "kicked" | "sessionEnded"): void {
    for (const ws of this.ctx.getWebSockets()) {
      if (seatIdOf(ws) === seatId) this.closeSocket(ws, code, type);
    }
  }

  private closeSocket(ws: WebSocket, code: number, type: "kicked" | "sessionEnded"): void {
    try {
      ws.send(JSON.stringify({ type }));
      ws.close(code, type);
    } catch {
      // already closed
    }
  }
}
