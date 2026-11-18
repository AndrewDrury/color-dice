/** Sticky bottom bar (inline on desktop): status text, Pass and the one primary action. */
import type { Color } from "@cd/engine";
import type { ViewMessage } from "@cd/protocol";
import { COLOR_NAME, cssColor } from "../game/model";
import { canPass, passLabel, passTakesPenalty, type Staged } from "../game/staging";
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
  onRoll: () => void;
  onPass: () => void;
  onConfirm: () => void;
}

export function ActionBar(p: ActionBarProps) {
  const { view, staged } = p;
  const passStaged = staged?.kind === "PASS";
  const markStaged: { color: Color; number: number } | null =
    staged?.kind === "MARK" ? staged : null;
  const disabled = p.sent || p.gated;
  const penalty = passTakesPenalty(view);

  let primary: preact.JSX.Element;
  if (view.you.canRoll) {
    primary = (
      <button type="button" class="btn btn-primary g-primary" onClick={p.onRoll}>
        Roll
      </button>
    );
  } else if (markStaged) {
    primary = (
      <button
        type="button"
        class={`btn g-primary g-mark c-${cssColor(markStaged.color)}`}
        disabled={disabled}
        onClick={p.onConfirm}
      >
        Mark {COLOR_NAME[markStaged.color]} {markStaged.number}
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
        Confirm pass
      </button>
    );
  } else {
    primary = (
      <button type="button" class="btn g-primary" disabled>
        {p.sent ? "Sent…" : canPass(view) ? "Pick a box" : "Waiting…"}
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
