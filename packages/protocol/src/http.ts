import { z } from "zod";
import {
  GameCodeSchema,
  MaxPlayersSchema,
  PasswordSchema,
  PlayerNameSchema,
  RoomNameSchema,
  RoomStatusSchema,
  SeatIdSchema,
  TokenSchema,
} from "./common";
import { ErrorCodeSchema } from "./errors";
import { PLAYER_NAME_MAX, ROOM_NAME_MAX } from "./limits";

/* ---------- Request bodies (validated by the server) ---------- */

/** `POST /api/games` */
export const CreateGameReqSchema = z
  .object({
    roomName: RoomNameSchema,
    name: PlayerNameSchema,
    password: PasswordSchema,
    maxPlayers: MaxPlayersSchema,
    listed: z.boolean(),
  })
  .strict();
export type CreateGameReq = z.input<typeof CreateGameReqSchema>;

/** `POST /api/games/:code/join` */
export const JoinReqSchema = z
  .object({ name: PlayerNameSchema, password: PasswordSchema })
  .strict();
export type JoinReq = z.input<typeof JoinReqSchema>;

/** `POST /api/games/:code/reclaim` */
export const ReclaimReqSchema = z
  .object({ name: PlayerNameSchema, password: PasswordSchema })
  .strict();
export type ReclaimReq = z.input<typeof ReclaimReqSchema>;

/** `PATCH /api/games/:code` — at least one field. */
export const PatchRoomReqSchema = z
  .object({
    roomName: RoomNameSchema.optional(),
    listed: z.boolean().optional(),
    password: PasswordSchema.optional(),
  })
  .strict()
  .refine((b) => b.roomName !== undefined || b.listed !== undefined || b.password !== undefined, {
    message: "empty patch",
  });
export type PatchRoomReq = z.input<typeof PatchRoomReqSchema>;

/** `POST /api/games/:code/kick` */
export const KickReqSchema = z.object({ seatId: SeatIdSchema }).strict();
export type KickReq = z.input<typeof KickReqSchema>;

/* ---------- Responses (typed for the client) ---------- */

/** Returned once by create / join / reclaim. */
export const AuthResSchema = z
  .object({ code: GameCodeSchema, token: TokenSchema, seatId: SeatIdSchema })
  .strict();
export type AuthRes = z.infer<typeof AuthResSchema>;

/** `GET /api/games/:code/me` */
export const MeResSchema = z
  .object({
    seatId: SeatIdSchema,
    name: z.string().max(PLAYER_NAME_MAX),
    host: z.boolean(),
    status: RoomStatusSchema,
  })
  .strict();
export type MeRes = z.infer<typeof MeResSchema>;

/** Public lobby entry. These fields only (C2). */
export const PublicGameSchema = z
  .object({
    code: GameCodeSchema,
    roomName: z.string().max(ROOM_NAME_MAX),
    hostName: z.string().max(PLAYER_NAME_MAX),
    players: z.number().int().min(0),
    maxPlayers: MaxPlayersSchema,
    createdAt: z.number().int().min(0),
  })
  .strict();
export type PublicGame = z.infer<typeof PublicGameSchema>;

/** Every HTTP error body. */
export const ErrorBodySchema = z
  .object({ code: ErrorCodeSchema, reason: z.string().max(200).optional() })
  .strict();
export type ErrorBody = z.infer<typeof ErrorBodySchema>;
