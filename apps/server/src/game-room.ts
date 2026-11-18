import { DurableObject } from "cloudflare:workers";
import { createGame, fromJSON, isFace, toJSON } from "@cd/engine";
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
import { isWebSocketUpgrade } from "./origin";
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
import { closeWith, RoomPlay } from "./room-play-ops";
import { type RoomMeta, RoomStore, type SeatRecord } from "./room-store";
import {
  CLOCK_KEY,
  DICE_KEY,
  hooksEnabled,
  loadDice,
  QueuedDice,
  type RoomDice,
  type TestHookInput,
} from "./test-hooks";
import { broadcastViews } from "./views";

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
 * (rooms, passwords, sessions, start); gameplay runs over hibernating sockets
 * (`fetch` upgrade → RoomPlay), serialized with the RPC operations.
 */
export class GameRoom extends DurableObject<Env> {
  private readonly store: RoomStore;
  /** Serializes operations: PBKDF2 awaits are not storage ops, so input gates don't cover them. */
  private queue: Promise<unknown> = Promise.resolve();
  private readonly play: RoomPlay;
  /** Last public entry sent to the Lobby (JSON, "" = unlisted); undefined = unknown. */
  private lastSynced: string | undefined;
  /** Test-hook clock offset (always 0 unless ALLOW_TEST_HOOKS === "1"). */
  private clockOffsetMs = 0;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.store = new RoomStore(ctx.storage);
    this.play = new RoomPlay({
      env: () => this.env,
      storage: ctx.storage,
      store: this.store,
      sockets: () => this.ctx.getWebSockets(),
      now: () => this.now(),
      commit: (meta, seats, state) => this.commit(meta, seats, state),
      broadcast: (meta, seats) => this.broadcast(meta, seats),
    });
    if (hooksEnabled(env)) {
      void ctx.blockConcurrencyWhile(async () => {
        this.clockOffsetMs = (await ctx.storage.get<number>(CLOCK_KEY)) ?? 0;
      });
    }
  }

  /** Test seam: the clock (offset only via the test hook). */
  protected now(): number {
    return Date.now() + this.clockOffsetMs;
  }

  /** Test seam: the lobby. */
  protected lobby(): LobbySync {
    return this.env.LOBBY.get(this.env.LOBBY.idFromName(LOBBY_NAME));
  }

  /** Sends every authenticated socket the view for its own seat. */
  protected async broadcast(meta: RoomMeta, seats: SeatRecord[], state?: string): Promise<void> {
    const raw = state ?? (await this.store.getState());
    broadcastViews(this.ctx.getWebSockets(), meta, seats, raw === undefined ? null : fromJSON(raw));
  }

  /** `GET /ws/game/:code` (Origin and rate limit checked by the Worker). */
  override async fetch(request: Request): Promise<Response> {
    if (!isWebSocketUpgrade(request)) return error("E_NOT_FOUND", 404);
    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server);
    this.play.open(server);
    await this.serial(async () => {
      const meta = await this.store.getMeta();
      await this.store.setAlarm(this.alarmAt(meta));
    });
    return new Response(null, { status: 101, webSocket: client });
  }

  override async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    await this.serial(() => this.play.message(ws, message));
  }

  override async webSocketClose(ws: WebSocket): Promise<void> {
    await this.serial(() => this.play.close(ws));
  }

  override async webSocketError(ws: WebSocket): Promise<void> {
    await this.serial(() => this.play.close(ws));
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
        meta.failedJoins = 0;
        meta.joinLockedUntil = null;
      }
      await this.commit(meta, seats);
      return ok(null);
    });
  }

  /** Host only, lobby only, 2..max seats. `diceOverride` is honoured only with test hooks. */
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
      const dice = await this.startDice(diceOverride);
      const res = createGame(
        ordered.map((s) => ({ id: playerId(s.seatIndex as number), displayName: s.name })),
        { dice: dice.dice },
      );
      if (!res.ok) return fail(422, res.error.code);
      meta.status = "playing";
      await dice.save();
      await this.commit(meta, ordered, toJSON(res.state));
      return ok(null);
    });
  }

  /**
   * Closes unauthenticated sockets older than 10 s, deletes the room once idle
   * 7 d or finished 24 h; otherwise re-arms.
   */
  override async alarm(): Promise<void> {
    await this.serial(async () => {
      const meta = await this.store.getMeta();
      const authDeadline = this.play.sweepUnauthed();
      if (!meta) {
        await this.store.destroy();
        if (authDeadline !== null) await this.store.setAlarm(authDeadline);
        return;
      }
      if (this.now() >= expiresAt(meta)) await this.destroy(meta.code);
      else await this.store.setAlarm(this.alarmAt(meta));
    });
  }

  /** Test hooks: queue scripted dice faces or advance the clock. 404 unless enabled. */
  testHook(input: TestHookInput): Promise<OpResult<null>> {
    return this.serial(async () => {
      if (!hooksEnabled(this.env)) return fail(404, "E_INVALID_COMMAND", "not found");
      if (!(await this.store.getMeta())) return fail(404, "E_INVALID_COMMAND", "not found");
      if (input.kind === "dice") {
        const queued = (await this.ctx.storage.get<number[]>(DICE_KEY)) ?? [];
        await this.ctx.storage.put(DICE_KEY, [...queued, ...input.faces].slice(-500));
      } else {
        this.clockOffsetMs += input.advanceMs;
        await this.ctx.storage.put(CLOCK_KEY, this.clockOffsetMs);
      }
      return ok(null);
    });
  }

  /* ---------------- internals ---------------- */

  /** Scripted faces for `start`, only when test hooks are enabled. */
  private async startDice(diceOverride?: number[]): Promise<RoomDice> {
    if (hooksEnabled(this.env) && diceOverride && diceOverride.every(isFace)) {
      return { dice: new QueuedDice([...diceOverride]), save: async () => {} };
    }
    return loadDice(this.env, this.ctx.storage);
  }

  /** Earliest of the room expiry and the next unauthenticated-socket deadline. */
  private alarmAt(meta: RoomMeta | undefined): number {
    const sweep = this.play.sweepUnauthed() ?? Number.POSITIVE_INFINITY;
    return Math.min(meta ? expiresAt(meta) : this.now() + 60_000, sweep);
  }

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
        await this.store.putMetaQuiet(meta);
        // Lock state is visible to the host (C7): tell them, without counting it as activity.
        await this.broadcast(meta, await this.store.getSeats());
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
    await this.store.setAlarm(this.alarmAt(meta));
    const all = seats ?? (await this.store.getSeats());
    await this.syncLobby(meta, all);
    await this.broadcast(meta, all, state);
  }

  private async syncLobby(meta: RoomMeta, seats: SeatRecord[]): Promise<void> {
    try {
      const entry = publicEntry(meta, seats);
      const key = entry ? JSON.stringify(entry) : "";
      if (key === this.lastSynced) return;
      if (entry) await this.lobby().upsert(entry);
      else await this.lobby().remove(meta.code);
      this.lastSynced = key;
    } catch (e) {
      // The lobby list is best-effort; the room change already succeeded.
      console.error("lobby sync failed", e instanceof Error ? e.message : "unknown");
    }
  }

  /** Ends the room: sockets closed with 4004, lobby entry removed, storage wiped. */
  private async destroy(code: string): Promise<void> {
    for (const ws of this.ctx.getWebSockets())
      this.closeSocket(ws, CLOSE.SESSION_ENDED, "sessionEnded");
    this.lastSynced = undefined;
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
    } catch {
      // already closed
    }
    closeWith(ws, code, type);
  }
}
