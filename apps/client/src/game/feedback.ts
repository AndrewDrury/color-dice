/** Diff two consecutive views into H6 feedback moments (and the data the visual effects need). */
import type { Color } from "@cd/engine";
import type { ViewMessage } from "@cd/protocol";
import { feedback, type Moment } from "../fx/feedback";
import { COLORS, seatOfPlayer } from "./model";

export type FeedbackKind =
  | "yourTurn"
  | "reveal"
  | "mark"
  | "opponentMark"
  | "penalty"
  | "lock"
  | "gameOver";

export interface FeedbackEvent {
  kind: FeedbackKind;
  moment: Moment | null;
  seat?: number;
  color?: Color;
  /** Box index (marks). */
  index?: number;
  /** Row score gained (your mark). */
  delta?: number;
}

/** A view gap larger than this is a resync (reconnect), not a live step. */
export const RESYNC_GAP = 30;

/** First load, other game, stale/duplicate version, or a big gap: show it, don't announce it. */
export function isResync(prev: ViewMessage | null, next: ViewMessage): boolean {
  return (
    !prev ||
    prev.code !== next.code ||
    next.version <= prev.version ||
    next.version - prev.version > RESYNC_GAP
  );
}

export function diffViews(prev: ViewMessage | null, next: ViewMessage): FeedbackEvent[] {
  if (!prev || isResync(prev, next)) return [];
  const pg = prev.game;
  const ng = next.game;
  if (!pg || !ng) return [];
  const out: FeedbackEvent[] = [];
  const me = next.you.seat;

  if (!prev.you.canRoll && next.you.canRoll) {
    out.push({ kind: "yourTurn", moment: "yourTurn", seat: me ?? undefined });
  }
  if (pg.phase === "ACTION_1" && ng.phase !== "ACTION_1") {
    out.push({ kind: "reveal", moment: "reveal" });
  }

  for (const np of ng.players) {
    const pp = pg.players.find((p) => p.seat === np.seat);
    if (!pp) continue;
    for (const c of COLORS) {
      const before = pp.sheet.rows[c].marked;
      np.sheet.rows[c].marked.forEach((on, i) => {
        if (!on || before[i]) return;
        const mine = np.seat === me;
        out.push({
          kind: mine ? "mark" : "opponentMark",
          moment: mine ? "mark" : null,
          seat: np.seat,
          color: c,
          index: i,
          delta: mine ? np.score.rows[c] - pp.score.rows[c] : undefined,
        });
      });
    }
    if (np.sheet.penalties > pp.sheet.penalties) {
      out.push({ kind: "penalty", moment: "penalty", seat: np.seat });
    }
  }
  for (const c of ng.lockedColors) {
    if (!pg.lockedColors.includes(c)) out.push({ kind: "lock", moment: "lock", color: c });
  }
  if (pg.phase !== "GAME_OVER" && ng.phase === "GAME_OVER") {
    const won = me !== null && (ng.winners ?? []).some((id) => seatOfPlayer(id, ng) === me);
    out.push({ kind: "gameOver", moment: won ? "win" : "gameEnd" });
  }
  return out;
}

/** Sound + haptic for each moment; marks of several boxes in one view play once per moment. */
export function playMoments(events: readonly FeedbackEvent[]): void {
  const seen = new Set<Moment>();
  for (const e of events) {
    if (!e.moment || seen.has(e.moment)) continue;
    seen.add(e.moment);
    feedback(e.moment);
  }
}
