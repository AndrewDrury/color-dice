/**
 * Live play over the game socket (C6): auth, commands, setAway, rematch,
 * presence. GameRoom runs every handler inside its serial queue, and between
 * reading and writing state only storage calls are awaited.
 */
import {
  type Action1Decision,
  type Action2Decision,
  type Command,
  type DiceSource,
  dispatch,
  fromJSON,
  type GameState,
  toJSON,
  viewFor,
  winners,
} from "@cd/engine";
import {
  CLOSE,
  type ClientMessage,
  type ClientMessageType,
  type ErrorCode,
  type ErrorMessage,
  type Profile,
  parseClientMessage,
} from "@cd/protocol";
import { autopass } from "./autopass";
import { hashToken, tokenHashEquals } from "./crypto";
import type { Env } from "./env";
import { pausedSeatIds } from "./pause";
import { RoomChat } from "./room-chat-ops";
import { playerId, takenColors } from "./room-lobby-ops";
import { RoomRematch } from "./room-rematch-ops";
import { RollOffOps } from "./room-rolloff-ops";
import type { RoomMeta, RoomStore, SeatRecord } from "./room-store";
import { loadDice } from "./test-hooks";

/** Unauthenticated sockets older than this are closed with 4001. */
export const AUTH_TIMEOUT_MS = 10_000;
/** Invalid frames tolerated before closing with 4008. */
export const MAX_INVALID_FRAMES = 5;
/** Per-socket message cap: this many messages per window, then close 4008. */
export const MAX_MESSAGES = 30;
export const MESSAGE_WINDOW_MS = 10_000;
/** CPU loops are intentionally bounded even if a decision/source becomes malformed. */
export const CPU_MAX_ITERATIONS = 24;
export const CPU_TURN_BUDGET_MS = 8_000;

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

/** Tells the socket why (`kicked` / `sessionEnded`), then closes it with `code`. */
export function endSocket(ws: WebSocket, code: number, type: "kicked" | "sessionEnded"): void {
  send(ws, { type });
  closeWith(ws, code, type);
}

function endSession(ws: WebSocket): void {
  endSocket(ws, CLOSE.SESSION_ENDED, "sessionEnded");
}

type PlayMsg = Extract<ClientMessage, { type: "roll" | "action1" | "action2" | "turn" | "undo" }>;

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
      // In ACTION_1 the engine treats this as an early Action 2 (K1.2).
      return {
        type: "ACTION2",
        playerId: id,
        decision:
          msg.kind === "PASS"
            ? { kind: "PASS" }
            : { kind: "MARK", whiteDie: msg.whiteDie, color: msg.color },
      };
    case "turn": {
      const a1 = msg.action1;
      const a2 = msg.action2;
      return {
        type: "TURN",
        playerId: id,
        action1: a1.kind === "PASS" ? { kind: "PASS" } : { kind: "MARK", color: a1.color },
        action2:
          a2.kind === "PASS"
            ? { kind: "PASS" }
            : { kind: "MARK", whiteDie: a2.whiteDie, color: a2.color },
      };
    }
    case "undo":
      return { type: "UNDO", playerId: id };
  }
}

/** Seats auto-passed: only seats that confirmed a leave (K2.2). Offline seats pause the game instead. */
function leftSeats(seats: SeatRecord[]): Set<number> {
  const out = new Set<number>();
  for (const s of seats) if (s.left && s.seatIndex !== null) out.add(s.seatIndex);
  return out;
}

/** A sole winner gets a win, co-winners (a tie) each get a tie, every other seated player a loss. Mutates `seats`. */
export function tallyRecord(seats: SeatRecord[], winners: readonly string[]): void {
  const won = new Set(winners);
  for (const s of seats) {
    if (s.kind === "cpu") continue;
    if (s.seatIndex === null) continue;
    // Normalise on read: a legacy `{wins, losses}` record has no `ties`.
    const r = {
      wins: s.record?.wins ?? 0,
      ties: s.record?.ties ?? 0,
      losses: s.record?.losses ?? 0,
    };
    if (won.has(playerId(s.seatIndex))) {
      if (won.size > 1) r.ties += 1;
      else r.wins += 1;
    } else r.losses += 1;
    s.record = r;
  }
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
  rearm(): Promise<void>;
}

