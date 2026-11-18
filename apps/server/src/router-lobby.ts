import type { RateLimitAction } from "@cd/protocol";
import type { Env } from "./env";
import { error } from "./http";

/** Actions the Worker asks the per-IP limiter about (C3). `reclaim` shares the `join` bucket. */
export type LimitedAction = "create" | "join" | "reclaim" | "list" | "ws";

/** Maps a route action to its `RATE_LIMITS` bucket in @cd/protocol. */
export const LIMIT_BUCKET: Record<LimitedAction, RateLimitAction> = {
  create: "create",
  join: "join",
  reclaim: "join",
  list: "list",
  ws: "wsConnect",
};

export interface LimitResult {
  ok: boolean;
  retryAfterSec: number;
}

const MAX_IP_LENGTH = 64;

/**
 * Client IP for rate limiting. Only `CF-Connecting-IP` is trusted (set by Cloudflare);
 * `X-Forwarded-For`, `X-Real-IP` etc. are ignored. Missing → "local" (wrangler dev / tests).
 */
export function clientIp(req: Request): string {
  const ip = req.headers.get("cf-connecting-ip")?.trim();
  return ip ? ip.slice(0, MAX_IP_LENGTH) : "local";
}

/** 429 `{ code: "E_RATE_LIMITED" }` with a `Retry-After` header (seconds). */
export function rateLimitedResponse(retryAfterSec: number): Response {
  const res = error("E_RATE_LIMITED", 429);
  res.headers.set("Retry-After", String(Math.max(1, Math.ceil(retryAfterSec))));
  return res;
}

/** Asks this IP's RateLimiter DO. Returns a 429 Response when limited, otherwise null. */
export async function rateLimit(
  env: Env,
  req: Request,
  action: LimitedAction,
): Promise<Response | null> {
  const stub = env.RATE_LIMITER.get(env.RATE_LIMITER.idFromName(clientIp(req)));
  const result = await stub.limit(action);
  return result.ok ? null : rateLimitedResponse(result.retryAfterSec);
}
