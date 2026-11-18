import { GameCodeSchema, SeatIdSchema, TokenSchema } from "@cd/protocol";

/** One saved seat in a game (D4). The token is a bearer secret: never log or display it. */
export interface Session {
  token: string;
  seatId: string;
  name: string;
  roomName: string;
}

export const SESSIONS_KEY = "colorDice:sessions";

type SessionMap = Record<string, Session>;

/** Used whenever localStorage is missing, blocked or throws (e.g. private mode). */
let memory: SessionMap = {};

function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function isSession(code: string, v: unknown): v is Session {
  if (!GameCodeSchema.safeParse(code).success) return false;
  if (typeof v !== "object" || v === null) return false;
  const s = v as Record<string, unknown>;
  return (
    TokenSchema.safeParse(s.token).success &&
    SeatIdSchema.safeParse(s.seatId).success &&
    typeof s.name === "string" &&
    typeof s.roomName === "string"
  );
}

/** Keep only well-formed entries; storage content is not trusted. */
function sanitize(data: unknown): SessionMap {
  const out: SessionMap = {};
  if (typeof data !== "object" || data === null || Array.isArray(data)) return out;
  for (const [code, v] of Object.entries(data)) {
    if (isSession(code, v)) {
      out[code] = { token: v.token, seatId: v.seatId, name: v.name, roomName: v.roomName };
    }
  }
  return out;
}

function read(): SessionMap {
  const ls = storage();
  if (!ls) return { ...memory };
  try {
    const raw = ls.getItem(SESSIONS_KEY);
    const map = raw === null ? {} : sanitize(JSON.parse(raw));
    memory = map;
    return { ...map };
  } catch {
    return { ...memory };
  }
}

function write(map: SessionMap): void {
  memory = { ...map };
  const ls = storage();
  if (!ls) return;
  try {
    ls.setItem(SESSIONS_KEY, JSON.stringify(map));
  } catch {
    // Quota exceeded or storage blocked: the in-memory copy still works for this tab.
  }
}

export function listSessions(): Array<{ code: string } & Session> {
  return Object.entries(read()).map(([code, s]) => ({ code, ...s }));
}

export function getSession(code: string): Session | null {
  return read()[code] ?? null;
}

export function saveSession(code: string, s: Session): void {
  if (!isSession(code, s)) return;
  const map = read();
  map[code] = { token: s.token, seatId: s.seatId, name: s.name, roomName: s.roomName };
  write(map);
}

export function forgetSession(code: string): void {
  const map = read();
  if (!(code in map)) return;
  delete map[code];
  write(map);
}

/** Test helper: drop the in-memory fallback. */
export function _resetMemoryForTests(): void {
  memory = {};
}
