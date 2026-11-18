/** H5 two-step staging: what is legal, what a staged choice sends, pass wording. */
import type { Color } from "@cd/engine";
import type { ClientMessage, ViewMessage } from "@cd/protocol";
import { t } from "../i18n";
import { boxKey, playerIdOf } from "./model";

export type Staged = { kind: "MARK"; color: Color; number: number } | { kind: "PASS" };

export const stagedEquals = (a: Staged | null, b: Staged | null): boolean =>
  a !== null &&
  b !== null &&
  (a.kind === "PASS"
    ? b.kind === "PASS"
    : b.kind === "MARK" && a.color === b.color && a.number === b.number);

/** Legal boxes keyed `COLOR:number` (white sum in Action 1, colour+number in Action 2). */
export function legalBoxes(view: ViewMessage): Set<string> {
  const out = new Set<string>();
  const g = view.game;
  if (!g) return out;
  if (g.phase === "ACTION_1" && g.roll) {
    for (const a of view.you.legalAction1) {
      if (a.kind === "MARK") out.add(boxKey(a.color, g.roll.whiteSum));
    }
  } else if (g.phase === "ACTION_2") {
    for (const a of view.you.legalAction2) {
      if (a.kind === "MARK") out.add(boxKey(a.color, a.number));
    }
  }
  return out;
}

export function canPass(view: ViewMessage): boolean {
  const g = view.game;
  if (g?.phase === "ACTION_1") return view.you.legalAction1.some((a) => a.kind === "PASS");
  if (g?.phase === "ACTION_2") return view.you.legalAction2.some((a) => a.kind === "PASS");
  return false;
}

/** Did you mark in this turn's Action 1? (`you.markedThisTurn` if the server sends it.) */
export function markedInAction1(view: ViewMessage): boolean {
  const flag = (view.you as { markedThisTurn?: unknown }).markedThisTurn;
  if (typeof flag === "boolean") return flag;
  const g = view.game;
  if (!g || view.you.seat === null) return false;
  const me = playerIdOf(view.you.seat);
  let from = 0;
  g.events.forEach((e, i) => {
    if (e.type === "TURN_STARTED") from = i;
  });
  return g.events
    .slice(from)
    .some((e) => e.type === "MARKED" && e.playerId === me && e.action === 1);
}

/** Passing in Action 2 as the active player without an Action 1 mark costs −5. */
export function passTakesPenalty(view: ViewMessage): boolean {
  const g = view.game;
  if (g?.phase !== "ACTION_2" || !g.turn || view.you.seat === null) return false;
  return g.turn.activeSeat === view.you.seat && !markedInAction1(view);
}

/** The socket message for a staged choice, or null when it is no longer legal. */
export function buildMessage(view: ViewMessage, staged: Staged): ClientMessage | null {
  const g = view.game;
  if (!g?.turn) return null;
  const turn = g.turn.number;
  if (g.phase === "ACTION_1") {
    if (staged.kind === "PASS") return { type: "action1", turn, kind: "PASS" };
    const ok = legalBoxes(view).has(boxKey(staged.color, staged.number));
    return ok ? { type: "action1", turn, kind: "MARK", color: staged.color } : null;
  }
  if (g.phase === "ACTION_2") {
    if (staged.kind === "PASS") return { type: "action2", turn, kind: "PASS" };
    // Duplicate (white, colour) pairs make the same number: send the first match (D2).
    const m = view.you.legalAction2.find(
      (a) => a.kind === "MARK" && a.color === staged.color && a.number === staged.number,
    );
    if (m?.kind !== "MARK") return null;
    return { type: "action2", turn, kind: "MARK", whiteDie: m.whiteDie, color: m.color };
  }
  return null;
}

/** Dice to ring in the tray while an Action 2 box is staged. */
export function highlightFor(
  view: ViewMessage,
  staged: Staged | null,
): { white: 0 | 1; color: Color } | null {
  if (staged?.kind !== "MARK" || view.game?.phase !== "ACTION_2") return null;
  const m = view.you.legalAction2.find(
    (a) => a.kind === "MARK" && a.color === staged.color && a.number === staged.number,
  );
  return m?.kind === "MARK" ? { white: m.whiteDie, color: m.color } : null;
}

export function passLabel(view: ViewMessage, staged: boolean): string {
  const penalty = passTakesPenalty(view);
  if (staged) return penalty ? t("action.passConfirm") : t("action.passAgain");
  return penalty ? t("action.passPenalty") : t("action.pass");
}
