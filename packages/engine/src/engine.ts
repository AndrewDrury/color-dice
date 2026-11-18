/**
 * Public command functions (spec §7, §16). Each one deep-copies its input and
 * never mutates it; a rejected command returns an error and no state.
 */
import { COLORS, indexOf } from "./constants";
import { applyMark, canMark } from "./rules";
import { rollFace } from "./setup";
import {
  activePlayer,
  addLock,
  type Draft,
  emit,
  findPlayer,
  finishAction2,
  getDecision,
  resolveAction1,
  setDecision,
} from "./transitions";
import type {
  Action1Decision,
  Action2Decision,
  Color,
  Command,
  DiceSource,
  EngineError,
  GameState,
  Phase,
  Player,
  PlayerId,
  Result,
  TurnState,
} from "./types";

export { type CreateGameOptions, createGame, type PlayerInput } from "./setup";

const fail = (error: EngineError): Result => ({ ok: false, error });

function isColor(v: unknown): v is Color {
  return typeof v === "string" && (COLORS as readonly string[]).includes(v);
}

/** Common preconditions: game not over, right phase, known player. */
function precheck(
  state: GameState,
  phase: Phase,
  playerId: unknown,
): EngineError | { player: Player; turn: TurnState } {
  if (state.phase === "GAME_OVER") return { code: "E_GAME_OVER" };
  if (state.phase !== phase || !state.turn) return { code: "E_WRONG_PHASE" };
  const player = findPlayer(state, playerId);
  if (!player) return { code: "E_UNKNOWN_PLAYER" };
  return { player, turn: state.turn };
}

function draft(state: GameState): Draft {
  return { state: structuredClone(state), events: [] };
}

const done = (d: Draft): Result => ({ ok: true, state: d.state, events: d.events });

/** Roll the dice for the active player (spec §7.1). */
export function roll(state: GameState, actorId: PlayerId, dice: DiceSource): Result {
  const pre = precheck(state, "AWAIT_ROLL", actorId);
  if ("code" in pre) return fail(pre);
  if (pre.player.seat !== pre.turn.activeSeat) return fail({ code: "E_NOT_ACTIVE_PLAYER" });

  const d = draft(state);
  const s = d.state;
  const turn = s.turn as TurnState;
  const white: [ReturnType<typeof rollFace>, ReturnType<typeof rollFace>] = [
    rollFace(dice),
    rollFace(dice),
  ];
  const colored: Partial<Record<Color, ReturnType<typeof rollFace>>> = {};
  for (const c of COLORS) if (!s.lockedColors.includes(c)) colored[c] = rollFace(dice);
  turn.roll = { white, colored };
  turn.action1Decisions = {};
  turn.activeMarkedThisTurn = false;
  s.phase = "ACTION_1";
  emit(d, {
    type: "DICE_ROLLED",
    white: [...white],
    colored: { ...colored },
    whiteSum: white[0] + white[1],
  });
  return done(d);
}

/** Normalize an untrusted Action 1 payload, or null if malformed. */
function parseAction1(decision: unknown): Action1Decision | null {
  if (decision === null || typeof decision !== "object") return null;
  const { kind, color } = decision as { kind?: unknown; color?: unknown };
  if (kind === "PASS") return { kind: "PASS" };
  if (kind === "MARK" && isColor(color)) return { kind: "MARK", color };
  return null;
}

/** Submit one player's hidden Action 1 decision (spec §7.2). */
export function submitAction1(
  state: GameState,
  playerId: PlayerId,
  decision: Action1Decision,
): Result {
  const pre = precheck(state, "ACTION_1", playerId);
  if ("code" in pre) return fail(pre);
  const { player, turn } = pre;
  if (getDecision(turn, player.id)) return fail({ code: "E_ALREADY_DECIDED" });
  const dec = parseAction1(decision);
  if (!dec) return fail({ code: "E_INVALID_COMMAND" });
  const r = turn.roll;
  if (!r) return fail({ code: "E_WRONG_PHASE" });
  if (dec.kind === "MARK") {
    const check = canMark(
      player.sheet.rows[dec.color],
      r.white[0] + r.white[1],
      state.lockedColors,
    );
    if (!check.ok) return fail({ code: "E_ILLEGAL_MARK", reason: check.reason });
  }

  const d = draft(state);
  const t = d.state.turn as TurnState;
  setDecision(t, player.id, dec);
  emit(d, { type: "ACTION1_SUBMITTED", playerId: player.id });
  const decided = d.state.players.filter((p) => getDecision(t, p.id)).length;
  if (decided === d.state.players.length) resolveAction1(d);
  return done(d);
}