type Loaded = { meta: RoomMeta; seats: SeatRecord[]; me: SeatRecord };

function cpuAction1(state: GameState, seatIndex: number): Action1Decision {
  const view = viewFor(state, seatIndex);
  const choices = view.you.legalAction1;
  const marks = choices.filter((x): x is Extract<typeof x, { kind: "MARK" }> => x.kind === "MARK");
  if (marks.length === 0) return { kind: "PASS" };
  const player = view.game.players.find((p) => p.seat === seatIndex);
  const number = view.game.roll?.whiteSum;
  marks.sort((a, b) => {
    const ar = player?.sheet?.rows[a.color];
    const br = player?.sheet?.rows[b.color];
    const terminal = (color: typeof a.color, n: number | undefined) =>
      n !== undefined && (color === "RED" || color === "YELLOW" ? n === 12 : n === 2);
    const aTerminal = terminal(a.color, number) && (ar?.marked.filter(Boolean).length ?? 0) >= 5;
    const bTerminal = terminal(b.color, number) && (br?.marked.filter(Boolean).length ?? 0) >= 5;
    if (aTerminal !== bTerminal) return aTerminal ? -1 : 1;
    const aLocked = ar ? ar.lockCrossed : false;
    const bLocked = br ? br.lockCrossed : false;
    if (aLocked !== bLocked) return aLocked ? 1 : -1;
    const aMarks = ar?.marked.filter(Boolean).length ?? 0;
    const bMarks = br?.marked.filter(Boolean).length ?? 0;
    if (aMarks !== bMarks) return bMarks - aMarks;
    const aScore = player?.score.rows?.[a.color] ?? 0;
    const bScore = player?.score.rows?.[b.color] ?? 0;
    return bScore - aScore;
  });
  return marks[0] ?? { kind: "PASS" };
}

function cpuAction2(state: GameState, seatIndex: number): Action2Decision {
  const view = viewFor(state, seatIndex);
  const choices = view.you.legalAction2;
  const marks = choices.filter((x): x is Extract<typeof x, { kind: "MARK" }> => x.kind === "MARK");
  if (marks.length === 0) return { kind: "PASS" };
  const player = view.game.players.find((p) => p.seat === seatIndex);
  const whiteSum = view.game.roll?.whiteSum;
  const ranked = [...marks].sort((a, b) => {
    const terminal = (color: typeof a.color, number: number) =>
      color === "RED" || color === "YELLOW" ? number === 12 : number === 2;
    const al = player?.sheet?.rows[a.color];
    const bl = player?.sheet?.rows[b.color];
    const aLock = terminal(a.color, a.number) && (al?.marked.filter(Boolean).length ?? 0) >= 5;
    const bLock = terminal(b.color, b.number) && (bl?.marked.filter(Boolean).length ?? 0) >= 5;
    if (aLock !== bLock) return aLock ? -1 : 1;
    const aWhite = a.number === whiteSum;
    const bWhite = b.number === whiteSum;
    if (aWhite !== bWhite) return aWhite ? -1 : 1;
    const aScore = player?.score.rows?.[a.color] ?? 0;
    const bScore = player?.score.rows?.[b.color] ?? 0;
    return bScore - aScore;
  });
  const chosen = ranked[0];
  return chosen
    ? { kind: "MARK", whiteDie: chosen.whiteDie, color: chosen.color }
    : { kind: "PASS" };
}

export class RoomPlay {
  private readonly chat: RoomChat;
  private readonly rollOff: RollOffOps;
  private readonly rematchOps: RoomRematch;

