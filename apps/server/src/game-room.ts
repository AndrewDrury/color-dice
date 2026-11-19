import { DurableObject } from "cloudflare:workers";
import { fromJSON } from "@cd/engine";
import {
  type AuthRes,
  CLOSE,
  type CreateGameRes,
  type InviteRes,
  type MaxPlayers,
  type MeRes,
  TokenSchema,
} from "@cd/protocol";
import {
  hashPassword,
  hashToken,
  iterationsFromEnv,
  newInviteKey,
  newToken,
  tokenHashEquals,
} from "./crypto";
import type { Env } from "./env";
import { error } from "./http";
import { isWebSocketUpgrade } from "./origin";
import { type Credential, checkCredentials, newSeat } from "./room-access";
import {
  abandonedAt,
  BAD_CREDENTIALS,
  expiresAt,
  fail,
  findByName,
  hasAuthedSocket,
  isOnline,
  LOBBY_NAME,
  type LobbySync,
  markLeft,
  NOT_AUTHED,
  NOT_HOST,
  NOT_IN_LOBBY,
  type OpResult,
  ok,
  publicEntry,
  removeSeat,
  seatIdOf,
} from "./room-lobby-ops";
import { endSocket, RoomPlay } from "./room-play-ops";
import { isRoomFull, startLobbyGame } from "./room-start";
import { type RoomMeta, RoomStore, type SeatRecord } from "./room-store";
import { applyTestHook, CLOCK_KEY, hooksEnabled, type TestHookInput } from "./test-hooks";
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
    const rollOff = raw === undefined ? ((await this.store.getRollOff()) ?? null) : null;
    broadcastViews(
      this.ctx.getWebSockets(),
      meta,
      seats,
      raw === undefined ? null : fromJSON(raw),
      rollOff,
    );
  }

  /** `GET /ws/game/:code` (Origin and rate limit checked by the Worker). */
  override async fetch(request: Request): Promise<Response> {
    if (!isWebSocketUpgrade(request)) return error("E_NOT_FOUND", 404);
    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server);
    this.play.open(server);
    await this.serial(() => this.rearm());
    return new Response(null, { status: 101, webSocket: client });
  }

  override async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    await this.serial(() => this.play.message(ws, message));
  }

  override async webSocketClose(ws: WebSocket): Promise<void> {
    await this.serial(() => this.socketGone(ws));
  }

  override async webSocketError(ws: WebSocket): Promise<void> {
    await this.serial(() => this.socketGone(ws));
  }

  /* ---------------- RPC ---------------- */

  async isFree(): Promise<boolean> {
    return (await this.store.getMeta()) === undefined;
  }

  /** Creates the room with the creator as host. Refuses if the code is taken. */
  init(input: InitInput): Promise<OpResult<CreateGameRes>> {
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
        inviteKey: newInviteKey(),
        failedJoins: 0,
        joinLockedUntil: null,
        createdAt: now,
        lastActivityAt: now,
        finishedAt: null,
        version: 0,
      };
      const token = newToken();
      const seat = await newSeat(input.name, 1, true, token, now);
      await this.commit(meta, [seat]);
      return ok({ code: meta.code, token, seatId: seat.seatId, inviteKey: meta.inviteKey });
    });
  }

  join(name: string, cred: Credential): Promise<OpResult<AuthRes>> {
    return this.serial(async () => {
      const meta = await this.checkCredentials(cred);
      if (!meta) return BAD_CREDENTIALS;
      const seats = await this.store.getSeats();
      if (meta.status !== "lobby") return NOT_IN_LOBBY;
      if (seats.length >= meta.maxPlayers) return fail(409, "E_ROOM_FULL");
      if (findByName(seats, name)) return fail(409, "E_NAME_TAKEN");
      const token = newToken();
      const order = Math.max(0, ...seats.map((s) => s.joinOrder)) + 1;
      const seat = await newSeat(name, order, false, token, this.now());
      const all = [...seats, seat];
      // T-UX-17: the seat that fills the room starts the game, same path as the host's Start.
      const started = isRoomFull(meta, all)
        ? await startLobbyGame(this.env, this.ctx.storage, meta, all)
        : null;
      if (started?.ok)
        await this.commit(meta, started.value.seats, started.value.state ?? undefined);
      else await this.commit(meta, all);
      return ok({ code: meta.code, token, seatId: seat.seatId });
    });
  }

  /** code + password/invite + name of an offline seat → new token; old sessions end. */
  reclaim(name: string, cred: Credential): Promise<OpResult<AuthRes>> {
    return this.serial(async () => {
      const meta = await this.checkCredentials(cred);
      if (!meta) return BAD_CREDENTIALS;
      const seats = await this.store.getSeats();
      const seat = findByName(seats, name);
      const sockets = this.ctx.getWebSockets();
      // A seat that left the game (K2.2) is gone for good: same answer as no such seat.
      if (!seat || seat.left || isOnline(sockets, seat.seatId)) return fail(409, "E_SEAT_ONLINE");
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

  /**
   * Lobby: the seat is removed. In play / finished (K2.2): the seat becomes LEFT and is
   * auto-passed. Either way its sessions end, and the room is deleted once nobody is left.
   */
  leave(token: string): Promise<OpResult<null>> {
    return this.serial(async () => {
      const a = await this.auth(token);
      if (!a.ok) return a;
      const { meta, seats, me } = a.value;
      this.closeSeat(me.seatId, CLOSE.SESSION_ENDED, "sessionEnded");
      if (meta.status === "lobby") {
        const rest = removeSeat(seats, me.seatId);
        if (rest.length === 0) await this.destroy(meta.code);
        else await this.commit(meta, rest);
        return ok(null);
      }
      if (markLeft(seats, me.seatId)) await this.destroy(meta.code);
      else await this.play.resave(meta, seats);
      return ok(null);
    });
  }

  /** `GET …/invite` (K2.1): any seated player reads the room's invite key. */
  invite(token: string): Promise<OpResult<InviteRes>> {
    return this.serial(async () => {
      const a = await this.auth(token);
      if (!a.ok) return a;
      return ok({ inviteKey: a.value.meta.inviteKey });
    });
  }

  /** `POST …/invite/reset` (K2.1, host): a new key; the old one stops working at once. */
  resetInvite(token: string): Promise<OpResult<InviteRes>> {
    return this.serial(async () => {
      const a = await this.host(token);
      if (!a.ok) return a;
      const { meta } = a.value;
      meta.inviteKey = newInviteKey();
      await this.store.putMetaQuiet(meta);
      return ok({ inviteKey: meta.inviteKey });
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
        // K2.1: changing the password also rotates the invite link.
        meta.inviteKey = newInviteKey();
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
      const res = await startLobbyGame(this.env, this.ctx.storage, meta, seats, diceOverride);
      if (!res.ok) return res;
      await this.commit(meta, res.value.seats, res.value.state ?? undefined);
      return ok(null);
    });
  }

  /**
   * Closes unauthenticated sockets older than 10 s, deletes the room once idle
   * 7 d, finished 24 h, or with no authenticated socket for 30 min (K2.2);
   * otherwise re-arms.
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
      const seats = await this.store.getSeats();
      if (this.now() >= this.deleteAt(meta, seats)) await this.destroy(meta.code);
      else await this.store.setAlarm(this.alarmAt(meta, seats));
    });
  }

  /** Test hooks: queue scripted dice faces or advance the clock. 404 unless enabled. */
  testHook(input: TestHookInput): Promise<OpResult<null>> {
    return this.serial(async () => {
      if (!hooksEnabled(this.env)) return fail(404, "E_INVALID_COMMAND", "not found");
      if (!(await this.store.getMeta())) return fail(404, "E_INVALID_COMMAND", "not found");
      this.clockOffsetMs = await applyTestHook(this.ctx.storage, input, this.clockOffsetMs);
      return ok(null);
    });
  }

  /* ---------------- internals ---------------- */

  /** Room expiry: TTLs, plus the 30-min abandoned deadline while no seat is connected. */
  private deleteAt(meta: RoomMeta, seats: SeatRecord[]): number {
    const ttl = expiresAt(meta);
    return hasAuthedSocket(this.ctx.getWebSockets())
      ? ttl
      : Math.min(ttl, abandonedAt(meta, seats));
  }

  /** Earliest of the room expiry and the next unauthenticated-socket deadline. */
  private alarmAt(meta: RoomMeta | undefined, seats: SeatRecord[]): number {
    const sweep = this.play.sweepUnauthed() ?? Number.POSITIVE_INFINITY;
    return Math.min(meta ? this.deleteAt(meta, seats) : this.now() + 60_000, sweep);
  }

  private async rearm(): Promise<void> {
    const meta = await this.store.getMeta();
    await this.store.setAlarm(this.alarmAt(meta, meta ? await this.store.getSeats() : []));
  }

  /** Presence update, then re-arm: the last socket closing starts the 30-min clock. */
  private async socketGone(ws: WebSocket): Promise<void> {
    await this.play.close(ws);
    // A deleted room stays deleted (its sockets close after `destroy`).
    if (await this.store.getMeta()) await this.rearm();
  }

  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(fn, fn);
    this.queue = run.catch(() => undefined);
    return run;
  }

  private checkCredentials(cred: Credential): Promise<RoomMeta | null> {
    return checkCredentials(
      {
        store: this.store,
        now: () => this.now(),
        iterations: () => iterationsFromEnv(this.env),
        // Lock state is visible to the host (C7): tell them.
        onLocked: async (meta) => this.broadcast(meta, await this.store.getSeats()),
      },
      cred,
    );
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

  /** Persist an accepted change, re-arm the alarm, sync the lobby, broadcast. */
  private async commit(meta: RoomMeta, seats?: SeatRecord[], state?: string): Promise<void> {
    await this.store.commit(meta, this.now(), seats, state);
    const all = seats ?? (await this.store.getSeats());
    await this.store.setAlarm(this.alarmAt(meta, all));
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
    for (const ws of this.ctx.getWebSockets()) endSocket(ws, CLOSE.SESSION_ENDED, "sessionEnded");
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
      if (seatIdOf(ws) === seatId) endSocket(ws, code, type);
    }
  }
}
