import type {
  Action1Decision,
  Action2Decision,
  Color,
  EndReason,
  Face,
  GameEvent,
  GameEventType,
  Phase,
  PlayerId,
} from "@cd/engine";
import { z } from "zod";
import type { ChatEntry } from "./chat";
import type { ClientMessageType } from "./client-messages";
import {
  ColorSchema,
  type CpuCount,
  CpuCountSchema,
  GameCodeSchema,
  type MaxPlayers,
  MaxPlayersSchema,
  type RoomStatus,
  RoomStatusSchema,
  SeatIdSchema,
} from "./common";
import { type ErrorCode, ErrorCodeSchema } from "./errors";
import { type PublicGame, PublicGameSchema } from "./http";
import { PLAYER_NAME_MAX, PUBLIC_LIST_MAX, ROOM_NAME_MAX, VIEW_EVENTS } from "./limits";
import { type Profile, ProfileSchema } from "./profile";

/* ---------- The per-player view (C7) ---------- */

export interface ViewRoom {
  name: string;
  listed: boolean;
  maxPlayers: MaxPlayers;
  cpuCount: CpuCount;
  status: RoomStatus;
  /** Epoch ms; only meaningful to the host (lockout warning). */
  joinLockedUntil: number | null;
}

export interface ViewSeat {
  seatId: string;
  name: string;
  host: boolean;
  kind: "human" | "cpu";
  online: boolean;
  away: boolean;
  /** The seat left the game for good (K2.2). */
  left: boolean;
  /** Wins/ties/losses in this room across rematches. Public. */
  record: { wins: number; ties: number; losses: number };
  /** Public cosmetic profile (T-NEW-13); absent only from an older server. */
  profile?: Profile;
}

export interface ViewRow {
  /** Length 11. */
  marked: boolean[];
  lockCrossed: boolean;
  /** Present when the server forwards the engine row as-is. */
  color?: Color;
}

export interface ViewPlayer {
  seat: number;
  seatId: string;
  /** `null` for other seats until GAME_OVER (hidden information). */
  sheet: { rows: Record<Color, ViewRow>; penalties: number } | null;
  score: { rows: Record<Color, number> | null; penalties: number; total: number };
  /** Boolean only — never the choice. */
  action1Submitted: boolean;
  /** Has an Action 1 decision this turn (ACTION_1/ACTION_2); booleans only. Optional for old clients. */
  decided?: boolean;
}

/** A player entry whose card is visible (your own, or anyone's at GAME_OVER). */
export type FullViewPlayer = ViewPlayer & {
  sheet: NonNullable<ViewPlayer["sheet"]>;
  score: ViewPlayer["score"] & { rows: NonNullable<ViewPlayer["score"]["rows"]> };
};

export interface ViewGame {
  phase: Phase;
  turn: { number: number; activeSeat: number } | null;
  roll: {
    white: [Face, Face];
    colored: Partial<Record<Color, Face>>;
    whiteSum: number;
  } | null;
  lockedColors: Color[];
  players: ViewPlayer[];
  /** Last `VIEW_EVENTS` engine events, already redacted (no hidden Action 1 choices). */
  events: GameEvent[];
  endReason: EndReason | null;
  winners: PlayerId[] | null;
}

export type LegalAction2 =
  | { kind: "PASS" }
  | { kind: "MARK"; whiteDie: 0 | 1; color: Color; number: number };

export interface ViewYou {
  seatId: string;
  host: boolean;
  /** Engine seat index once the game started; null in the lobby. */
  seat: number | null;
  /** Only your own decision; never another seat's. */
  action1Decision: Action1Decision | null;
  /**
   * Your own early Action 2 (active player, ACTION_1 only, K1.2); never another
   * seat's.
   */
  pendingAction2: Action2Decision | null;
  legalAction1: Action1Decision[];
  /**
   * ACTION_2: the active player's options. ACTION_1: the active player's early
   * Action 2 options once their own Action 1 is in and nothing is pending (K1.2).
   */
  legalAction2: LegalAction2[];
  canRoll: boolean;
  canUndo: boolean;
}

/**
 * Opening roll-off in progress (T-NEW-2, spec A-2). Dice are server-rolled and carry no
 * strategy, so a seat's face is public as soon as it rolls (D-L1, `faces`). When the top
 * face is tied, the round moves to `completed` and only the tied seats roll the next one;
 * the others are out of it (`eligible` false, face 0).
 */
export interface ViewRollOff {
  /** 1-based round being rolled now. */
  round: number;
  /** Per seat index: has this seat rolled in the current round? (Out seats count as rolled.) */
  rolled: boolean[];
  /** Per seat index: seats rolling this round (the others are out of it). */
  eligible: boolean[];
  /** Per seat index: the face rolled this round, null before it rolls, 0 if out of the round. */
  faces: (number | null)[];
  /** Fully revealed rounds, one entry per seat each (0 = out); each ended in a tie for highest. */
  completed: number[][];
}

