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

/** Largest accepted request body. */
export const MAX_BODY_BYTES = 4096;

async function readCapped(req: Request): Promise<string> {
  if (!req.body) return "";
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) {
      await reader.cancel();
      throw new Error("too large");
    }
    chunks.push(value);
  }
  const all = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    all.set(c, off);
    off += c.byteLength;
  }
  return new TextDecoder().decode(all);
}

/** Parses the JSON body with `schema`; any failure becomes 400 E_INVALID_COMMAND. */
export async function readJson<T>(req: Request, schema: Schema<T>): Promise<ReadResult<T>> {
  let raw: unknown;
  try {
    const len = req.headers.get("content-length");
    if (len !== null && Number(len) > MAX_BODY_BYTES) throw new Error("too large");
    const text = await readCapped(req);
    raw = JSON.parse(text);
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
