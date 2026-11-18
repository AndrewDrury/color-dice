import {
  type AuthRes,
  AuthResSchema,
  type CreateGameReq,
  type CreateGameRes,
  CreateGameResSchema,
  ErrorBodySchema,
  GameCodeSchema,
  type InviteRes,
  InviteResSchema,
  type JoinReq,
  type KickReq,
  type MeRes,
  MeResSchema,
  type PatchRoomReq,
  PUBLIC_LIST_MAX,
  type PublicGame,
  PublicGameSchema,
  type ReclaimReq,
} from "@cd/protocol";
import { SERVER_URL } from "./config";

/** Client-side codes for failures that never reached (or never came back from) the server. */
export type ClientErrorCode = "E_NETWORK" | "E_BAD_RESPONSE" | "E_BAD_CODE";

/** Thrown by every API call that does not succeed. `code` is an ErrorCode or ClientErrorCode. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly reason: string | undefined;
  /** Seconds, from the `Retry-After` header on 429 (when the server exposes it). */
  readonly retryAfter: number | undefined;

  constructor(status: number, code: string, reason?: string, retryAfter?: number) {
    super(`${code} (${status})`);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.reason = reason;
    this.retryAfter = retryAfter;
  }
}

interface Schema<T> {
  safeParse(data: unknown): { success: true; data: T } | { success: false };
}

interface RequestOpts {
  method?: "GET" | "POST" | "PATCH";
  token?: string | undefined;
  body?: unknown;
}

let baseUrl = SERVER_URL;

/** Test hook: point the API at another origin. */
export function _setBaseUrlForTests(url: string): void {
  baseUrl = url;
}

function gamePath(code: string, suffix = ""): string {
  if (!GameCodeSchema.safeParse(code).success) throw new ApiError(0, "E_BAD_CODE");
  return `/api/games/${encodeURIComponent(code)}${suffix}`;
}

function parseRetryAfter(res: Response): number | undefined {
  const raw = res.headers.get("Retry-After");
  if (raw === null) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

async function request(path: string, opts: RequestOpts = {}): Promise<Response> {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  let res: Response;
  try {
    res = await fetch(`${baseUrl}${path}`, {
      method: opts.method ?? "GET",
      headers,
      body: opts.body === undefined ? null : JSON.stringify(opts.body),
      credentials: "omit",
      cache: "no-store",
    });
  } catch {
    throw new ApiError(0, "E_NETWORK");
  }
  if (!res.ok) {
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      // non-JSON error body
    }
    const parsed = ErrorBodySchema.safeParse(body);
    const retryAfter = parseRetryAfter(res);
    if (parsed.success) {
      throw new ApiError(res.status, parsed.data.code, parsed.data.reason, retryAfter);
    }
    throw new ApiError(res.status, "E_BAD_RESPONSE", undefined, retryAfter);
  }
  return res;
}

async function json<T>(res: Response, schema: Schema<T>): Promise<T> {
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new ApiError(res.status, "E_BAD_RESPONSE");
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new ApiError(res.status, "E_BAD_RESPONSE");
  return parsed.data;
}

const GamesSchema = PublicGameSchema.array().max(PUBLIC_LIST_MAX);

/** `GET /api/games` */
export async function listGames(): Promise<PublicGame[]> {
  return json(await request("/api/games"), GamesSchema);
}

/** `POST /api/games` (the response also carries `inviteKey`, K2.1). */
export async function createGame(body: CreateGameReq): Promise<CreateGameRes> {
  return json(await request("/api/games", { method: "POST", body }), CreateGameResSchema);
}

/** `POST /api/games/:code/join` */
export async function joinGame(code: string, body: JoinReq): Promise<AuthRes> {
  return json(await request(gamePath(code, "/join"), { method: "POST", body }), AuthResSchema);
}

/** `POST /api/games/:code/reclaim` */
export async function reclaimSeat(code: string, body: ReclaimReq): Promise<AuthRes> {
  return json(await request(gamePath(code, "/reclaim"), { method: "POST", body }), AuthResSchema);
}

/** `GET /api/games/:code/me` */
export async function getMe(code: string, token: string): Promise<MeRes> {
  return json(await request(gamePath(code, "/me"), { token }), MeResSchema);
}

/** `POST /api/games/:code/start` (host) */
export async function startGame(code: string, token: string): Promise<void> {
  await request(gamePath(code, "/start"), { method: "POST", token });
}

/** `POST /api/games/:code/leave` (lobby: frees the seat; in play: the seat is marked left) */
export async function leaveGame(code: string, token: string): Promise<void> {
  await request(gamePath(code, "/leave"), { method: "POST", token });
}

/** `POST /api/games/:code/kick` (host, lobby only) */
export async function kickSeat(code: string, token: string, body: KickReq): Promise<void> {
  await request(gamePath(code, "/kick"), { method: "POST", token, body });
}

/** `PATCH /api/games/:code` (host, lobby only) */
export async function patchRoom(code: string, token: string, body: PatchRoomReq): Promise<void> {
  await request(gamePath(code), { method: "PATCH", token, body });
}

/** `GET /api/games/:code/invite` (any seated player). The key is a secret: never store or log it. */
export async function getInvite(code: string, token: string): Promise<InviteRes> {
  return json(await request(gamePath(code, "/invite"), { token }), InviteResSchema);
}

/** `POST /api/games/:code/invite/reset` (host): the old key stops working at once. */
export async function resetInvite(code: string, token: string): Promise<InviteRes> {
  return json(
    await request(gamePath(code, "/invite/reset"), { method: "POST", token }),
    InviteResSchema,
  );
}
