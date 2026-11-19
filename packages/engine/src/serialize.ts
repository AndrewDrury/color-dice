import type { GameState } from "./types";

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

function canonical(value: unknown): Json {
  if (value === null || typeof value !== "object") {
    if (typeof value === "number" && !Number.isFinite(value)) {
      throw new TypeError("cannot serialize non-finite number");
    }
    return value as Json;
  }
  if (Array.isArray(value)) return value.map((v) => (v === undefined ? null : canonical(v)));
  const out: { [k: string]: Json } = {};
  for (const key of Object.keys(value).sort()) {
    const v = (value as Record<string, unknown>)[key];
    if (v === undefined) continue;
    Object.defineProperty(out, key, {
      value: canonical(v),
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
  return out;
}

/** Serialize a state with stable (sorted) key order. */
export function toJSON(state: GameState): string {
  return JSON.stringify(canonical(state));
}

const COLOR_NAMES = ["RED", "YELLOW", "GREEN", "BLUE"];
const PHASES = ["SETUP", "AWAIT_ROLL", "ACTION_1", "ACTION_2", "GAME_OVER"];

const isObj = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);

function corrupt(why: string): never {
  throw new TypeError(`invalid GameState JSON: ${why}`);
}

function checkPlayer(p: unknown, index: number): void {
  const at = `players[${index}]`;
  if (!isObj(p)) corrupt(`${at} is not an object`);
  if (typeof p.id !== "string" || typeof p.displayName !== "string") corrupt(`${at} id/name`);
  if (p.seat !== index) corrupt(`${at}.seat must equal its index`);
  const sheet = p.sheet;
  if (!isObj(sheet) || !isObj(sheet.rows)) corrupt(`${at}.sheet`);
  if (
    !Number.isInteger(sheet.penalties) ||
    (sheet.penalties as number) < 0 ||
    (sheet.penalties as number) > 4
  ) {
    corrupt(`${at}.sheet.penalties`);
  }
  for (const color of COLOR_NAMES) {
    const row = sheet.rows[color];
    if (!isObj(row) || row.color !== color) corrupt(`${at}.sheet.rows.${color}`);
    const marked = row.marked;
    if (
      !Array.isArray(marked) ||
      marked.length !== 11 ||
      marked.some((m) => typeof m !== "boolean")
    ) {
      corrupt(`${at}.sheet.rows.${color}.marked must be 11 booleans`);
    }
    if (typeof row.lockCrossed !== "boolean") corrupt(`${at}.sheet.rows.${color}.lockCrossed`);
  }
}

/** `turn.pendingAction2`: absent (older saves) becomes null; only ACTION_1 may hold one. */
function checkPendingAction2(turn: Record<string, unknown>, phase: string): void {
  const p = turn.pendingAction2;
  if (p === undefined || p === null) {
    turn.pendingAction2 = null;
    return;
  }
  if (phase !== "ACTION_1") corrupt("turn.pendingAction2 outside ACTION_1");
  if (!isObj(p)) corrupt("turn.pendingAction2");
  if (p.kind === "PASS" && Object.keys(p).length === 1) return;
  if (
    p.kind === "MARK" &&
    (p.whiteDie === 0 || p.whiteDie === 1) &&
    typeof p.color === "string" &&
    COLOR_NAMES.includes(p.color) &&
    Object.keys(p).length === 3
  ) {
    return;
  }
  corrupt("turn.pendingAction2");
}

const isFaceValue = (f: unknown) => Number.isInteger(f) && (f as number) >= 1 && (f as number) <= 6;

/**
 * `FIRST_PLAYER_CHOSEN.rounds` must be face arrays (spec §17 A-1). An older save
 * with the pre-amendment `rolls` field is migrated to `rounds: []` (the sequential
 * rolls cannot be expressed as simultaneous rounds).
 */
function checkFirstPlayerEvent(e: unknown, i: number): void {
  if (!isObj(e) || e.type !== "FIRST_PLAYER_CHOSEN") return;
  if (e.rounds === undefined && Array.isArray(e.rolls)) {
    delete e.rolls;
    e.rounds = [];
    return;
  }
  const rounds = e.rounds;
  if (!Array.isArray(rounds) || rounds.some((r) => !Array.isArray(r) || !r.every(isFaceValue))) {
    corrupt(`log[${i}].rounds`);
  }
}

/** Parse a state produced by `toJSON`. Throws a TypeError naming the problem on corrupt input. */
export function fromJSON(text: string): GameState {
  const parsed: unknown = JSON.parse(text);
  if (!isObj(parsed)) corrupt("not an object");
  const { players, lockedColors, log, phase, turn } = parsed;
  if (!Array.isArray(players) || players.length < 1) corrupt("players");
  if (!Array.isArray(lockedColors)) corrupt("lockedColors");
  if (!Array.isArray(log)) corrupt("log");
  if (typeof phase !== "string" || !PHASES.includes(phase)) corrupt("phase");
  players.forEach(checkPlayer);
  if (
    lockedColors.some((c) => typeof c !== "string" || !COLOR_NAMES.includes(c)) ||
    new Set(lockedColors).size !== lockedColors.length
  ) {
    corrupt("lockedColors must be distinct colors");
  }
  if (turn !== null && turn !== undefined) {
    if (!isObj(turn)) corrupt("turn");
    const seat = turn.activeSeat;
    if (!Number.isInteger(seat) || (seat as number) < 0 || (seat as number) >= players.length) {
      corrupt("turn.activeSeat out of range");
    }
    checkPendingAction2(turn, phase);
    if (turn.appliedMarks === undefined) turn.appliedMarks = [];
  }
  log.forEach(checkFirstPlayerEvent);
  return parsed as unknown as GameState;
}
