import { DurableObject } from "cloudflare:workers";
import {
  CLOSE,
  type LobbyMessage,
  PUBLIC_LIST_IDLE_MS,
  PUBLIC_LIST_MAX,
  type PublicGame,
  PublicGameSchema,
} from "@cd/protocol";
import type { Env } from "./env";
import { error, json } from "./http";
import { isWebSocketUpgrade } from "./origin";
import { rateLimit } from "./router-lobby";

type Entry = PublicGame & { lastActivityAt: number };

const STORAGE_KEY = "rooms";
/** Prune interval for the lobby alarm (T10). */
export const LOBBY_PRUNE_MS = 10 * 60_000;
/** Hard cap on stored entries so the single storage value stays small. */
const MAX_ENTRIES = 1000;

/** Explicit allow-list: only these fields ever leave the lobby (C2, G-security). */
function toPublic(e: PublicGame): PublicGame {
  return {
    code: e.code,
    roomName: e.roomName,
    hostName: e.hostName,
    players: e.players,
    maxPlayers: e.maxPlayers,
    createdAt: e.createdAt,
  };
}

/** Public game list (single instance named "main"). Read-only hibernating sockets. */
export class Lobby extends DurableObject<Env> {
  private rooms = new Map<string, Entry>();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    void ctx.blockConcurrencyWhile(async () => {
      const saved = await ctx.storage.get<Entry[]>(STORAGE_KEY);
      this.rooms = new Map((saved ?? []).map((e) => [e.code, e]));
    });
  }

  /** Test seam: the clock. */
  protected now(): number {
    return Date.now();
  }

  /** RPC from rooms: add or refresh a listed game. Unknown/extra fields are rejected. */
  async upsert(entry: PublicGame): Promise<void> {
    const parsed = PublicGameSchema.safeParse(entry);
    if (!parsed.success) throw new Error("invalid lobby entry");
    const next = toPublic(parsed.data);
    const prev = this.rooms.get(next.code);
    this.rooms.set(next.code, { ...next, lastActivityAt: this.now() });
    // Only lastActivityAt changed: keep it in memory, skip persist + broadcast.
    if (prev && JSON.stringify(toPublic(prev)) === JSON.stringify(next)) return;
    if (this.rooms.size > MAX_ENTRIES) this.evictOldest();
    await this.persist();
    this.broadcast();
  }

  /** RPC from rooms: unlist a game. */
  async remove(code: string): Promise<void> {
    if (!this.rooms.delete(code)) return;
    await this.persist();
    this.broadcast();
  }

  /** Active (≤ 30 min idle) games, newest first, at most 50, public fields only. */
  list(): PublicGame[] {
    const cutoff = this.now() - PUBLIC_LIST_IDLE_MS;
    return [...this.rooms.values()]
      .filter((e) => e.lastActivityAt >= cutoff)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, PUBLIC_LIST_MAX)
      .map(toPublic);
  }

  /** `GET /api/games` and `GET /ws/lobby`, forwarded by the Worker after the Origin check. */
  override async fetch(req: Request): Promise<Response> {
    if (req.method !== "GET") return error("E_NOT_FOUND", 404);
    const upgrade = isWebSocketUpgrade(req);
    const limited = await rateLimit(this.env, req, upgrade ? "ws" : "list");
    if (limited) return limited;
    if (!upgrade) return json(this.list());

    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server);
    server.send(this.message());
    return new Response(null, { status: 101, webSocket: client });
  }

  /** The lobby socket is read-only: any message is a policy violation. */
  override async webSocketMessage(ws: WebSocket): Promise<void> {
    ws.close(CLOSE.POLICY_VIOLATION, "read-only");
  }

  override async webSocketClose(ws: WebSocket, code: number): Promise<void> {
    try {
      ws.close(code === 1005 || code === 1006 ? 1000 : code, "bye");
    } catch {
      // already closed
    }
  }

  /** Every 10 min while non-empty: drop stale entries, broadcast if anything changed. */
  override async alarm(): Promise<void> {
    const cutoff = this.now() - PUBLIC_LIST_IDLE_MS;
    let changed = false;
    for (const [code, e] of this.rooms) {
      if (e.lastActivityAt < cutoff) {
        this.rooms.delete(code);
        changed = true;
      }
    }
    if (changed) {
      await this.ctx.storage.put(STORAGE_KEY, [...this.rooms.values()]);
      this.broadcast();
    }
    // Re-arm explicitly: inside the handler the fired alarm may still be reported as set.
    if (this.rooms.size > 0) await this.ctx.storage.setAlarm(Date.now() + LOBBY_PRUNE_MS);
    else await this.ctx.storage.deleteAlarm();
  }

  private evictOldest(): void {
    let oldest: Entry | null = null;
    for (const e of this.rooms.values()) {
      if (!oldest || e.lastActivityAt < oldest.lastActivityAt) oldest = e;
    }
    if (oldest) this.rooms.delete(oldest.code);
  }

  private async persist(): Promise<void> {
    await this.ctx.storage.put(STORAGE_KEY, [...this.rooms.values()]);
    await this.syncAlarm();
  }

  /** The alarm is set only while the map is non-empty. */
  private async syncAlarm(): Promise<void> {
    const current = await this.ctx.storage.getAlarm();
    if (this.rooms.size === 0) {
      if (current !== null) await this.ctx.storage.deleteAlarm();
    } else if (current === null) {
      await this.ctx.storage.setAlarm(Date.now() + LOBBY_PRUNE_MS);
    }
  }

  private message(): string {
    const msg: LobbyMessage = { type: "games", games: this.list() };
    return JSON.stringify(msg);
  }

  private broadcast(): void {
    const msg = this.message();
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(msg);
      } catch {
        // socket is closing; ignore
      }
    }
  }
}
