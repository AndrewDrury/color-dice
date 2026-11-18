import { error } from "./http";

export function parseAllowedOrigins(raw: string | undefined): Set<string> {
  return new Set(
    (raw ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s !== ""),
  );
}

export function isWebSocketUpgrade(req: Request): boolean {
  return req.headers.get("upgrade")?.toLowerCase() === "websocket";
}

export function corsHeaders(origin: string): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin,
    Vary: "Origin",
    "Access-Control-Allow-Headers": "content-type, authorization",
    "Access-Control-Allow-Methods": "GET,POST,PATCH,OPTIONS",
    "Access-Control-Expose-Headers": "Retry-After",
  };
}

/**
 * Checks the Origin before routing. Returns a Response to send immediately
 * (403 or preflight 204), or null to continue.
 */
export function checkOrigin(req: Request, allowed: Set<string>): Response | null {
  const origin = req.headers.get("origin");
  const ok = origin !== null && allowed.has(origin);
  if (isWebSocketUpgrade(req)) {
    return ok ? null : error("E_FORBIDDEN_ORIGIN", 403);
  }
  if (req.method === "OPTIONS") {
    if (ok) return new Response(null, { status: 204, headers: corsHeaders(origin) });
    if (origin === null) return new Response(null, { status: 204 });
    return error("E_FORBIDDEN_ORIGIN", 403);
  }
  if (origin !== null && !ok) return error("E_FORBIDDEN_ORIGIN", 403);
  if (req.method !== "GET" && req.method !== "HEAD" && hasBody(req)) {
    const type = req.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
    if (type !== "application/json") return error("E_INVALID_COMMAND", 415, "json only");
  }
  return null;
}

function hasBody(req: Request): boolean {
  const len = req.headers.get("content-length");
  return req.headers.has("transfer-encoding") || (len !== null && Number(len) > 0);
}

/** Adds CORS headers to an HTTP response when the request Origin is allowed. */
export function withCors(req: Request, res: Response, allowed: Set<string>): Response {
  const origin = req.headers.get("origin");
  if (origin === null || !allowed.has(origin) || res.webSocket) return res;
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(corsHeaders(origin))) out.headers.set(k, v);
  return out;
}
