import {
  CLOSE,
  type ClientMessage,
  ClientMessageSchema,
  GameCodeSchema,
  HEARTBEAT_MS,
  type PublicGame,
  type ServerMessage,
  TokenSchema,
} from "@cd/protocol";
import { backoffDelay } from "./backoff";
import { WS_URL } from "./config";
import { parseLobbyMessage, parseServerMessage } from "./messages";

export type SocketStatus = "connecting" | "online" | "reconnecting" | "ended";
/** Why a socket stopped for good. */
export type EndReason = "notAuthed" | "kicked" | "sessionEnded" | "closed";

type StatusListener = (status: SocketStatus, reason?: EndReason) => void;
type WebSocketCtor = new (url: string) => WebSocket;

export interface SocketOptions {
  /** Base ws(s):// origin; defaults to `WS_URL`. */
  baseUrl?: string;
  /** Injected for tests; defaults to the global WebSocket. */
  WebSocketImpl?: WebSocketCtor;
}

const TERMINAL_CLOSE: Record<number, EndReason> = {
  [CLOSE.NOT_AUTHED]: "notAuthed",
  [CLOSE.KICKED]: "kicked",
  [CLOSE.SESSION_ENDED]: "sessionEnded",
};

/** Shared reconnect/backoff/status plumbing for the game and lobby sockets. */
abstract class ReconnectingSocket {
  protected ws: WebSocket | null = null;
  protected readonly baseUrl: string;
  private readonly WS: WebSocketCtor;
  private attempt = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private stopped = true;
  private hasConnected = false;
  private statusValue: SocketStatus = "ended";
  private readonly statusListeners = new Set<StatusListener>();

  constructor(opts: SocketOptions = {}) {
    this.baseUrl = opts.baseUrl ?? WS_URL;
    this.WS = opts.WebSocketImpl ?? (globalThis.WebSocket as WebSocketCtor);
  }

  get status(): SocketStatus {
    return this.statusValue;
  }

  onStatus(cb: StatusListener): () => void {
    this.statusListeners.add(cb);
    return () => this.statusListeners.delete(cb);
  }

  /** Stop for good (no reconnect). */
  close(): void {
    this.stop("closed");
  }

  protected abstract url(): string;
  protected abstract handleOpen(ws: WebSocket): void;
  /** Return true when the frame was valid (a valid frame resets the backoff). */
  protected abstract handleFrame(data: unknown): boolean;
  protected handleClosed(): void {}

  protected start(): void {
    this.stop(null);
    this.stopped = false;
    this.attempt = 0;
    this.hasConnected = false;
    this.open();
  }

  protected setStatus(status: SocketStatus, reason?: EndReason): void {
    if (status === this.statusValue && status !== "ended") return;
    this.statusValue = status;
    for (const cb of this.statusListeners) cb(status, reason);
  }

  protected markOnline(): void {
    this.attempt = 0;
    this.hasConnected = true;
    this.setStatus("online");
  }

  /** `reason === null` silently tears down (used before a fresh `start`). */
  protected stop(reason: EndReason | null): void {
    const wasRunning = !this.stopped;
    this.stopped = true;
    if (this.retryTimer !== null) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    const ws = this.ws;
    this.ws = null;
    this.handleClosed();
    if (ws) {
      ws.onopen = ws.onmessage = ws.onclose = ws.onerror = null;
      try {
        ws.close(1000);
      } catch {
        // already closing
      }
    }
    if (reason !== null && (wasRunning || this.statusValue !== "ended")) {
      this.setStatus("ended", reason);
    }
  }

  private open(): void {
    this.setStatus(this.hasConnected || this.attempt > 0 ? "reconnecting" : "connecting");
    let ws: WebSocket;
    try {
      ws = new this.WS(this.url());
    } catch {
      this.scheduleRetry();
      return;
    }
    this.ws = ws;
    ws.onopen = () => {
      if (this.ws === ws) this.handleOpen(ws);
    };
    ws.onmessage = (ev: MessageEvent) => {
      if (this.ws === ws && this.handleFrame(ev.data) && this.statusValue !== "online") {
        this.markOnline();
      }
    };
    ws.onerror = () => {
      // A close event always follows; reconnect is handled there.
    };
    ws.onclose = (ev: CloseEvent) => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.handleClosed();
      const terminal = TERMINAL_CLOSE[ev.code];
      if (terminal) this.stop(terminal);
      else this.scheduleRetry();
    };
  }

  private scheduleRetry(): void {
    if (this.stopped) return;
    this.setStatus("reconnecting");
    const delay = backoffDelay(this.attempt);
    this.attempt += 1;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      if (!this.stopped) this.open();
    }, delay);
  }
}

/** Authenticated game socket (`/ws/game/:code`). Sends `auth` first on every (re)connect. */
export class GameSocket extends ReconnectingSocket {
  private code = "";
  private token = "";
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private readonly messageListeners = new Set<(msg: ServerMessage) => void>();

  connect(code: string, token: string): void {
    if (!GameCodeSchema.safeParse(code).success || !TokenSchema.safeParse(token).success) {
      this.stop("notAuthed");
      return;
    }
    this.code = code;
    this.token = token;
    this.start();
  }

  onMessage(cb: (msg: ServerMessage) => void): () => void {
    this.messageListeners.add(cb);
    return () => this.messageListeners.delete(cb);
  }

  /** Send a validated client message. Returns false if not connected or invalid. */
  send(msg: ClientMessage): boolean {
    const ws = this.ws;
    if (ws?.readyState !== 1 /* OPEN */) return false;
    if (!ClientMessageSchema.safeParse(msg).success) return false;
    ws.send(JSON.stringify(msg));
    return true;
  }

  protected url(): string {
    return `${this.baseUrl}/ws/game/${encodeURIComponent(this.code)}`;
  }

  protected handleOpen(ws: WebSocket): void {
    ws.send(JSON.stringify({ type: "auth", token: this.token }));
    this.clearPing();
    this.pingTimer = setInterval(() => {
      this.send({ type: "ping" });
    }, HEARTBEAT_MS);
  }

  protected handleFrame(data: unknown): boolean {
    const msg = parseServerMessage(data);
    if (!msg) return false;
    for (const cb of this.messageListeners) cb(msg);
    return true;
  }

  protected handleClosed(): void {
    this.clearPing();
  }

  private clearPing(): void {
    if (this.pingTimer !== null) clearInterval(this.pingTimer);
    this.pingTimer = null;
  }
}

/** Anonymous, read-only lobby socket (`/ws/lobby`). Never sends anything. */
export class LobbySocket extends ReconnectingSocket {
  private readonly gamesListeners = new Set<(games: PublicGame[]) => void>();

  connect(): void {
    this.start();
  }

  onGames(cb: (games: PublicGame[]) => void): () => void {
    this.gamesListeners.add(cb);
    return () => this.gamesListeners.delete(cb);
  }

  protected url(): string {
    return `${this.baseUrl}/ws/lobby`;
  }

  protected handleOpen(): void {}

  protected handleFrame(data: unknown): boolean {
    const msg = parseLobbyMessage(data);
    if (!msg) return false;
    for (const cb of this.gamesListeners) cb(msg.games);
    return true;
  }
}
