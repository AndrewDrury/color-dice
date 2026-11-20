/** Turn steps (K4.1), early Action 2 (K1.2), any-order staging candidates and the single Submit. */
import { applyMark, type Color, canMark } from "@cd/engine";
import type { ClientMessage, LegalAction2, ViewMessage } from "@cd/protocol";
import { t } from "../i18n";
import { boxKey, playerIdOf, youPlayer } from "./model";

/** A box picked for one step: the white sum (step 1) or white + colour die (step 2). */
export interface Mark {
  color: Color;
  number: number;
}
export type StepNo = 1 | 2;
export type MarkOption = Extract<LegalAction2, { kind: "MARK" }>;

export const sameMark = (a: Mark | null, b: Mark | null): boolean =>
  a !== null && b !== null && a.color === b.color && a.number === b.number;

export function isActive(view: ViewMessage): boolean {
  const g = view.game;
  return !!g?.turn && view.you.seat !== null && g.turn.activeSeat === view.you.seat;
}

/**
 * Which decision you can make right now, or null when you wait.
 * Step 1 = the white-sum mark (everyone, ACTION_1). Step 2 = white + colour die (active player),
 * in ACTION_2 or early in ACTION_1 once your own step 1 is in (K1.2).
 */
export function currentStep(view: ViewMessage): StepNo | null {
  const g = view.game;
  if (!g || view.you.seat === null) return null;
  const active = isActive(view);
  if (g.phase === "ACTION_1") {
    const submitted = g.players.find((p) => p.seat === view.you.seat)?.action1Submitted;
    if (view.you.action1Decision === null && !submitted) return 1;
    if (active && !view.you.pendingAction2 && view.you.legalAction2.length > 0) return 2;
    return null;
  }
  return g.phase === "ACTION_2" && active ? 2 : null;
}

/** Early Action 2 options for the active player given a (staged) step-1 mark. */
export function early2Options(view: ViewMessage, s1: Mark | null): MarkOption[] {
  const g = view.game;
  const me = youPlayer(view);
  if (!g?.roll || !me) return [];
  const out: MarkOption[] = [];
  for (const color of ["RED", "YELLOW", "GREEN", "BLUE"] as const) {
    const face = g.roll.colored[color];
    if (face === undefined || g.lockedColors.includes(color)) continue;
    const r = me.sheet.rows[color];
    let row = { color, marked: r.marked, lockCrossed: r.lockCrossed };
    if (s1?.color === color && canMark(row, s1.number, g.lockedColors).ok) {
      row = applyMark(row, s1.number).row;
    }
    for (const whiteDie of [0, 1] as const) {
      const number = g.roll.white[whiteDie] + face;
      if (canMark(row, number, g.lockedColors).ok) {
        out.push({ kind: "MARK", whiteDie, color, number });
      }
    }
  }
  return out;
}

/** Step-2 mark options: the server's list, or (active, step 1) computed from your staged step 1. */
function step2Options(view: ViewMessage, s1: Mark | null): MarkOption[] {
  if (currentStep(view) === 1) return isActive(view) ? early2Options(view, s1) : [];
  return view.you.legalAction2.filter((a): a is MarkOption => a.kind === "MARK");
}

/**
 * Boxes you can pick now, split by what they would be (D-L3, D-L5). `white`: the white sum, only
 * where a staged colour mark `s2` stays legal when the white mark goes first. `colour`: Action 2
 * boxes given the staged (or hovered) white box. A box in both counts as white unless step 1 is
 * staged, so each key has one meaning.
 */
export function candidates(
  view: ViewMessage,
  s1: Mark | null,
  s2: Mark | null,
  hover: Mark | null = null,
): { white: Set<string>; colour: Set<string> } {
  const white = new Set<string>();
  const colour = new Set<string>();
  const g = view.game;
  const step = currentStep(view);
  if (!g || !step) return { white, colour };
  if (step === 1 && g.roll) {
    for (const a of view.you.legalAction1) {
      if (a.kind !== "MARK") continue;
      const w = { color: a.color, number: g.roll.whiteSum };
      if (!s2 || early2Options(view, w).some((o) => sameMark(o, s2))) {
        white.add(boxKey(w.color, w.number));
      }
    }
  }
  for (const o of step2Options(view, s1 ?? hover)) colour.add(boxKey(o.color, o.number));
  if (s1) for (const k of colour) white.delete(k);
  return { white, colour };
}

