/** Turn steps (K4.1), early Action 2 (K1.2), staging helpers and one-click pass wording (K4.4). */
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

/** Step-2 mark options for the staged state: the server's list, or computed from your step 1. */
function step2Options(view: ViewMessage, s1: Mark | null): MarkOption[] {
  if (currentStep(view) === 1) return s1 && isActive(view) ? early2Options(view, s1) : [];
  return view.you.legalAction2.filter((a): a is MarkOption => a.kind === "MARK");
}

/** Legal boxes keyed `COLOR:number`; with `s1` staged: that box plus the step-2 boxes. */
export function legalBoxes(view: ViewMessage, s1: Mark | null = null): Set<string> {
  const out = new Set<string>();
  const g = view.game;
  const step = currentStep(view);
  if (!g || !step) return out;
  if (step === 1) {
    if (!g.roll) return out;
    for (const a of view.you.legalAction1) {
      if (a.kind === "MARK") out.add(boxKey(a.color, g.roll.whiteSum));
    }
    if (s1 && isActive(view)) {
      out.clear();
      out.add(boxKey(s1.color, s1.number));
    }
  }
  if (step === 2 || (step === 1 && s1)) {
    for (const a of step2Options(view, s1)) out.add(boxKey(a.color, a.number));
  }
  return out;
}

/** Is there a pass button to show? (Step 2 is always passable after a staged step 1.) */
export function canPass(view: ViewMessage, s1: Mark | null = null): boolean {
  const step = currentStep(view);
  if (step === 1) {
    return s1 && isActive(view) ? true : view.you.legalAction1.some((a) => a.kind === "PASS");
  }
  if (step === 2) return view.you.legalAction2.some((a) => a.kind === "PASS");
  return false;
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

/** Passing step 2 as the active player without any mark this turn costs −5 (K4.1). */
export function passTakesPenalty(view: ViewMessage, s1: Mark | null = null): boolean {
  if (!isActive(view) || s1) return false;
  const step = currentStep(view);
  return step === 2 && !markedInAction1(view);
}

/** The pass for the current step (K4.4: sent at once). With your step 1 staged it is step 2's. */
export function passMessage(view: ViewMessage, s1: Mark | null): ClientMessage | null {
  const turn = view.game?.turn?.number;
  const step = currentStep(view);
  if (!turn || !step) return null;
  if (step === 1) {
    if (s1 && isActive(view)) {
      return {
        type: "turn",
        turn,
        action1: { kind: "MARK", color: s1.color },
        action2: { kind: "PASS" },
      };
    }
    return { type: "action1", turn, kind: "PASS" };
  }
  return { type: "action2", turn, kind: "PASS" };
}

/** The matching step-2 option (duplicate white/colour sums make the same number: first wins). */
export function findOption(view: ViewMessage, s1: Mark | null, s2: Mark): MarkOption | null {
  return step2Options(view, s1).find((a) => a.color === s2.color && a.number === s2.number) ?? null;
}

/** The socket message for the staged marks, or null when they are no longer legal. */
export function buildMessage(
  view: ViewMessage,
  s1: Mark | null,
  s2: Mark | null,
): ClientMessage | null {
  const turn = view.game?.turn?.number;
  const step = currentStep(view);
  if (!turn || !step) return null;
  if (step === 1) {
    if (!s1 || !legalBoxes(view).has(boxKey(s1.color, s1.number))) return null;
    if (!s2) return { type: "action1", turn, kind: "MARK", color: s1.color };
    const m = findOption(view, s1, s2);
    if (!m) return null;
    return {
      type: "turn",
      turn,
      action1: { kind: "MARK", color: s1.color },
      action2: { kind: "MARK", whiteDie: m.whiteDie, color: m.color },
    };
  }
  if (!s2) return null;
  const m = findOption(view, null, s2);
  if (!m) return null;
  return { type: "action2", turn, kind: "MARK", whiteDie: m.whiteDie, color: m.color };
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
  return !view.you.legalAction1.some((a) => a.kind === "MARK");
}

export function passLabel(view: ViewMessage, s1: Mark | null = null): string {
  if (passTakesPenalty(view, s1)) return t("action.passPenalty");
  const early = currentStep(view) === 1 && isActive(view) && !s1;
  return early ? t("action.skip") : t("action.pass");
}