export interface ViewMessage {
  type: "view";
  version: number;
  code: string;
  room: ViewRoom;
  seats: ViewSeat[];
  game: ViewGame | null;
  /** Present only while the opening roll-off runs (game is null then). */
  rollOff?: ViewRollOff | null;
  /**
   * Automatic pause (T-NEW-3): seat ids of players who are offline. While non-empty nothing
   * advances; the game resumes by itself when they reconnect. Absent/empty = not paused.
   */
  pausedSeatIds?: string[];
  you: ViewYou;
}

/* ---------- Other server → client messages ---------- */

export interface ErrorMessage {
  type: "error";
  code: ErrorCode;
  reason?: string;
  /** The client message type that failed; null when the frame could not be parsed. */
  command: ClientMessageType | null;
}
export interface KickedMessage {
  type: "kicked";
}
export interface SessionEndedMessage {
  type: "sessionEnded";
}
export interface PongMessage {
  type: "pong";
}

/** Sent to every authenticated socket in the room, including the sender. */
export type ChatMessage = { type: "chat" } & ChatEntry;
/** Sent once after `auth`, right after the first `view`: last text messages only. */
export interface ChatHistoryMessage {
  type: "chatHistory";
  messages: ChatEntry[];
}

/** A pending rematch request (T-NEW-30). Display data only: no tokens, no hidden state. */
export interface RematchOffer {
  fromSeatId: string;
  fromName: string;
  fromProfile: Profile;
  /** Seats that said yes (the requester included). */
  accepted: string[];
  /** Epoch ms; the offer is dropped 10 minutes after it was sent. */
  expiresAt: number;
}
/** Why an offer went away (absent while it is pending). */
export type RematchEnd = "started" | "declined" | "cancelled" | "expired";
/** Sent to the room's game sockets and watch sockets of non-left seats: the offer now, or null. */
export interface RematchOfferMessage {
  type: "rematchOffer";
  offer: RematchOffer | null;
  reason?: RematchEnd;
  /** Display name of the seat that declined. */
  by?: string;
}

export type ServerMessage =
  | RematchOfferMessage
  | ViewMessage
  | ErrorMessage
  | KickedMessage
  | SessionEndedMessage
  | PongMessage
  | ChatMessage
  | ChatHistoryMessage;

/** Lobby socket: the only message it ever sends. */
export interface LobbyMessage {
  type: "games";
  games: PublicGame[];
}

/* ---------- Schema for `view` (for client tests validating fixtures) ---------- */

const GAME_EVENT_TYPES = [
  "GAME_CREATED",
  "FIRST_PLAYER_CHOSEN",
  "TURN_STARTED",
  "DICE_ROLLED",
  "ACTION1_SUBMITTED",
  "ACTION1_REVEALED",
  "MARKED",
  "ROW_LOCKED",
  "DIE_REMOVED",
  "ACTION2_PASSED",
  "ACTION2_VOIDED",
  "PENALTY",
  "UNDO",
  "GAME_ENDED",
] as const satisfies readonly GameEventType[];
// Compile-time check that the list above is exhaustive.
type _MissingEventType = Exclude<GameEventType, (typeof GAME_EVENT_TYPES)[number]>;
const _eventTypesExhaustive: _MissingEventType extends never ? true : false = true;
void _eventTypesExhaustive;

const FaceSchema = z.literal([1, 2, 3, 4, 5, 6]);
const NonNegInt = z.number().int().min(0);
const PhaseSchema = z.enum(["SETUP", "AWAIT_ROLL", "ACTION_1", "ACTION_2", "GAME_OVER"]);
const Action1DecisionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("PASS") }).strict(),
  z.object({ kind: z.literal("MARK"), color: ColorSchema }).strict(),
]);
const Action2DecisionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("PASS") }).strict(),
  z.object({ kind: z.literal("MARK"), whiteDie: z.literal([0, 1]), color: ColorSchema }).strict(),
]);
const LegalAction2Schema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("PASS") }).strict(),
  z
    .object({
      kind: z.literal("MARK"),
      whiteDie: z.literal([0, 1]),
      color: ColorSchema,
      number: z.number().int().min(2).max(12),
    })
    .strict(),
]);
const RowSchema = z
  .object({
    marked: z.array(z.boolean()).length(11),
    lockCrossed: z.boolean(),
    color: ColorSchema.optional(),
  })
  .strict();
const perColor = <T extends z.ZodType>(s: T) =>
  z.object({ RED: s, YELLOW: s, GREEN: s, BLUE: s }).strict();

const ViewPlayerSchema = z
  .object({
    seat: NonNegInt,
    seatId: SeatIdSchema,
    sheet: z
      .object({ rows: perColor(RowSchema), penalties: z.number().int().min(0).max(4) })
      .strict()
      .nullable(),
    score: z
      .object({
        rows: perColor(z.number().int()).nullable(),
        penalties: z.number().int(),
        total: z.number().int(),
      })
      .strict(),
    action1Submitted: z.boolean(),
    decided: z.boolean().optional(),
  })
  .strict();

const EndReasonSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("PENALTIES"), playerIds: z.array(z.string()) }).strict(),
  z.object({ kind: z.literal("TWO_ROWS_LOCKED"), lockedColors: z.array(ColorSchema) }).strict(),
]);

const ViewGameSchema = z
  .object({
    phase: PhaseSchema,
    turn: z
      .object({ number: z.number().int().min(1), activeSeat: NonNegInt })
      .strict()
      .nullable(),
    roll: z
      .object({
        white: z.tuple([FaceSchema, FaceSchema]),
        colored: z.partialRecord(ColorSchema, FaceSchema),
        whiteSum: z.number().int().min(2).max(12),
      })
      .strict()
      .nullable(),
    lockedColors: z.array(ColorSchema).max(4),
    players: z.array(ViewPlayerSchema).max(5),
    // Event payloads are engine-defined; only the discriminator is checked here.
    events: z.array(z.looseObject({ type: z.enum(GAME_EVENT_TYPES) })).max(VIEW_EVENTS),
    endReason: EndReasonSchema.nullable(),
    winners: z.array(z.string()).nullable(),
  })
  .strict();

export const ViewMessageSchema = z
  .object({
    type: z.literal("view"),
    version: NonNegInt,
    code: GameCodeSchema,
    room: z
      .object({
        name: z.string().max(ROOM_NAME_MAX),
        listed: z.boolean(),
        maxPlayers: MaxPlayersSchema,
        cpuCount: CpuCountSchema,
        status: RoomStatusSchema,
        joinLockedUntil: NonNegInt.nullable(),
      })
      .strict(),
    seats: z
      .array(
        z
          .object({
            seatId: SeatIdSchema,
            name: z.string().max(PLAYER_NAME_MAX),
            host: z.boolean(),
            kind: z.enum(["human", "cpu"]),
            online: z.boolean(),
            away: z.boolean(),
            left: z.boolean(),
            record: z.object({ wins: NonNegInt, ties: NonNegInt, losses: NonNegInt }).strict(),
            profile: ProfileSchema.optional(),
          })
          .strict(),
      )
      .max(5),
    game: ViewGameSchema.nullable(),
    rollOff: z
      .object({
        round: z.number().int().min(1),
        rolled: z.array(z.boolean()).max(5),
        eligible: z.array(z.boolean()).max(5),
        faces: z.array(z.number().int().min(0).max(6).nullable()).max(5),
        completed: z.array(z.array(z.number().int().min(0).max(6)).max(5)).max(1000),
      })
      .strict()
      .nullable()
      .optional(),
    pausedSeatIds: z.array(SeatIdSchema).max(5).optional(),
    you: z
      .object({
        seatId: SeatIdSchema,
        host: z.boolean(),
        seat: NonNegInt.nullable(),
        action1Decision: Action1DecisionSchema.nullable(),
        pendingAction2: Action2DecisionSchema.nullable(),
        legalAction1: z.array(Action1DecisionSchema),
        legalAction2: z.array(LegalAction2Schema),
        canRoll: z.boolean(),
        canUndo: z.boolean(),
      })
      .strict(),
  })
  .strict();

export const ErrorMessageSchema = z
  .object({
    type: z.literal("error"),
    code: ErrorCodeSchema,
    reason: z.string().max(200).optional(),
    command: z
      .enum([
        "auth",
        "roll",
        "action1",
        "action2",
        "turn",
        "undo",
        "rematch",
        "rematchRequest",
        "rematchAccept",
        "rematchDecline",
        "watch",
        "ping",
        "chat",
        "react",
        "profile",
      ] as const satisfies readonly ClientMessageType[])
      .nullable(),
  })
  .strict();

export const RematchOfferSchema = z
  .object({
    fromSeatId: SeatIdSchema,
    fromName: z.string().min(1).max(PLAYER_NAME_MAX),
    fromProfile: ProfileSchema,
    accepted: z.array(SeatIdSchema).max(5),
    expiresAt: z.number().int().min(0),
  })
  .strict();
export const RematchOfferMessageSchema = z
  .object({
    type: z.literal("rematchOffer"),
    offer: RematchOfferSchema.nullable(),
    reason: z.enum(["started", "declined", "cancelled", "expired"]).optional(),
    by: z.string().min(1).max(PLAYER_NAME_MAX).optional(),
  })
  .strict();

export const KickedMessageSchema = z.object({ type: z.literal("kicked") }).strict();
export const SessionEndedMessageSchema = z.object({ type: z.literal("sessionEnded") }).strict();
export const PongMessageSchema = z.object({ type: z.literal("pong") }).strict();
export const LobbyMessageSchema = z
  .object({ type: z.literal("games"), games: z.array(PublicGameSchema).max(PUBLIC_LIST_MAX) })
  .strict();
