/** Game code alphabet (defaults.md): 5 chars, no 0/O/1/I/L. */
export const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const CODE_LENGTH = 5;
const CODE_RE = new RegExp(`^[${CODE_ALPHABET}]{${CODE_LENGTH}}$`);

export type Route =
  | { kind: "health" }
  | { kind: "listGames" }
  | { kind: "createGame" }
  | { kind: "lobbySocket" }
  | { kind: "gameSocket"; code: string }
  | {
      kind: "game";
      code: string;
      action: "join" | "reclaim" | "me" | "start" | "leave" | "kick" | "update";
    };

/** Upper-cases and validates a game code; returns null if invalid. */
export function normalizeCode(raw: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return null;
  }
  const code = decoded.toUpperCase();
  return CODE_RE.test(code) ? code : null;
}

const GAME_ACTIONS: Record<
  string,
  { method: string; action: Extract<Route, { kind: "game" }>["action"] }
> = {
  join: { method: "POST", action: "join" },
  reclaim: { method: "POST", action: "reclaim" },
  me: { method: "GET", action: "me" },
  start: { method: "POST", action: "start" },
  leave: { method: "POST", action: "leave" },
  kick: { method: "POST", action: "kick" },
};

/** Matches C5/C6 routes. Returns null for anything else (→ 404). */
export function matchRoute(method: string, pathname: string): Route | null {
  const parts = pathname.split("/").filter((p) => p !== "");
  const [a, b, c, d, ...rest] = parts;
  if (rest.length > 0) return null;

  if (a === "health" && parts.length === 1) return method === "GET" ? { kind: "health" } : null;

  if (a === "ws" && method === "GET") {
    if (b === "lobby" && parts.length === 2) return { kind: "lobbySocket" };
    if (b === "game" && c !== undefined && parts.length === 3) {
      const code = normalizeCode(c);
      return code ? { kind: "gameSocket", code } : null;
    }
    return null;
  }

  if (a !== "api" || b !== "games") return null;
  if (parts.length === 2) {
    if (method === "GET") return { kind: "listGames" };
    if (method === "POST") return { kind: "createGame" };
    return null;
  }
  const code = c === undefined ? null : normalizeCode(c);
  if (!code) return null;
  if (parts.length === 3)
    return method === "PATCH" ? { kind: "game", code, action: "update" } : null;
  const entry = d !== undefined && Object.hasOwn(GAME_ACTIONS, d) ? GAME_ACTIONS[d] : undefined;
  if (!entry || entry.method !== method) return null;
  return { kind: "game", code, action: entry.action };
}
