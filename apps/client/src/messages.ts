import {
  ErrorMessageSchema,
  type LobbyMessage,
  PUBLIC_LIST_MAX,
  PublicGameSchema,
  RematchOfferMessageSchema,
  type ServerMessage,
  type ViewMessage,
  ViewMessageSchema,
} from "@cd/protocol";

/** Upper bound on an inbound frame; anything larger is dropped before JSON.parse. */
export const MAX_SERVER_MESSAGE_CHARS = 512 * 1024;

const GamesSchema = PublicGameSchema.array().max(PUBLIC_LIST_MAX);

function parseObject(raw: unknown): Record<string, unknown> | null {
  if (typeof raw !== "string" || raw.length > MAX_SERVER_MESSAGE_CHARS) return null;
  try {
    const data: unknown = JSON.parse(raw);
    if (typeof data !== "object" || data === null || Array.isArray(data)) return null;
    return data as Record<string, unknown>;
  } catch {
    return null;
  }
}

function onlyKeys(obj: Record<string, unknown>, keys: string[]): boolean {
  const own = Object.keys(obj);
  return own.length === keys.length && own.every((k) => keys.includes(k));
}

/**
 * Parse and validate one game-socket frame. Returns null for anything that does not
 * match the protocol exactly (wrong shape, extra fields, too large, not JSON).
 */
export function parseServerMessage(raw: unknown): ServerMessage | null {
  const obj = parseObject(raw);
  if (!obj) return null;
  switch (obj.type) {
    case "view": {
      const r = ViewMessageSchema.safeParse(obj);
      // Schema output is structurally the protocol's ViewMessage (events checked by type only).
      return r.success ? (r.data as unknown as ViewMessage) : null;
    }
    case "error": {
      const r = ErrorMessageSchema.safeParse(obj);
      return r.success ? r.data : null;
    }
    case "rematchOffer": {
      const r = RematchOfferMessageSchema.safeParse(obj);
      return r.success ? r.data : null;
    }
    case "kicked":
    case "sessionEnded":
    case "pong":
      return onlyKeys(obj, ["type"]) ? { type: obj.type } : null;
    default:
      return null;
  }
}

/** Parse and validate one lobby-socket frame. */
export function parseLobbyMessage(raw: unknown): LobbyMessage | null {
  const obj = parseObject(raw);
  if (obj?.type !== "games" || !onlyKeys(obj, ["type", "games"])) return null;
  const r = GamesSchema.safeParse(obj.games);
  return r.success ? { type: "games", games: r.data } : null;
}