/** Validate an untrusted Action 2 payload against the post-Action-1 state. */
function checkAction2(
  state: GameState,
  player: Player,
  turn: TurnState,
  decision: unknown,
): EngineError | Action2Decision {
  if (decision === null || typeof decision !== "object") return { code: "E_INVALID_COMMAND" };
  const { kind, color, whiteDie } = decision as {
    kind?: unknown;
    color?: unknown;
    whiteDie?: unknown;
  };
  if (kind === "PASS") return { kind: "PASS" };
  if (kind !== "MARK") return { code: "E_INVALID_COMMAND" };
  if (!isColor(color)) return { code: "E_BAD_DIE" };
  const r = turn.roll;
  const face = r?.colored[color];
  if (state.lockedColors.includes(color) || face === undefined)
    return { code: "E_DIE_NOT_IN_PLAY" };
  if (whiteDie !== 0 && whiteDie !== 1) return { code: "E_BAD_DIE" };
  const n = (r as NonNullable<typeof r>).white[whiteDie] + face;
  const check = canMark(player.sheet.rows[color], n, state.lockedColors);
  if (!check.ok) return { code: "E_ILLEGAL_MARK", reason: check.reason };
  return { kind: "MARK", color, whiteDie };
}

/** The active player's white + colored decision (spec §7.4). */
export function submitAction2(
  state: GameState,
  playerId: PlayerId,
  decision: Action2Decision,
): Result {
  const pre = precheck(state, "ACTION_2", playerId);
  if ("code" in pre) return fail(pre);
  const { player, turn } = pre;
  if (player.seat !== turn.activeSeat) return fail({ code: "E_NOT_ACTIVE_PLAYER" });
  const dec = checkAction2(state, player, turn, decision);
  if ("code" in dec) return fail(dec);

  const d = draft(state);
  const s = d.state;
  const t = s.turn as TurnState;
  const active = activePlayer(s) as Player;
  if (dec.kind === "PASS") {
    emit(d, { type: "ACTION2_PASSED", playerId: active.id });
  } else {
    const r = t.roll as NonNullable<TurnState["roll"]>;
    const n = r.white[dec.whiteDie] + (r.colored[dec.color] as number);
    const { row, lockedNow } = applyMark(active.sheet.rows[dec.color], n);
    active.sheet.rows[dec.color] = row;
    t.activeMarkedThisTurn = true;
    emit(d, {
      type: "MARKED",
      playerId: active.id,
      action: 2,
      color: dec.color,
      number: n,
      index: indexOf(dec.color, n),
      whiteDie: dec.whiteDie,
      lockedNow,
    });
    if (lockedNow) {
      addLock(s, dec.color);
      emit(d, { type: "ROW_LOCKED", color: dec.color, lockedBy: [active.id], action: 2 });
      emit(d, { type: "DIE_REMOVED", color: dec.color });
    }
  }
  finishAction2(d);
  return done(d);
}

/** Single entry point for hosts: route a command to its transition. */
export function dispatch(state: GameState, cmd: Command, dice: DiceSource): Result {
  if (cmd === null || typeof cmd !== "object") return fail({ code: "E_INVALID_COMMAND" });
  switch (cmd.type) {
    case "ROLL":
      return roll(state, cmd.playerId, dice);
    case "ACTION1":
      return submitAction1(state, cmd.playerId, cmd.decision);
    case "ACTION2":
      return submitAction2(state, cmd.playerId, cmd.decision);
    default:
      if (state.phase === "GAME_OVER") return fail({ code: "E_GAME_OVER" });
      return fail({ code: "E_INVALID_COMMAND" });
  }
}
