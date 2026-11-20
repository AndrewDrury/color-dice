import { z } from "zod";
import { REACTIONS } from "./chat";
import { ColorSchema, SeatIdSchema, TokenSchema } from "./common";
import { CHAT_RAW_MAX } from "./limits";
import { ProfileSchema } from "./profile";

/** Must equal the current engine `turnNumber` (else `E_STALE_TURN`). */
const TurnSchema = z.number().int().min(1);
const WhiteDieSchema = z.literal([0, 1]);

export const AuthMsgSchema = z.object({ type: z.literal("auth"), token: TokenSchema }).strict();

export const RollMsgSchema = z.object({ type: z.literal("roll"), turn: TurnSchema }).strict();

/**
 * Opening roll-off (T-NEW-2): the seat asks the server to roll its one die for `round`.
 * The value is never sent by the client; stale or repeated rounds are rejected.
 */
export const RollOffMsgSchema = z
  .object({ type: z.literal("rollOff"), round: z.number().int().min(1) })
  .strict();

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

/**
 * Action 2 in phase ACTION_2, or (active player only) an early Action 2 during
 * ACTION_1 after their own Action 1 (K1.2). Early ones stay hidden until resolved.
 */
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

const Action1DecisionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("PASS") }).strict(),
  z.object({ kind: z.literal("MARK"), color: ColorSchema }).strict(),
]);
const Action2DecisionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("PASS") }).strict(),
  z.object({ kind: z.literal("MARK"), whiteDie: WhiteDieSchema, color: ColorSchema }).strict(),
]);

/** Active player's Action 1 + early Action 2 in one atomic confirm (K1.2). */
export const TurnMsgSchema = z
  .object({
    type: z.literal("turn"),
    turn: TurnSchema,
    action1: Action1DecisionSchema,
    action2: Action2DecisionSchema,
  })
  .strict();

/** Host only (legacy): same as `rematchRequest`; the other seats still have to accept. */
export const RematchMsgSchema = z.object({ type: z.literal("rematch") }).strict();
/** T-NEW-30: any non-left seat asks for a rematch once the game is over (the sender accepts). */
export const RematchRequestMsgSchema = z.object({ type: z.literal("rematchRequest") }).strict();
/** Accept the pending offer; the game restarts when every non-left seat has accepted. */
export const RematchAcceptMsgSchema = z.object({ type: z.literal("rematchAccept") }).strict();
/** Decline the pending offer (the requester's own decline is a cancel). Clears it for everyone. */
export const RematchDeclineMsgSchema = z.object({ type: z.literal("rematchDecline") }).strict();
/**
 * View-only attachment (T-NEW-30): the first frame of a watch socket, in place of `auth`.
 * It authenticates with the same seat token but never counts as the seat being online.
 */
export const WatchMsgSchema = z.object({ type: z.literal("watch"), token: TokenSchema }).strict();
export const UndoMsgSchema = z.object({ type: z.literal("undo"), turn: TurnSchema }).strict();

export const PingMsgSchema = z.object({ type: z.literal("ping") }).strict();

/** Raw text is capped here; the server cleans it and enforces CHAT_TEXT_MAX. */
export const ChatMsgSchema = z
  .object({ type: z.literal("chat"), text: z.string().max(CHAT_RAW_MAX) })
  .strict();

export const ReactMsgSchema = z
  .object({ type: z.literal("react"), emoji: z.enum(REACTIONS) })
  .strict();

/** Lobby only: change the seat's colour and cat (T-NEW-13). */
export const ProfileMsgSchema = z
  .object({ type: z.literal("profile"), profile: ProfileSchema })
  .strict();

/** Every game-socket message a client may send. */
export const ClientMessageSchema = z.discriminatedUnion("type", [
  AuthMsgSchema,
  RollMsgSchema,
  RollOffMsgSchema,
  Action1MsgSchema,
  Action2MsgSchema,
  TurnMsgSchema,
  UndoMsgSchema,
  RematchMsgSchema,
  RematchRequestMsgSchema,
  RematchAcceptMsgSchema,
  RematchDeclineMsgSchema,
  WatchMsgSchema,
  PingMsgSchema,
  ChatMsgSchema,
  ReactMsgSchema,
  ProfileMsgSchema,
]);
export type ClientMessage = z.infer<typeof ClientMessageSchema>;
export type ClientMessageType = ClientMessage["type"];
export type AuthMsg = z.infer<typeof AuthMsgSchema>;
export type Action1Msg = z.infer<typeof Action1MsgSchema>;
export type Action2Msg = z.infer<typeof Action2MsgSchema>;
export type TurnMsg = z.infer<typeof TurnMsgSchema>;

/** Upper bound on a raw client frame (a CHAT_RAW_MAX chat with JSON escapes fits); anything larger is rejected before JSON.parse. */
export const MAX_CLIENT_MESSAGE_CHARS = 2048;

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
