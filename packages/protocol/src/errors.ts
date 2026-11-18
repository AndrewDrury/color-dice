import { ERROR_CODES as ENGINE_ERROR_CODES } from "@cd/engine";
import { z } from "zod";

/** Room/session/protocol codes added on top of the engine's rejection codes. */
export const PROTOCOL_ERROR_CODES = [
  "E_STALE_TURN",
  "E_NOT_HOST",
  "E_BAD_CREDENTIALS",
  "E_ROOM_FULL",
  "E_NOT_IN_LOBBY",
  "E_NAME_TAKEN",
  "E_RATE_LIMITED",
  "E_INVALID_COMMAND",
  "E_NOT_AUTHED",
  "E_SEAT_ONLINE",
  "E_TOO_SOON",
  "E_NOT_FOUND",
  "E_FORBIDDEN_ORIGIN",
  "E_NOT_IMPLEMENTED",
] as const;

export type ErrorCode = (typeof ENGINE_ERROR_CODES)[number] | (typeof PROTOCOL_ERROR_CODES)[number];

/** Every error code that can cross the network (engine codes first, no duplicates). */
export const ERROR_CODES = [
  ...new Set<ErrorCode>([...ENGINE_ERROR_CODES, ...PROTOCOL_ERROR_CODES]),
] as [ErrorCode, ...ErrorCode[]];

export const ErrorCodeSchema = z.enum(ERROR_CODES);

export function isErrorCode(value: unknown): value is ErrorCode {
  return ErrorCodeSchema.safeParse(value).success;
}
