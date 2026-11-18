import type { GameRoom } from "./game-room";
import type { Lobby } from "./lobby";
import type { RateLimiter } from "./rate-limiter";

/** Worker bindings and vars (see wrangler.jsonc and .dev.vars.example). */
export interface Env {
  GAME_ROOM: DurableObjectNamespace<GameRoom>;
  LOBBY: DurableObjectNamespace<Lobby>;
  RATE_LIMITER: DurableObjectNamespace<RateLimiter>;
  /** Comma-separated list of allowed browser origins. */
  ALLOWED_ORIGINS: string;
  /** "1" enables test-only hooks. Never set in production. */
  ALLOW_TEST_HOOKS?: string;
  /** Overrides the PBKDF2 iteration count (tests only). */
  PBKDF2_ITERATIONS?: string;
}
