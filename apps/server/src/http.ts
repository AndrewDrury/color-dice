import type { ErrorCode } from "@cd/protocol";
/** Minimal structural schema type; zod schemas satisfy it. */
export interface Schema<T> {
  safeParse(input: unknown): { success: true; data: T } | { success: false };
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

/** Error body is always `{ code, reason? }` (C5). */
export function error(code: ErrorCode, status: number, reason?: string): Response {
  return json(reason === undefined ? { code } : { code, reason }, status);
}

export type ReadResult<T> = { ok: true; value: T } | { ok: false; response: Response };

/** Parses the JSON body with `schema`; any failure becomes 400 E_INVALID_COMMAND. */
export async function readJson<T>(req: Request, schema: Schema<T>): Promise<ReadResult<T>> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return { ok: false, response: error("E_INVALID_COMMAND", 400, "body must be JSON") };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, response: error("E_INVALID_COMMAND", 400, "invalid body") };
  }
  return { ok: true, value: parsed.data };
}

/** Returns the Bearer token from the Authorization header, or null. */
export function bearer(req: Request): string | null {
  const header = req.headers.get("authorization");
  if (!header) return null;
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  return match?.[1] ?? null;
}
