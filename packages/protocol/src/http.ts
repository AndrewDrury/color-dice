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
import { INVITE_KEY_LENGTH, PLAYER_NAME_MAX, ROOM_NAME_MAX } from "./limits";

/** Invite key (K2.1): base64url, 43 chars. Travels only in the URL fragment and request bodies. */
export const InviteKeySchema = z
  .string()
  .regex(new RegExp(`^[A-Za-z0-9_-]{${INVITE_KEY_LENGTH}}$`), "invalid invite");

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

/** Exactly one of `password` or `invite` (K2.1); both or neither → 400. */
function credentialBody() {
  return z
    .object({
      name: PlayerNameSchema,
      password: PasswordSchema.optional(),
      invite: InviteKeySchema.optional(),
    })
    .strict()
    .refine((b) => (b.password === undefined) !== (b.invite === undefined), {
      message: "exactly one of password or invite",
    });
}

/** `POST /api/games/:code/join` */
export const JoinReqSchema = credentialBody();
export type JoinReq = z.input<typeof JoinReqSchema>;

/** `POST /api/games/:code/reclaim` */
export const ReclaimReqSchema = credentialBody();
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

/** `POST /api/games` (201): the auth result plus the room's invite key (K2.1). */
export const CreateGameResSchema = z
  .object({
    code: GameCodeSchema,
    token: TokenSchema,
    seatId: SeatIdSchema,
    inviteKey: InviteKeySchema,
  })
  .strict();
export type CreateGameRes = z.infer<typeof CreateGameResSchema>;

/** `GET /api/games/:code/invite` and `POST /api/games/:code/invite/reset` (K2.1). */
export const InviteResSchema = z.object({ inviteKey: InviteKeySchema }).strict();
export type InviteRes = z.infer<typeof InviteResSchema>;

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

/** Public lobby entry. These fields only (C2); no player names (K2.3). */
export const PublicGameSchema = z
  .object({
    code: GameCodeSchema,
    roomName: z.string().max(ROOM_NAME_MAX),
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
