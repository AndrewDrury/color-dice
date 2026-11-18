import { z } from "zod";
import { ColorSchema, SeatIdSchema, TokenSchema } from "./common";

/** Must equal the current engine `turnNumber` (else `E_STALE_TURN`). */
const TurnSchema = z.number().int().min(1);
const WhiteDieSchema = z.literal([0, 1]);

export const AuthMsgSchema = z.object({ type: z.literal("auth"), token: TokenSchema }).strict();

export const RollMsgSchema = z.object({ type: z.literal("roll"), turn: TurnSchema }).strict();

export const Action1MsgSchema = z.discriminatedUnion("kind", [
  z.object({ type: z.literal("action1"), turn: TurnSchema, kind: z.literal("PASS") }).strict(),
  z
    .object({
      type: z.literal("action1"),
      turn: TurnSchema,
      kind: z.literal("MARK"),
      color: ColorSchema,
    })
    .strict(),
]);

export const Action2MsgSchema = z.discriminatedUnion("kind", [
  z.object({ type: z.literal("action2"), turn: TurnSchema, kind: z.literal("PASS") }).strict(),
  z
    .object({
      type: z.literal("action2"),
      turn: TurnSchema,
      kind: z.literal("MARK"),
      whiteDie: WhiteDieSchema,
      color: ColorSchema,
    })
    .strict(),
]);

export const SetAwayMsgSchema = z
  .object({ type: z.literal("setAway"), seatId: SeatIdSchema, away: z.boolean() })
  .strict();

export const RematchMsgSchema = z.object({ type: z.literal("rematch") }).strict();

export const PingMsgSchema = z.object({ type: z.literal("ping") }).strict();

/** Every game-socket message a client may send. */
export const ClientMessageSchema = z.discriminatedUnion("type", [
  AuthMsgSchema,
  RollMsgSchema,
  Action1MsgSchema,
  Action2MsgSchema,
  SetAwayMsgSchema,
  RematchMsgSchema,
  PingMsgSchema,
]);
export type ClientMessage = z.infer<typeof ClientMessageSchema>;
export type ClientMessageType = ClientMessage["type"];
export type AuthMsg = z.infer<typeof AuthMsgSchema>;
export type Action1Msg = z.infer<typeof Action1MsgSchema>;
export type Action2Msg = z.infer<typeof Action2MsgSchema>;

/** Upper bound on a raw client frame; anything larger is rejected before JSON.parse. */
export const MAX_CLIENT_MESSAGE_CHARS = 1024;

/**
 * Parse one raw WebSocket frame. Returns `null` for anything that is not a valid
 * client message (too long, not JSON, wrong shape, extra fields).
 */
export function parseClientMessage(raw: unknown): ClientMessage | null {
  if (typeof raw !== "string" || raw.length > MAX_CLIENT_MESSAGE_CHARS) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  const result = ClientMessageSchema.safeParse(data);
  return result.success ? result.data : null;
}