/** Did you mark in this turn's Action 1? (`you.markedThisTurn` if the server sends it.) */
export function markedInAction1(view: ViewMessage): boolean {
  const g = view.game;
  if (!g || view.you.seat === null) return false;
  if (g.phase === "ACTION_1") return view.you.action1Decision?.kind === "MARK";
  const flag = (view.you as { markedThisTurn?: unknown }).markedThisTurn;
  if (typeof flag === "boolean") return flag;
  const me = playerIdOf(view.you.seat);
  let from = 0;
  g.events.forEach((e, i) => {
    if (e.type === "TURN_STARTED") from = i;
  });
  return g.events
    .slice(from)
    .some((e) => e.type === "MARKED" && e.playerId === me && e.action === 1);
}

/** Submitting nothing as the active player without any mark this turn costs −5 (K4.1). */
export function passTakesPenalty(view: ViewMessage): boolean {
  if (!isActive(view)) return false;
  const step = currentStep(view);
  return step === 1 || (step === 2 && !markedInAction1(view));
}

/** The matching step-2 option (duplicate white/colour sums make the same number: first wins). */
export function findOption(view: ViewMessage, s1: Mark | null, s2: Mark): MarkOption | null {
  return step2Options(view, s1).find((a) => a.color === s2.color && a.number === s2.number) ?? null;
}

/**
 * The one Submit (D-L3): the active player sends Action 1 then Action 2 (each a mark or a pass) in
 * rule order; a passive player sends Action 1. Null when the staged marks are no longer legal.
 */
export function submitMessage(
  view: ViewMessage,
  s1: Mark | null,
  s2: Mark | null,
): ClientMessage | null {
  const turn = view.game?.turn?.number;
  const step = currentStep(view);
  if (!turn || !step) return null;
  const m = s2 ? findOption(view, s1, s2) : null;
  if (s2 && !m) return null;
  const a2 = m
    ? ({ kind: "MARK", whiteDie: m.whiteDie, color: m.color } as const)
    : ({ kind: "PASS" } as const);
  if (step === 2) return { type: "action2", turn, ...a2 };
  if (s1 && !view.you.legalAction1.some((a) => a.kind === "MARK" && a.color === s1.color)) {
    return null;
  }
  const a1 = s1 ? ({ kind: "MARK", color: s1.color } as const) : ({ kind: "PASS" } as const);
  return isActive(view)
    ? { type: "turn", turn, action1: a1, action2: a2 }
    : { type: "action1", turn, ...a1 };
}

/** Dice to ring in the tray while a step-2 box is staged. */
export function highlightFor(
  view: ViewMessage,
  s1: Mark | null,
  s2: Mark | null,
): { white: 0 | 1; color: Color } | null {
  if (!s2) return null;
  const m = findOption(view, s1, s2);
  return m ? { white: m.whiteDie, color: m.color } : null;
}

/** Your decided-but-unrevealed marks (shown as ghost ✕ until the turn resolves). */
export function decidedMarks(view: ViewMessage): Mark[] {
  const out: Mark[] = [];
  const g = view.game;
  if (g?.phase !== "ACTION_1") return out;
  const a1 = view.you.action1Decision;
  if (a1?.kind === "MARK" && g.roll) out.push({ color: a1.color, number: g.roll.whiteSum });
  const a2 = view.you.pendingAction2;
  const face = a2?.kind === "MARK" ? g.roll?.colored[a2.color] : undefined;
  if (a2?.kind === "MARK" && g.roll && face !== undefined) {
    out.push({ color: a2.color, number: g.roll.white[a2.whiteDie] + face });
  }
  return out;
}

/** Passive player whose only Action 1 option is Pass (K4.9). */
export function noWhiteSumMove(view: ViewMessage): boolean {
  const g = view.game;
  if (g?.phase !== "ACTION_1" || view.you.seat === null || isActive(view)) return false;
  if (currentStep(view) !== 1) return false;
  return !view.you.legalAction1.some((a) => a.kind === "MARK");
}

/** The Submit label (D-L4): "Submit" with something staged, else Pass (or Pass (−5) when it costs). */
export function submitLabel(view: ViewMessage, staged: boolean): string {
  if (staged) return t("action.submit");
  return passTakesPenalty(view) ? t("action.passPenalty") : t("action.pass");
}

/** Seats still to decide (or the active player in Action 2): the "Waiting for …" list. */
export function waitingNames(view: ViewMessage, name: (seat: number) => string): string[] {
  const g = view.game;
  if (!g) return [];
  if (g.phase === "ACTION_2") {
    return g.turn && g.turn.activeSeat !== view.you.seat ? [name(g.turn.activeSeat)] : [];
  }
  if (g.phase !== "ACTION_1") return [];
  return g.players
    .filter((p) => p.seat !== view.you.seat && !(p.decided ?? p.action1Submitted))
    .map((p) => name(p.seat));
}