  constructor(private readonly d: PlayDeps) {
    this.rollOff = new RollOffOps({
      env: () => d.env(),
      storage: d.storage,
      store: d.store,
      commit: (m, s, st) => d.commit(m, s, st),
      finish: (m, s, st, dice) => this.save(m, s, st, dice),
    });
    this.chat = new RoomChat(
      d.store,
      () => d.sockets(),
      () => d.now(),
    );
    this.rematchOps = new RoomRematch({
      env: () => d.env(),
      storage: d.storage,
      store: d.store,
      sockets: () => d.sockets(),
      now: () => d.now(),
      commit: (m, s, st) => d.commit(m, s, st),
      broadcast: (m, s) => d.broadcast(m, s),
      rearm: () => d.rearm(),
      progressCpu: (meta, seats, state, dice) => this.runCpuTurns(meta, seats, state, dice),
    });
  }

  /** Alarm hook: expire a pending rematch and broadcast the cleared offer. */
  async expireRematch(meta: RoomMeta, seats: SeatRecord[]): Promise<void> {
    const offer = await this.d.store.getRematch();
    if (offer && offer.expiresAt <= this.d.now()) {
      await this.rematchOps.clearExpired(meta, seats);
    }
  }

  /** Bound opening roll-off progress when no human/CPU submission completes it. */
  async guardRollOff(meta: RoomMeta, seats: SeatRecord[]): Promise<void> {
    await this.rollOff.guard(meta, seats);
  }

