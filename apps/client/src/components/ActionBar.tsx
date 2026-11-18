/** Sticky bottom bar (inline on desktop): status text, Pass and the one primary action. */
import type { Color } from "@cd/engine";
import type { ViewMessage } from "@cd/protocol";
import { cssColor } from "../game/model";
import { canPass, passLabel, passTakesPenalty, type Staged } from "../game/staging";
import { colorName, t, useT } from "../i18n";
import { RollButton, type RollControls } from "./DiceTray";
import { StatusBar } from "./StatusBar";

export interface ActionBarProps {
  view: ViewMessage;
  status: string;
  announce: string;
  staged: Staged | null;
  /** Sent, waiting for the next view or an error. */
  sent: boolean;
  /** Dice still tumbling: no marking yet. */
  gated: boolean;
  /** Roll press handlers from the tray (hold to shake, release to throw). */
  rollControls: { current: RollControls | null };
  /** The dice are tumbling: Roll is disabled. */
  rolling?: boolean;
  onPass: () => void;
  onConfirm: () => void;
}

export function ActionBar(p: ActionBarProps) {
  useT();
  const { view, staged } = p;
  const passStaged = staged?.kind === "PASS";
  const markStaged: { color: Color; number: number } | null =
    staged?.kind === "MARK" ? staged : null;
  const disabled = p.sent || p.gated;
  const penalty = passTakesPenalty(view);

  let primary: preact.JSX.Element;
  if (view.you.canRoll) {
    primary = (
      <RollButton controls={p.rollControls} class="btn btn-primary g-primary" disabled={p.rolling}>
        {t("action.roll")}
      </RollButton>
    );
  } else if (markStaged) {
    primary = (
      <button
        type="button"
        class={`btn g-primary g-mark c-${cssColor(markStaged.color)}`}
        disabled={disabled}
        onClick={p.onConfirm}
      >
        {t("action.mark", { color: colorName(markStaged.color), n: markStaged.number })}
      </button>
    );
  } else if (passStaged) {
    primary = (
      <button
        type="button"
        class={`btn g-primary ${penalty ? "g-danger" : "btn-primary"}`}
        disabled={disabled}
        onClick={p.onConfirm}
      >
        {t("action.confirmPass")}
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
      <div class="g-actions">
        {canPass(view) && !view.you.canRoll ? (
          <button
            type="button"
            class={`btn g-pass${passStaged ? (penalty ? " is-danger" : " is-staged") : ""}`}
            aria-pressed={passStaged ? "true" : undefined}
            disabled={disabled}
            onClick={p.onPass}
          >
            {passLabel(view, passStaged)}
          </button>
        ) : null}
        {primary}
      </div>
    </div>
  );
}
