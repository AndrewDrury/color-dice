import type {
  Action1Decision,
  Color,
  EndReason,
  Face,
  GameEvent,
  GameEventType,
  Phase,
  PlayerId,
} from "@cd/engine";
import { z } from "zod";
import type { ClientMessageType } from "./client-messages";
import {
  ColorSchema,
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

/* ---------- The per-player view (C7) ---------- */

export interface ViewRoom {
  name: string;
  listed: boolean;
  maxPlayers: MaxPlayers;
  status: RoomStatus;
  /** Epoch ms; only meaningful to the host (lockout warning). */
  joinLockedUntil: number | null;
}

export interface ViewSeat {
  seatId: string;
  name: string;
  host: boolean;
  online: boolean;
  away: boolean;
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
  sheet: { rows: Record<Color, ViewRow>; penalties: number };
  score: { rows: Record<Color, number>; penalties: number; total: number };
  /** Boolean only — never the choice. */
  action1Submitted: boolean;
}

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
  legalAction1: Action1Decision[];
  legalAction2: LegalAction2[];
  canRoll: boolean;
}

export interface ViewMessage {
  type: "view";
  version: number;
  code: string;
  room: ViewRoom;
  seats: ViewSeat[];
  game: ViewGame | null;
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

export type ServerMessage =
  | ViewMessage
  | ErrorMessage
  | KickedMessage
  | SessionEndedMessage
  | PongMessage;

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
  "PENALTY",
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
      .strict(),
    score: z
      .object({
        rows: perColor(z.number().int()),
        penalties: z.number().int(),
        total: z.number().int(),
      })
      .strict(),
    action1Submitted: z.boolean(),
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
            online: z.boolean(),
            away: z.boolean(),
          })
          .strict(),
      )
      .max(5),
    game: ViewGameSchema.nullable(),
    you: z
      .object({
        seatId: SeatIdSchema,
        host: z.boolean(),
        seat: NonNegInt.nullable(),
        action1Decision: Action1DecisionSchema.nullable(),
        legalAction1: z.array(Action1DecisionSchema),
        legalAction2: z.array(LegalAction2Schema),
        canRoll: z.boolean(),
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
      .enum(["auth", "roll", "action1", "action2", "setAway", "rematch", "ping"])
      .nullable(),
  })
  .strict();

export const KickedMessageSchema = z.object({ type: z.literal("kicked") }).strict();
export const SessionEndedMessageSchema = z.object({ type: z.literal("sessionEnded") }).strict();
export const PongMessageSchema = z.object({ type: z.literal("pong") }).strict();
export const LobbyMessageSchema = z
  .object({ type: z.literal("games"), games: z.array(PublicGameSchema).max(PUBLIC_LIST_MAX) })
  .strict();
