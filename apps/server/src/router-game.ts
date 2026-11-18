/** Worker side of the game socket and the test-only hook routes. */
import type { Env } from "./env";
import { error } from "./http";
import { normalizeCode } from "./router";
import { rateLimit } from "./router-lobby";
import { hooksEnabled, matchTestHook, parseTestHook } from "./test-hooks";

function room(env: Env, code: string) {
  return env.GAME_ROOM.get(env.GAME_ROOM.idFromName(code));
}

/** `GET /ws/game/:code` (Origin already checked): per-IP `ws` limit, then the room. */
export async function gameSocketHandler(req: Request, env: Env, code: string): Promise<Response> {
  const limited = await rateLimit(env, req, "ws");
  if (limited) return limited;
  return room(env, code).fetch(req);
}

/**
 * `POST /api/games/:code/__test/(dice|clock)`. Returns null (→ normal routing,
 * i.e. 404) unless `ALLOW_TEST_HOOKS === "1"`.
 */
export async function testHookHandler(req: Request, env: Env): Promise<Response | null> {
  if (!hooksEnabled(env)) return null;
  const match = matchTestHook(req.method, new URL(req.url).pathname);
  if (!match) return null;
  const code = normalizeCode(match.code);
  if (!code) return error("E_NOT_FOUND", 404);
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return error("E_INVALID_COMMAND", 400, "body must be JSON");
  }
  const input = parseTestHook(match.kind, body);
  if (!input) return error("E_INVALID_COMMAND", 400, "invalid body");
  const r = await room(env, code).testHook(input);
  if (r.ok) return new Response(null, { status: 204 });
  return r.status === 404 ? error("E_NOT_FOUND", 404) : error(r.code, r.status, r.reason);
}
