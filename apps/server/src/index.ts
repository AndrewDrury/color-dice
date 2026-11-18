import type { Env } from "./env";
import { error } from "./http";
import { checkOrigin, parseAllowedOrigins, withCors } from "./origin";
import { createGameHandler, gameApiHandler, matchRoute } from "./router";
import { gameSocketHandler, testHookHandler } from "./router-game";

export { GameRoom } from "./game-room";
export { Lobby } from "./lobby";
export { RateLimiter } from "./rate-limiter";

const LOBBY_NAME = "main";

async function route(req: Request, env: Env): Promise<Response> {
  const hook = await testHookHandler(req, env);
  if (hook) return hook;
  const url = new URL(req.url);
  const match = matchRoute(req.method, url.pathname);
  if (!match) return error("E_NOT_FOUND", 404);
  switch (match.kind) {
    case "health":
      return new Response("ok", { headers: { "content-type": "text/plain; charset=utf-8" } });
    case "listGames":
    case "lobbySocket":
      return env.LOBBY.get(env.LOBBY.idFromName(LOBBY_NAME)).fetch(req);
    case "createGame":
      return createGameHandler(req, env);
    case "game":
      return gameApiHandler(req, env, match);
    case "gameSocket":
      return gameSocketHandler(req, env, match.code);
  }
}

export default {
  async fetch(req, env): Promise<Response> {
    const allowed = parseAllowedOrigins(env.ALLOWED_ORIGINS);
    const early = checkOrigin(req, allowed);
    if (early) return early;
    let res: Response;
    try {
      res = await route(req, env);
    } catch (e) {
      console.error("unhandled", e instanceof Error ? e.message : "unknown");
      res = error("E_INVALID_COMMAND", 500, "internal error");
    }
    return withCors(req, res, allowed);
  },
} satisfies ExportedHandler<Env>;
