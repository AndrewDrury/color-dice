import {
  CODE_ALPHABET,
  CODE_LENGTH,
  CreateGameReqSchema,
  JoinReqSchema,
  KickReqSchema,
  PatchRoomReqSchema,
  ReclaimReqSchema,
} from "@cd/protocol";
import { newGameCode } from "./codes";
import type { Env } from "./env";
import { bearer, error, json, readJson } from "./http";
import { credentialOf } from "./room-access";
import type { OpResult } from "./room-lobby-ops";
import { rateLimit } from "./router-lobby";

// Re-exported from @cd/protocol for existing importers (test/codes.test.ts).
export { CODE_ALPHABET, CODE_LENGTH };

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
      action:
        | "join"
        | "reclaim"
        | "me"
        | "start"
        | "leave"
        | "kick"
        | "update"
        | "invite"
        | "inviteReset"
        | "colors";
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
  invite: { method: "GET", action: "invite" },
  colors: { method: "GET", action: "colors" },
  "invite/reset": { method: "POST", action: "inviteReset" },
};

/** Matches C5/C6 routes. Returns null for anything else (→ 404). */
export function matchRoute(method: string, pathname: string): Route | null {
  const parts = pathname.split("/").filter((p) => p !== "");
  const [a, b, c, d, e, ...rest] = parts;
  if (rest.length > 0) return null;
  // Only `/api/games/:code/invite/reset` has five segments.
  if (e !== undefined && (d !== "invite" || e !== "reset")) return null;

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
  const key = e === undefined ? d : `${d}/${e}`;
  const entry =
    key !== undefined && Object.hasOwn(GAME_ACTIONS, key) ? GAME_ACTIONS[key] : undefined;
  if (!entry || entry.method !== method) return null;
  return { kind: "game", code, action: entry.action };
}

/* ---------------- /api/games* handlers (Worker → GameRoom RPC) ---------------- */

const CREATE_ATTEMPTS = 5;

function respond<T>(r: OpResult<T>, status: number): Response {
  if (!r.ok) return error(r.code, r.status, r.reason);
  return r.value === null ? new Response(null, { status: 204 }) : json(r.value, status);
}

function room(env: Env, code: string) {
  return env.GAME_ROOM.get(env.GAME_ROOM.idFromName(code));
}

/** `POST /api/games`: rate limit, validate, then claim a free code (≤ 5 tries). */
export async function createGameHandler(req: Request, env: Env): Promise<Response> {
  const limited = await rateLimit(env, req, "create");
  if (limited) return limited;
  const body = await readJson(req, CreateGameReqSchema);
  if (!body.ok) return body.response;
  for (let i = 0; i < CREATE_ATTEMPTS; i++) {
    const code = newGameCode();
    const stub = room(env, code);
    if (!(await stub.isFree())) continue;
    const r = await stub.init({ code, ...body.value });
    if (r.ok) return json(r.value, 201);
  }
  return error("E_RATE_LIMITED", 503, "no free game code, try again");
}

/** `/api/games/:code/*` and `PATCH /api/games/:code`. */
export async function gameApiHandler(
  req: Request,
  env: Env,
  route: Extract<Route, { kind: "game" }>,
): Promise<Response> {
  const stub = room(env, route.code);
  if (route.action === "join" || route.action === "reclaim") {
    const limited = await rateLimit(env, req, route.action);
    if (limited) return limited;
    const body = await readJson(req, route.action === "join" ? JoinReqSchema : ReclaimReqSchema);
    if (!body.ok) return body.response;
    // The secret (password or invite) is passed on, never echoed or logged.
    const cred = credentialOf(body.value);
    return route.action === "join"
      ? respond(await stub.join(body.value.name, cred, body.value.profile), 201)
      : respond(await stub.reclaim(body.value.name, cred, body.value.profile), 200);
  }
  if (route.action === "colors") return respond(await stub.takenColors(), 200);
  const token = bearer(req);
  if (!token) return error("E_NOT_AUTHED", 401);
  switch (route.action) {
    case "me":
      return respond(await stub.me(token), 200);
    case "start":
      return respond(await stub.start(token), 204);
    case "leave":
      return respond(await stub.leave(token), 204);
    case "invite":
      return respond(await stub.invite(token), 200);
    case "inviteReset":
      return respond(await stub.resetInvite(token), 200);
    case "kick": {
      const body = await readJson(req, KickReqSchema);
      if (!body.ok) return body.response;
      return respond(await stub.kick(token, body.value.seatId), 204);
    }
    case "update": {
      const body = await readJson(req, PatchRoomReqSchema);
      if (!body.ok) return body.response;
      const { roomName, listed, password } = body.value;
      return respond(await stub.patch(token, { roomName, listed, password }), 204);
    }
  }
}
