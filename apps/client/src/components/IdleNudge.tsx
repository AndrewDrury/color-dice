/**
 * T-NEW-22 (D-L12): mounted only while the game waits on the viewer. After IDLE_NUDGE_MS without
 * any tap, click or key (or `resetKey` changing, e.g. a staging change) a loud card says what to do.
 * Any interaction hides it and re-arms the timer; a hidden tab pauses the timer. The card never
 * takes pointer events or focus, so the tap that dismisses it still reaches the game.
 */
import type { ViewMessage } from "@cd/protocol";
import { useEffect, useState } from "preact/hooks";
import { feedback } from "../fx/feedback";
import { t } from "../i18n";
import { turnCta } from "./TurnBanner";
import "../styles/nudge.css";

export const IDLE_NUDGE_MS = 8000;

export interface IdleNudgeProps {
  view: ViewMessage;
  staged: boolean;
  noMove: boolean;
  /** Something else owns the screen (dice rolling, sent, dialog, roll-off, game over). */
  blocked: boolean;
  /** Changes whenever the player acts (staging etc.): restarts the timer. */
  resetKey?: string;
}

const EVENTS = ["pointerdown", "keydown", "touchstart", "click"] as const;

export default function IdleNudge({ view, staged, noMove, blocked, resetKey }: IdleNudgeProps) {
  const [shown, setShown] = useState(false);
  const hint = turnCta(view, { staged, noMove });
  const waiting =
    !blocked &&
    view.game?.phase !== "GAME_OVER" &&
    (view.pausedSeatIds ?? []).length === 0 &&
    (view.you.canRoll || (hint !== null && view.you.seat !== null));
  useEffect(() => {
    setShown(false);
    if (!waiting) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const stop = () => clearTimeout(timer);
    const arm = () => {
      stop();
      if (document.visibilityState === "hidden") return;
      timer = setTimeout(() => {
        setShown(true);
        feedback("yourTurn");
      }, IDLE_NUDGE_MS);
    };
    const activity = () => {
      setShown(false);
      arm();
    };
    const visibility = () => {
      if (document.visibilityState === "hidden") {
        stop();
        setShown(false);
      } else arm();
    };
    arm();
    for (const e of EVENTS)
      document.addEventListener(e, activity, { capture: true, passive: true });
    document.addEventListener("visibilitychange", visibility);
    return () => {
      stop();
      for (const e of EVENTS) document.removeEventListener(e, activity, { capture: true });
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [resetKey, waiting]);
  if (!shown || !waiting) return null;
  return (
    <div class="nudge" role="alert" data-testid="idle-nudge">
      <div class="nudge-card">
        <strong class="nudge-title">{t("nudge.title")}</strong>
        {hint ? <span class="nudge-hint">{hint}</span> : null}
      </div>
    </div>
  );
}
