import { COLORS, type Color } from "@cd/engine";
import { z } from "zod";
import {
  CODE_ALPHABET,
  CODE_LENGTH,
  NAME_RAW_MAX,
  PASSWORD_MAX,
  PASSWORD_MIN,
  PLAYER_NAME_MAX,
  PLAYER_NAME_MIN,
  ROOM_NAME_MAX,
  ROOM_NAME_MIN,
  SEAT_ID_LENGTH,
  TOKEN_LENGTH,
} from "./limits";
import { cleanName } from "./names";

/** Shared field schemas used by both HTTP and WebSocket messages. */

export const ColorSchema = z.enum(COLORS as [Color, ...Color[]]);

export const GameCodeSchema = z
  .string()
  .regex(new RegExp(`^[${CODE_ALPHABET}]{${CODE_LENGTH}}$`), "invalid game code");

export const SeatIdSchema = z
  .string()
  .regex(new RegExp(`^[A-Za-z0-9_-]{${SEAT_ID_LENGTH}}$`), "invalid seat id");

export const TokenSchema = z
  .string()
  .regex(new RegExp(`^[A-Za-z0-9_-]{${TOKEN_LENGTH}}$`), "invalid token");

/** Passwords are compared byte-for-byte, so they are never cleaned or trimmed. */
export const PasswordSchema = z.string().min(PASSWORD_MIN).max(PASSWORD_MAX);

function cleanedName(min: number, max: number) {
  return z.string().max(NAME_RAW_MAX).transform(cleanName).pipe(z.string().min(min).max(max));
}

/** Player name: cleaned with `cleanName`, then 1–30 chars. Output is the cleaned value. */
export const PlayerNameSchema = cleanedName(PLAYER_NAME_MIN, PLAYER_NAME_MAX);
/** Room name: cleaned with `cleanName`, then 3–50 chars. Output is the cleaned value. */
export const RoomNameSchema = cleanedName(ROOM_NAME_MIN, ROOM_NAME_MAX);

export const MaxPlayersSchema = z.literal([2, 3, 4, 5]);
export type MaxPlayers = z.infer<typeof MaxPlayersSchema>;

export const RoomStatusSchema = z.enum(["lobby", "playing", "finished"]);
export type RoomStatus = z.infer<typeof RoomStatusSchema>;
