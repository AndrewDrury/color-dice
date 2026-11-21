/**
 * Form fields remembered on this device (T-UX-6): player name, room name, last room password and
 * per-room passwords and the last player count (K0.17). One localStorage key, sanitized on read. The values are low-stakes shared
 * secrets (see Q-009) but are never logged, displayed or put in a URL.
 */
import {
  GameCodeSchema,
  MAX_PLAYERS,
  MIN_PLAYERS,
  PASSWORD_MAX,
  PLAYER_NAME_MAX,
  PROFILE_COLORS,
  type Profile,
  ProfileSchema,
  ROOM_NAME_MAX,
} from "@cd/protocol";
import { defaultTheme, getPrefs, setPrefs } from "./prefs";
import { listSessions } from "./session";

export const REMEMBERED_KEY = "colorDice:remembered";
/** Most recent rooms whose password is kept. */
export const MAX_ROOM_PASSWORDS = 20;

export interface RoomPassword {
  code: string;
  password: string;
}

/** Player count pre-selected on Create Game when nothing valid is stored. */
export const DEFAULT_MAX_PLAYERS = 2;

export interface Remembered {
  name: string;
  roomName: string;
  password: string;
  /** Last chosen max players on Create Game; always a valid count. */
  maxPlayers: number;
  /** Oldest first; the last entry is the most recent. */
  rooms: RoomPassword[];
  /** Last chosen colour + cat (T-NEW-13); absent until first chosen. */
  profile?: Profile;
}

const EMPTY: Readonly<Remembered> = Object.freeze({
  name: "",
  roomName: "",
  password: "",
  maxPlayers: DEFAULT_MAX_PLAYERS,
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

function validMaxPlayers(v: unknown): number {
  return typeof v === "number" && Number.isInteger(v) && v >= MIN_PLAYERS && v <= MAX_PLAYERS
    ? v
    : DEFAULT_MAX_PLAYERS;
}

/** Storage content is not trusted: strings only, capped to the protocol limits. */
export function sanitizeRemembered(data: unknown): Remembered {
  const out: Remembered = { ...EMPTY, rooms: [] };
  if (typeof data !== "object" || data === null || Array.isArray(data)) return out;
  const d = data as Record<string, unknown>;
  out.name = str(d.name, PLAYER_NAME_MAX);
  out.roomName = str(d.roomName, ROOM_NAME_MAX);
  out.password = str(d.password, PASSWORD_MAX);
  out.maxPlayers = validMaxPlayers(d.maxPlayers);
  const prof = ProfileSchema.safeParse(d.profile);
  if (prof.success) out.profile = prof.data;
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
    const empty =
      !r.name &&
      !r.roomName &&
      !r.password &&
      r.rooms.length === 0 &&
      !r.profile &&
      r.maxPlayers === DEFAULT_MAX_PLAYERS;
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

let firstRun: Profile | null = null;

/** Profile to pre-fill: the remembered one, else a random colour with the default cat (stable per tab). */
export function rememberedProfile(): Profile {
  const p = getRemembered().profile;
  if (p) return p;
  firstRun ??= {
    color: PROFILE_COLORS[Math.floor(Math.random() * PROFILE_COLORS.length)] ?? "coral",
    cat: "mad-cat",
  };
  return firstRun;
}

/** Keep a profile changed in the waiting room for the next create/join. */
export function rememberProfile(profile: Profile): void {
  const r = load();
  save({ ...r, profile });
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
  /** Left unchanged when omitted (joining with an invite link never sees the password). */
  password?: string;
  /** Last chosen player count (Create Game only). */
  maxPlayers?: number;
  /** Colour + cat used for this seat; last selection wins. */
  profile?: Profile;
}

/**
 * Call after a successful create/join/reclaim, and after the session is saved. Always remembers
 * (K0.9): there is no opt-out checkbox; "Clear saved info" in Settings wipes it.
 */
export function rememberSubmit(input: RememberInput): void {
  const r = pruned(load());
  let rooms = r.rooms.filter((x) => x.code !== input.code);
  if (input.password) rooms = [...rooms, { code: input.code, password: input.password }];
  save(
    sanitizeRemembered({
      name: input.name,
      roomName: input.roomName ? input.roomName : r.roomName,
      password: input.password ?? r.password,
      maxPlayers: input.maxPlayers ?? r.maxPlayers,
      rooms,
      profile: input.profile ?? r.profile,
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

/** Settings "Clear saved info": wipes name/profile/room data and resets the theme and last name. */
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
  setPrefs({ lastName: "", theme: defaultTheme() });
}

/** Test helper: drop the in-memory copy. */
export function _resetRememberedForTests(): void {
  memory = null;
  firstRun = null;
}
