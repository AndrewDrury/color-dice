/** Bottom bar (inline on desktop): step text, one-click Pass / Skip and the Confirm button. */
import type { ViewMessage } from "@cd/protocol";
import { cssColor, seatName } from "../game/model";
import { canPass, type Mark, passLabel, passTakesPenalty } from "../game/staging";
import { colorName, t, useT } from "../i18n";
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
  onPass: () => void;
  onConfirm: () => void;
}

export function ActionBar(p: ActionBarProps) {
  useT();
  const { view, s1, s2 } = p;
  const disabled = p.sent || p.gated;
  const last = s2 ?? s1;
  const showPass = canPass(view, s1) && !view.you.canRoll && !p.noMove;
  const penalty = passTakesPenalty(view, s1);

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
  } else if (last) {
    primary = (
      <button
        type="button"
        class={`btn g-primary g-mark c-${cssColor(last.color)}`}
        disabled={disabled}
        onClick={p.onConfirm}
      >
        {s1 && s2
          ? t("action.markBoth")
          : t("action.mark", { color: colorName(last.color), n: last.number })}
      </button>
    );
  } else {
    primary = (
      <button type="button" class="btn g-primary" disabled>
        {p.sent ? t("action.sent") : canPass(view) ? t("action.pickBox") : t("action.waiting")}
      </button>
    );
  }

  return (
    <div class="g-actionbar">
      <StatusBar text={p.status} announce={p.announce} />
      {showPass || primary ? (
        <div class="g-actions">
          {showPass ? (
            <button
              type="button"
              class={`btn g-pass${penalty ? " is-danger" : ""}`}
              disabled={disabled}
              onClick={p.onPass}
            >
              {passLabel(view, s1)}
            </button>
          ) : null}
          {primary}
        </div>
      ) : null}
    </div>
  );
}
