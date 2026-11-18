import type { Env } from "./env";
import { error } from "./http";
import { checkOrigin, parseAllowedOrigins, withCors } from "./origin";
import { createGameHandler, gameApiHandler, matchRoute } from "./router";

export { GameRoom } from "./game-room";
export { Lobby } from "./lobby";
export { RateLimiter } from "./rate-limiter";

const LOBBY_NAME = "main";

async function route(req: Request, env: Env): Promise<Response> {
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
      return env.GAME_ROOM.get(env.GAME_ROOM.idFromName(match.code)).fetch(req);
  }
}

export default {
  async fetch(req, env): Promise<Response> {
    const allowed = parseAllowedOrigins(env.ALLOWED_ORIGINS);
    const early = checkOrigin(req, allowed);
    if (early) return early;
    return withCors(req, await route(req, env), allowed);
  },
} satisfies ExportedHandler<Env>;
