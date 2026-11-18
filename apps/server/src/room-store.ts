/**
 * Typed access to a GameRoom's storage (C1): keys `meta`, `seats`, `state`.
 * `commit` is the only way to record an accepted change: it bumps `version`
 * and `lastActivityAt` and writes the keys in one batch.
 */
import type { ChatEntry, MaxPlayers, RoomStatus } from "@cd/protocol";
import type { StoredPassword } from "./crypto";

export interface RoomMeta {
  code: string;
  roomName: string;
  listed: boolean;
  maxPlayers: MaxPlayers;
  status: RoomStatus;
  /** PBKDF2-SHA256; never returned or logged. */
  pwd: StoredPassword;
  failedJoins: number;
  /** Epoch ms. */
  joinLockedUntil: number | null;
  createdAt: number;
  lastActivityAt: number;
  /** Epoch ms when status became "finished" (set by gameplay, T11). */
  finishedAt: number | null;
  /** +1 on every accepted change. */
  version: number;
}

export interface SeatRecord {
  seatId: string;
  name: string;
  joinOrder: number;
  host: boolean;
  /** Set at start; engine PlayerId = `seat-${seatIndex}`. */
  seatIndex: number | null;
  /** SHA-256(token) hex; the token itself is never stored. */
  tokenHash: string;
  away: boolean;
  lastSeenAt: number;
  /** Win/loss tally across rematches (J5). Absent = 0-0. Dies with the seat. */
  record?: { wins: number; ties: number; losses: number };
}

/** Storage key `"chat"`: persisted id counter + ring buffer of text messages. */
export interface ChatState {
  nextId: number;
  messages: ChatEntry[];
}

export class RoomStore {
  constructor(private readonly storage: DurableObjectStorage) {}

  getMeta(): Promise<RoomMeta | undefined> {
    return this.storage.get<RoomMeta>("meta");
  }

  async getSeats(): Promise<SeatRecord[]> {
    return (await this.storage.get<SeatRecord[]>("seats")) ?? [];
  }

  /** Serialized engine state (`toJSON`), absent before start. */
  getState(): Promise<string | undefined> {
    return this.storage.get<string>("state");
  }

  async getChat(): Promise<ChatState> {
    return (await this.storage.get<ChatState>("chat")) ?? { nextId: 1, messages: [] };
  }

  /** Chat never touches `meta.version` or `lastActivityAt`. */
  putChat(chat: ChatState): Promise<void> {
    return this.storage.put("chat", chat);
  }

  /** Writes `meta` without counting it as activity (e.g. failed-join counters). */
  putMetaQuiet(meta: RoomMeta): Promise<void> {
    return this.storage.put("meta", meta);
  }

  /** Writes `seats` without counting it as activity (e.g. lastSeenAt on disconnect). */
  putSeatsQuiet(seats: SeatRecord[]): Promise<void> {
    return this.storage.put("seats", seats);
  }

  /** Records an accepted change: version +1, lastActivityAt = now. Mutates `meta`. */
  async commit(meta: RoomMeta, now: number, seats?: SeatRecord[], state?: string): Promise<void> {
    meta.version += 1;
    meta.lastActivityAt = now;
    const entries: Record<string, unknown> = { meta };
    if (seats) entries.seats = seats;
    if (state !== undefined) entries.state = state;
    await this.storage.put(entries);
  }

  async setAlarm(at: number): Promise<void> {
    await this.storage.setAlarm(at);
  }

  /** Removes every key and the alarm. */
  async destroy(): Promise<void> {
    await this.storage.deleteAlarm();
    await this.storage.deleteAll();
  }
}
