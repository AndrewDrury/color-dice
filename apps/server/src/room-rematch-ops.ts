import { createGame, toJSON } from "@cd/engine";
import type { ErrorCode, RematchOffer } from "@cd/protocol";
import { REMATCH_OFFER_TTL_MS, REMATCH_RATE_MS } from "@cd/protocol";
import type { Env } from "./env";
import { isOnline } from "./room-lobby-ops";
import type { RoomMeta, RoomStore, SeatRecord } from "./room-store";
import { loadDice } from "./test-hooks";

export interface RematchDeps {
  env: () => Env;
  storage: DurableObjectStorage;
  store: RoomStore;
  sockets: () => WebSocket[];
  now: () => number;
  commit: (meta: RoomMeta, seats: SeatRecord[], state?: string) => Promise<void>;
  broadcast: (meta: RoomMeta, seats: SeatRecord[]) => Promise<void>;
  rearm: () => Promise<void>;
}

function seatIdOf(ws: WebSocket): string | null {
  try {
    const a = ws.deserializeAttachment() as { seatId?: unknown } | null;
    return typeof a?.seatId === "string" ? a.seatId : null;
  } catch {
    return null;
  }
}

function send(ws: WebSocket, msg: unknown): void {
  try {
    ws.send(JSON.stringify(msg));
  } catch {}
}

export class RoomRematch {
  private readonly requests = new Map<string, number>();

  constructor(private readonly d: RematchDeps) {}

  eligible(seats: SeatRecord[]): SeatRecord[] {
    return seats.filter(
      (s) =>
        s.seatIndex !== null &&
        s.left !== true &&
        s.kind !== "cpu" &&
        isOnline(this.d.sockets(), s.seatId),
    );
  }

  async clearExpired(meta: RoomMeta, seats: SeatRecord[]): Promise<void> {
    const offer = await this.d.store.getRematch();
    if (!offer || offer.expiresAt > this.d.now()) return;
    this.requests.delete(offer.fromSeatId);
    await this.d.store.putRematch(null);
    await this.d.rearm();
    await this.broadcastOffer(meta, seats, "expired");
  }

  private display(offer: Awaited<ReturnType<RoomStore["getRematch"]>>) {
    if (!offer) return null;
    return {
      fromSeatId: offer.fromSeatId,
      fromName: offer.fromName,
      fromProfile: offer.fromProfile,
      accepted: [...offer.accepted],
      expiresAt: offer.expiresAt,
    } satisfies RematchOffer;
  }

  async broadcastOffer(
    _meta: RoomMeta,
    seats: SeatRecord[],
    reason?: "started" | "declined" | "cancelled" | "expired",
    by?: string,
  ): Promise<void> {
    const now = this.d.now();
    let offer = await this.d.store.getRematch();
    if (offer && offer.expiresAt <= now) {
      this.requests.delete(offer.fromSeatId);
      await this.d.store.putRematch(null);
      await this.d.rearm();
      offer = undefined;
      reason = "expired";
    }
    const eligible = new Set(this.eligible(seats).map((s) => s.seatId));
    const payload = this.display(offer);
    for (const ws of this.d.sockets()) {
      if (ws.readyState !== WebSocket.OPEN) continue;
      const seatId = seatIdOf(ws);
      if (seatId && eligible.has(seatId)) {
        send(ws, {
          type: "rematchOffer",
          offer: payload,
          ...(reason ? { reason } : {}),
          ...(by ? { by } : {}),
        });
      }
    }
  }

  async request(
    _ws: WebSocket,
    seatId: string,
    meta: RoomMeta,
    seats: SeatRecord[],
  ): Promise<ErrorCode | null> {
    const me = seats.find((s) => s.seatId === seatId);
    if (!me || me.seatIndex === null || me.left === true || me.kind === "cpu") return "E_NOT_HOST";
    const raw = await this.d.store.getState();
    if (!raw) return "E_WRONG_PHASE";
    const { fromJSON } = await import("@cd/engine");
    if (fromJSON(raw).phase !== "GAME_OVER") return "E_WRONG_PHASE";
    const now = this.d.now();
    const current = await this.d.store.getRematch();
    if (current && current.expiresAt > now) {
      if (current.fromSeatId === seatId) {
        await this.broadcastOffer(meta, seats);
        return null;
      }
      return this.accept(_ws, seatId, meta, seats);
    }
    if (current) {
      this.requests.delete(current.fromSeatId);
      await this.d.store.putRematch(null);
    }
    const last = this.requests.get(seatId) ?? 0;
    if (now - last < REMATCH_RATE_MS) return "E_RATE_LIMITED";
    this.requests.set(seatId, now);
    await this.d.store.putRematch({
      fromSeatId: seatId,
      fromName: me.name,
      fromProfile: me.profile ?? { color: "slate", cat: "mad-cat" },
      accepted: [seatId],
      sentAt: now,
      expiresAt: now + REMATCH_OFFER_TTL_MS,
    });
    await this.d.rearm();
    await this.broadcastOffer(meta, seats);
    await this.maybeStart(meta, seats);
    return null;
  }

  async accept(
    _ws: WebSocket,
    seatId: string,
    meta: RoomMeta,
    seats: SeatRecord[],
  ): Promise<ErrorCode | null> {
    const offer = await this.d.store.getRematch();
    if (!offer) return null;
    if (offer.expiresAt <= this.d.now()) {
      this.requests.delete(offer.fromSeatId);
      await this.d.store.putRematch(null);
      await this.broadcastOffer(meta, seats, "expired");
      return null;
    }
    if (!this.eligible(seats).some((s) => s.seatId === seatId) || offer.accepted.includes(seatId)) {
      await this.broadcastOffer(meta, seats);
      return null;
    }
    offer.accepted = [...offer.accepted, seatId];
    await this.d.store.putRematch(offer);
    await this.broadcastOffer(meta, seats);
    await this.maybeStart(meta, seats);
    return null;
  }

  async decline(
    _ws: WebSocket,
    seatId: string,
    meta: RoomMeta,
    seats: SeatRecord[],
  ): Promise<ErrorCode | null> {
    const offer = await this.d.store.getRematch();
    if (!offer) return null;
    const me = seats.find((s) => s.seatId === seatId);
    if (!me || !this.eligible(seats).some((s) => s.seatId === seatId)) return null;
    await this.d.store.putRematch(null);
    await this.d.rearm();
    const reason = offer.fromSeatId === seatId ? "cancelled" : "declined";
    this.requests.delete(offer.fromSeatId);
    await this.broadcastOffer(meta, seats, reason, me.name);
    return null;
  }

  private async maybeStart(meta: RoomMeta, seats: SeatRecord[]): Promise<void> {
    const offer = await this.d.store.getRematch();
    if (!offer) return;
    const eligible = this.eligible(seats);
    if (eligible.some((s) => !offer.accepted.includes(s.seatId))) return;
    this.requests.delete(offer.fromSeatId);
    await this.d.store.putRematch(null);
    await this.d.rearm();
    const ordered = [...seats]
      .filter((s) => s.seatIndex !== null && s.left !== true)
      .sort((a, b) => (a.seatIndex as number) - (b.seatIndex as number));
    const dice = await loadDice(this.d.env(), this.d.storage);
    const result = createGame(
      ordered.map((s) => ({ id: `seat-${s.seatIndex}`, displayName: s.name })),
      { dice: dice.dice },
    );
    if (!result.ok) return;
    meta.status = "playing";
    meta.finishedAt = null;
    await dice.save();
    await this.d.commit(meta, seats, toJSON(result.state));
    await this.broadcastOffer(meta, seats, "started");
  }
}
