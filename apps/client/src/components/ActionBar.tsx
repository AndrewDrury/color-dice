/** Bottom bar (inline on desktop): the status line, one Submit (reads Pass when nothing is staged) and Undo. */
import type { ViewMessage } from "@cd/protocol";
import { seatName } from "../game/model";
import {
  currentStep,
  type Mark,
  passTakesPenalty,
  submitLabel,
  waitingNames,
} from "../game/staging";
import { joinNames, t, useT } from "../i18n";
import { StatusBar } from "./StatusBar";

export interface ActionBarProps {
  view: ViewMessage;
  status: string;
  announce: string;
  /** Staged step-1 (white sum) and step-2 (white + colour die) marks. */
  s1: Mark | null;
  s2: Mark | null;
  /** Sent, waiting for the next view or an error. */
  sent: boolean;
  /** Dice still tumbling: no marking yet. */
  gated: boolean;
  /** K4.9: passive player with no white-sum move (auto-passed). */
  noMove: boolean;
  onSubmit: () => void;
  onUndo: () => void;
}

export function ActionBar(p: ActionBarProps) {
  useT();
  const { view } = p;
  const staged = p.s1 !== null || p.s2 !== null;
  // D-L11: Undo exists only while there is something to undo (a staged box or an undoable decision).
  const canUndo = staged || (view.you.canUndo && !p.sent);

  let primary: preact.JSX.Element | null = null;
  if (p.noMove) {
    const active = view.game?.turn?.activeSeat ?? -1;
    primary = (
      <button type="button" class="btn g-primary g-nomove" disabled>
        {t("action.noMove", { name: seatName(view, active) })}
      </button>
    );
  } else if (view.you.canRoll) {
    primary = null;
  } else if (currentStep(view) !== null && !p.sent) {
    primary = (
      <button
        type="button"
        class={`btn g-primary g-submit${!staged && passTakesPenalty(view) ? " is-danger" : ""}`}
        disabled={p.gated}
        onClick={p.onSubmit}
      >
        {submitLabel(view, staged)}
      </button>
    );
  } else {
    const who = waitingNames(view, (seat) => seatName(view, seat));
    primary = (
      <button type="button" class="btn g-primary g-waiting" disabled>
        {p.sent
          ? t("action.sent")
          : who.length > 0
            ? t("action.waitingFor", { names: joinNames(who) })
            : t("action.waiting")}
      </button>
    );
  }

  return (
    <div class="g-actionbar">
      <StatusBar text={p.status} announce={p.announce} />
      {primary || canUndo ? (
        <div class="g-actions">
          {canUndo ? (
            <button type="button" class="btn g-undo" onClick={p.onUndo}>
              {t("action.undo")}
            </button>
          ) : null}
          {primary}
        </div>
      ) : null}
    </div>
  );
}