  /** Alarm watchdog: retry CPU work if a turn did not complete or a restart interrupted it. */
  async guardCpu(meta: RoomMeta, seats: SeatRecord[]): Promise<void> {
    if (meta.status !== "playing") return;
    const state = await this.loadState();
    if (!state || state.phase === "GAME_OVER") return;
    const active = state.turn?.activeSeat;
    if (active === undefined) return;
    const cpu = seats.find((s) => s.kind === "cpu" && s.seatIndex === active);
    if (!cpu) return;
    const dice = await loadDice(this.d.env(), this.d.storage);
    await this.runCpuTurns(meta, seats, state, dice);
  }

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
      case "rollOff":
        return this.rollOffRoll(ws, att.seatId, msg.round);
      case "roll":
      case "action1":
      case "action2":
      case "turn":
      case "undo":
        return this.command(ws, att.seatId, msg);
      case "rematch":
        return this.rematch(ws, att.seatId);
      case "rematchRequest":
        return this.rematchRequest(ws, att.seatId);
      case "rematchAccept":
        return this.rematchAccept(ws, att.seatId);
      case "rematchDecline":
        return this.rematchDecline(ws, att.seatId);
      case "profile":
        return this.setProfile(ws, att.seatId, msg.profile);
      case "chat":
      case "react": {
        const r = await this.chat.handle(att.seatId, msg);
        if (r === "gone") endSession(ws);
        else if (r) sendError(ws, r.code, msg.type, r.reason);
        return;
      }
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
    // Reconnecting may resume a paused game; left seats are then auto-passed (T-NEW-3).
    const state = await this.loadState();
    if (state && state.phase !== "GAME_OVER" && seats.some((s) => s.left)) {
      await this.resave(meta, seats);
    } else await this.d.broadcast(meta, seats); // this socket gets its view, everyone presence
    await this.rematchOps.broadcastOffer(meta, seats);
    send(ws, { type: "chatHistory", messages: await this.chat.history() });
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
    if (meta.cpuError) delete meta.cpuError;
    // T-NEW-3: while the game is paused nothing advances, not even auto-pass for left seats.
    const paused = pausedSeatIds(seats, this.d.sockets(), state).length > 0;
    const next = paused ? state : autopass(state, leftSeats(seats), dice.dice);
    if (next.phase === "GAME_OVER") {
      if (meta.status !== "finished") {
        // Exactly once per game end: later saves (e.g. setAway) see status "finished".
        tallyRecord(seats, winners(next));
        meta.status = "finished";
        meta.finishedAt = this.d.now();
      }
    } else {
      meta.status = "playing";
      meta.finishedAt = null;
    }
    await dice.save();
    await this.d.commit(meta, seats, toJSON(next));
    await this.runCpuTurns(meta, seats, next, dice);
  }

  private async runCpuTurns(
    meta: RoomMeta,
    seats: SeatRecord[],
    state: GameState,
    dice: { dice: DiceSource; save(): Promise<void> },
  ): Promise<void> {
    let next = state;
    const deadline = this.d.now() + CPU_TURN_BUDGET_MS;
    let iterations = 0;
    for (;;) {
      if (++iterations > CPU_MAX_ITERATIONS) {
        await this.persistCpuError(meta, seats, next, "CPU turn iteration limit reached");
        return;
      }
      if (this.d.now() >= deadline) {
        await this.persistCpuError(meta, seats, next, "CPU turn processing timeout");
        return;
      }
      if (next.phase === "GAME_OVER") return;
      if (pausedSeatIds(seats, this.d.sockets(), next).length > 0) return;
      const active = next.turn?.activeSeat;
      if (active === undefined) return;
      const cpu = seats.find((s) => s.kind === "cpu" && s.seatIndex === active);
      if (!cpu) return;
      let command: Command;
      try {
        if (next.phase === "AWAIT_ROLL") {
          command = { type: "ROLL", playerId: playerId(active) };
        } else if (next.phase === "ACTION_1") {
          const cpuView = viewFor(next, active);
          if (cpuView.you.action1Decision !== null) {
            const decision = cpuAction2(next, active);
            command = { type: "ACTION2", playerId: playerId(active), decision };
          } else {
            const decision = cpuAction1(next, active);
            command = { type: "ACTION1", playerId: playerId(active), decision };
          }
        } else if (next.phase === "ACTION_2") {
          const decision = cpuAction2(next, active);
          command = { type: "ACTION2", playerId: playerId(active), decision };
        } else {
          return;
        }
      } catch (e) {
        await this.persistCpuError(
          meta,
          seats,
          next,
          `CPU decision failed: ${e instanceof Error ? e.message : "unknown"}`,
        );
        return;
      }
      const before = toJSON(next);
      let result: ReturnType<typeof dispatch>;
      try {
        result = dispatch(next, command, dice.dice);
      } catch (e) {
        await this.persistCpuError(
          meta,
          seats,
          next,
          `CPU dispatch threw: ${e instanceof Error ? e.message : "unknown"}`,
        );
        return;
      }
      if (!result.ok) {
        await this.persistCpuError(meta, seats, next, `CPU dispatch failed: ${result.error.code}`);
        return;
      }
      next = autopass(result.state, leftSeats(seats), dice.dice);
      if (toJSON(next) === before) {
        await this.persistCpuError(meta, seats, next, "CPU command made no state progress");
        return;
      }
      if (next.phase === "GAME_OVER") {
        if (meta.status !== "finished") {
          tallyRecord(seats, winners(next));
          meta.status = "finished";
          meta.finishedAt = this.d.now();
        }
      } else {
        meta.status = "playing";
        meta.finishedAt = null;
      }
      await dice.save();
      await this.d.commit(meta, seats, toJSON(next));
      const paceMs = this.d.env().ALLOW_TEST_HOOKS === "1" ? 0 : 650;
      if (paceMs > 0) await new Promise<void>((resolve) => setTimeout(resolve, paceMs));
    }
  }

  private async persistCpuError(
    meta: RoomMeta,
    seats: SeatRecord[],
    state: GameState,
    message: string,
  ): Promise<void> {
    const active = state.turn?.activeSeat;
    const cpu = seats.find((s) => s.kind === "cpu" && s.seatIndex === active);
    meta.cpuError = {
      at: this.d.now(),
      seatId: cpu?.seatId ?? "",
      phase: state.phase,
      message,
    };
    console.error("CPU progress stopped", meta.cpuError);
    await this.d.commit(meta, seats, toJSON(state));
  }

  private async rollOffRoll(ws: WebSocket, seatId: string, round: number): Promise<void> {
    const l = await this.load(ws, seatId);
    if (!l) return;
    // Everyone present rolls together; nobody can roll while a seat is away.
    if (pausedSeatIds(l.seats, this.d.sockets(), null).length > 0) {
      return sendError(ws, "E_WRONG_PHASE", "rollOff", "paused");
    }
    const err = await this.rollOff.submit(l.meta, l.seats, l.me, round);
    if (err) sendError(ws, err.code, "rollOff", err.reason);
  }

  private async command(ws: WebSocket, seatId: string, msg: PlayMsg): Promise<void> {
    const l = await this.load(ws, seatId);
    if (!l) return;
    const state = await this.loadState();
    if (!state || l.meta.status === "lobby" || l.me.seatIndex === null) {
      return sendError(ws, "E_WRONG_PHASE", msg.type);
    }
    if (state.phase === "GAME_OVER") return sendError(ws, "E_GAME_OVER", msg.type);
    if (pausedSeatIds(l.seats, this.d.sockets(), state).length > 0) {
      return sendError(ws, "E_WRONG_PHASE", msg.type, "paused");
    }
    if (msg.turn !== state.turn?.turnNumber) return sendError(ws, "E_STALE_TURN", msg.type);
    const dice = await loadDice(this.d.env(), this.d.storage);
    const r = dispatch(state, toCommand(msg, playerId(l.me.seatIndex)), dice.dice);
    if (!r.ok) return sendError(ws, r.error.code, msg.type, r.error.reason);
    await this.save(l.meta, l.seats, r.state, dice);
  }

  /** Commits a seat change; during play away seats are auto-passed first (K2.2 leave, D3). */
  async resave(meta: RoomMeta, seats: SeatRecord[]): Promise<void> {
    const state = await this.loadState();
    if (!state) {
      if (await this.rollOff.resettle(meta, seats)) return;
      return this.d.commit(meta, seats);
    }
    const dice = await loadDice(this.d.env(), this.d.storage);
    await this.save(meta, seats, state, dice);
  }

  /** Host only, at GAME_OVER: a new game with the same seats and seat indexes. */
  /** Lobby only (T-NEW-13). Colours are unique per room (T-NEW-32); legacy duplicates are kept. */
  private async setProfile(ws: WebSocket, seatId: string, profile: Profile): Promise<void> {
    const l = await this.load(ws, seatId);
    if (!l) return;
    if (l.meta.status !== "lobby") return sendError(ws, "E_WRONG_PHASE", "profile");
    const taken = takenColors(l.seats, seatId);
    if (taken.includes(profile.color))
      return sendError(ws, "E_COLOUR_TAKEN", "profile", taken.join(","));
    l.me.profile = profile;
    await this.d.commit(l.meta, l.seats);
  }

  private async rematch(ws: WebSocket, seatId: string): Promise<void> {
    const l = await this.load(ws, seatId);
    if (!l) return;
    if (!l.me.host) return sendError(ws, "E_NOT_HOST", "rematch");
    const err = await this.rematchOps.request(ws, seatId, l.meta, l.seats);
    if (err) sendError(ws, err, "rematch");
  }

  private async rematchRequest(ws: WebSocket, seatId: string): Promise<void> {
    const l = await this.load(ws, seatId);
    if (!l) return;
    const err = await this.rematchOps.request(ws, seatId, l.meta, l.seats);
    if (err) sendError(ws, err, "rematchRequest");
  }

  private async rematchAccept(ws: WebSocket, seatId: string): Promise<void> {
    const l = await this.load(ws, seatId);
    if (!l) return;
    const err = await this.rematchOps.accept(ws, seatId, l.meta, l.seats);
    if (err) sendError(ws, err, "rematchAccept");
  }

  private async rematchDecline(ws: WebSocket, seatId: string): Promise<void> {
    const l = await this.load(ws, seatId);
    if (!l) return;
    const err = await this.rematchOps.decline(ws, seatId, l.meta, l.seats);
    if (err) sendError(ws, err, "rematchDecline");
  }
}
