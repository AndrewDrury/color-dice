/**
 * Form fields remembered on this device (T-UX-6): player name, room name, last room password and
 * per-room passwords. One localStorage key, sanitized on read. The values are low-stakes shared
 * secrets (see Q-009) but are never logged, displayed or put in a URL.
 */
import { GameCodeSchema, PASSWORD_MAX, PLAYER_NAME_MAX, ROOM_NAME_MAX } from "@cd/protocol";
import { getPrefs, setPrefs } from "./prefs";
import { listSessions } from "./session";

export const REMEMBERED_KEY = "colorDice:remembered";
/** Most recent rooms whose password is kept. */
export const MAX_ROOM_PASSWORDS = 20;

export interface RoomPassword {
  code: string;
  password: string;
}

export interface Remembered {
  name: string;
  roomName: string;
  password: string;
  /** Oldest first; the last entry is the most recent. */
  rooms: RoomPassword[];
}

const EMPTY: Readonly<Remembered> = Object.freeze({
  name: "",
  roomName: "",
  password: "",
  rooms: [],
});

let memory: Remembered | null = null;

function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function str(v: unknown, max: number): string {
  return typeof v === "string" ? v.slice(0, max) : "";
}

/** Storage content is not trusted: strings only, capped to the protocol limits. */
export function sanitizeRemembered(data: unknown): Remembered {
  const out: Remembered = { ...EMPTY, rooms: [] };
  if (typeof data !== "object" || data === null || Array.isArray(data)) return out;
  const d = data as Record<string, unknown>;
  out.name = str(d.name, PLAYER_NAME_MAX);
  out.roomName = str(d.roomName, ROOM_NAME_MAX);
  out.password = str(d.password, PASSWORD_MAX);
  if (Array.isArray(d.rooms)) {
    const byCode = new Map<string, string>();
    for (const r of d.rooms) {
      if (typeof r !== "object" || r === null) continue;
      const e = r as Record<string, unknown>;
      if (typeof e.code !== "string" || !GameCodeSchema.safeParse(e.code).success) continue;
      const password = str(e.password, PASSWORD_MAX);
      if (!password) continue;
      byCode.delete(e.code);
      byCode.set(e.code, password);
    }
    out.rooms = [...byCode].map(([code, password]) => ({ code, password }));
    out.rooms = out.rooms.slice(-MAX_ROOM_PASSWORDS);
  }
  return out;
}

function clone(r: Remembered): Remembered {
  return { ...r, rooms: r.rooms.map((x) => ({ ...x })) };
}

function load(): Remembered {
  const ls = storage();
  if (!ls) return clone(memory ?? sanitizeRemembered(null));
  try {
    const raw = ls.getItem(REMEMBERED_KEY);
    memory = raw === null ? sanitizeRemembered(null) : sanitizeRemembered(JSON.parse(raw));
  } catch {
    // Corrupt JSON: treat as empty.
    memory = sanitizeRemembered(null);
  }
  return clone(memory);
}

function save(r: Remembered): void {
  memory = clone(r);
  const ls = storage();
  if (!ls) return;
  try {
    const empty = !r.name && !r.roomName && !r.password && r.rooms.length === 0;
    if (empty) ls.removeItem(REMEMBERED_KEY);
    else ls.setItem(REMEMBERED_KEY, JSON.stringify(r));
  } catch {
    // Quota exceeded or storage blocked: the in-memory copy still works for this tab.
  }
}

/** Per-room passwords only live as long as this device holds a seat there. */
function pruned(r: Remembered): Remembered {
  const live = new Set(listSessions().map((s) => s.code));
  const rooms = r.rooms.filter((x) => live.has(x.code));
  return rooms.length === r.rooms.length ? r : { ...r, rooms };
}

export function getRemembered(): Remembered {
  const r = load();
  const p = pruned(r);
  if (p !== r) save(p);
  return clone(p);
}

/** Name to pre-fill: the remembered one, else the older last-name pref. */
export function rememberedName(): string {
  return getRemembered().name || getPrefs().lastName;
}

/** Password saved for a room this device is seated in, else "". */
export function getRoomPassword(code: string): string {
  return getRemembered().rooms.find((x) => x.code === code)?.password ?? "";
}

export interface RememberInput {
  code: string;
  name: string;
  /** Left unchanged when empty/unknown (e.g. joining before the lobby list arrived). */
  roomName?: string;
  password: string;
}

/**
 * Call only after a successful create/join/reclaim, and after the session is saved.
 * `remember` false stores nothing and deletes previously stored values for these fields.
 */
export function rememberSubmit(input: RememberInput, remember: boolean): void {
  if (!remember) {
    const r = load();
    save({
      ...r,
      name: "",
      roomName: input.roomName === undefined ? r.roomName : "",
      password: "",
      rooms: r.rooms.filter((x) => x.code !== input.code),
    });
    setPrefs({ lastName: "" });
    return;
  }
  const r = pruned(load());
  const rooms = r.rooms.filter((x) => x.code !== input.code);
  rooms.push({ code: input.code, password: input.password });
  save(
    sanitizeRemembered({
      name: input.name,
      roomName: input.roomName ? input.roomName : r.roomName,
      password: input.password,
      rooms,
    }),
  );
  setPrefs({ lastName: input.name });
}

/** Drop the saved password for one room (left, ended or forgotten). */
export function removeRoomPassword(code: string): void {
  const r = load();
  if (!r.rooms.some((x) => x.code === code)) return;
  save({ ...r, rooms: r.rooms.filter((x) => x.code !== code) });
}

/** Settings "Clear saved info": wipes the key and the last-name pref. */
export function clearRemembered(): void {
  memory = null;
  const ls = storage();
  if (ls) {
    try {
      ls.removeItem(REMEMBERED_KEY);
    } catch {
      // Storage blocked: nothing persisted anyway.
    }
  }
  setPrefs({ lastName: "" });
}

/** Test helper: drop the in-memory copy. */
export function _resetRememberedForTests(): void {
  memory = null;
}
