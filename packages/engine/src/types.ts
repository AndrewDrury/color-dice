import type { ErrorCode, IllegalReason } from "./errors";

export type Color = "RED" | "YELLOW" | "GREEN" | "BLUE";
export type Face = 1 | 2 | 3 | 4 | 5 | 6;
export type PlayerId = string;
export type Penalties = 0 | 1 | 2 | 3 | 4;

export interface RowState {
  color: Color;
  /** Length 11; marked[i] = box at index i is crossed. */
  marked: boolean[];
  /** Lock box crossed (only by this player's own lock). */
  lockCrossed: boolean;
}

export interface ScoreSheet {
  rows: Record<Color, RowState>;
  penalties: Penalties;
}

export interface Player {
  id: PlayerId;
  displayName: string;
  /** 0..N-1, turn order. */
  seat: number;
  sheet: ScoreSheet;
}

export type Phase = "SETUP" | "AWAIT_ROLL" | "ACTION_1" | "ACTION_2" | "GAME_OVER";

export interface DiceRoll {
  white: [Face, Face];
  /** Only dice still in play. */
  colored: Partial<Record<Color, Face>>;
}

export interface DiceSource {
  rollDie(): Face;
}

export type Action1Decision = { kind: "PASS" } | { kind: "MARK"; color: Color };
export type Action2Decision = { kind: "PASS" } | { kind: "MARK"; whiteDie: 0 | 1; color: Color };

export interface TurnState {
  /** 1-based. */
  turnNumber: number;
  activeSeat: number;
  roll: DiceRoll | null;
  /** Decisions submitted so far (hidden until ACTION1_REVEALED). */
  action1Decisions: Record<PlayerId, Action1Decision>;
  /**
   * The active player's early Action 2 decision (spec §17 A-2), submitted during
   * ACTION_1 after their own Action 1 decision. Hidden from other players; applied
   * (or voided) when Action 1 resolves. Always null outside ACTION_1.
   */
  pendingAction2: Action2Decision | null;
  activeMarkedThisTurn: boolean;
  /** Marks applied during this turn, newest last. Used only for in-turn undo. */
  appliedMarks: { playerId: PlayerId; action: 1 | 2; color: Color; index: number }[];
}

export type EndReason =
  | { kind: "PENALTIES"; playerIds: PlayerId[] }
  | { kind: "TWO_ROWS_LOCKED"; lockedColors: Color[] };

export interface GameState {
  /** Sorted by seat. */
  players: Player[];
  /** Global locks / removed dice, kept in canonical COLORS order. */
  lockedColors: Color[];
  phase: Phase;
  turn: TurnState | null;
  endReason: EndReason | null;
  /** Append-only audit log (spec §11). */
  log: GameEvent[];
}

export interface PlayerScore {
  playerId: PlayerId;
  total: number;
}

/** Audit-log events (spec §11). */
export type GameEvent =
  | { type: "GAME_CREATED"; players: { id: PlayerId; displayName: string; seat: number }[] }
  | {
      type: "FIRST_PLAYER_CHOSEN";
      seat: number;
      method: "CONFIGURED" | "ROLL_OFF";
      /** `rounds[r][seat]` = face rolled by `seat` in round r (spec §17 A-1). Empty if CONFIGURED. */
      rounds: Face[][];
    }
  | { type: "TURN_STARTED"; turnNumber: number; activeSeat: number }
  | {
      type: "DICE_ROLLED";
      white: [Face, Face];
      colored: Partial<Record<Color, Face>>;
      whiteSum: number;
    }
  | { type: "ACTION1_SUBMITTED"; playerId: PlayerId }
  | {
      type: "ACTION1_REVEALED";
      /** In seat order. */
      decisions: { playerId: PlayerId; decision: Action1Decision }[];
    }
  | {
      type: "MARKED";
      playerId: PlayerId;
      action: 1 | 2;
      color: Color;
      number: number;
      index: number;
      whiteDie?: 0 | 1;
      lockedNow: boolean;
    }
  | { type: "ROW_LOCKED"; color: Color; lockedBy: PlayerId[]; action: 1 | 2 }
  | { type: "DIE_REMOVED"; color: Color }
  | { type: "ACTION2_PASSED"; playerId: PlayerId }
  /** An early Action 2 became illegal during Action 1 resolution (spec §17 A-2). */
  | { type: "ACTION2_VOIDED"; playerId: PlayerId; reason: IllegalReason }
  | { type: "PENALTY"; playerId: PlayerId; total: number }
  | {
      type: "UNDO";
      playerId: PlayerId;
      kind: "ACTION1" | "ACTION2" | "MARK";
      color?: Color;
      index?: number;
    }
  | {
      type: "GAME_ENDED";
      reason: EndReason;
      /** In seat order. */
      scores: PlayerScore[];
      winners: PlayerId[];
    };

export type GameEventType = GameEvent["type"];

export interface EngineError {
  code: ErrorCode;
  reason?: IllegalReason;
}

/** Outcome of every engine command: the new state and the events it produced, or an error. */
export type Result =
  | { ok: true; state: GameState; events: GameEvent[] }
  | { ok: false; error: EngineError };

/** A command as the server receives it (spec §16). */
export type Command =
  | { type: "ROLL"; playerId: PlayerId }
  | { type: "ACTION1"; playerId: PlayerId; decision: Action1Decision }
  | { type: "ACTION2"; playerId: PlayerId; decision: Action2Decision }
  | { type: "UNDO"; playerId: PlayerId }
  /** Active player's Action 1 + early Action 2 in one command (spec §17 A-2). */
  | { type: "TURN"; playerId: PlayerId; action1: Action1Decision; action2: Action2Decision };
