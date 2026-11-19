/** T-NEW-9: persistent "whose turn / which step / what to press" strip under the top bar. */
import type { ViewMessage } from "@cd/protocol";
import { seatName, seatProfile } from "../game/model";
import { canPass, currentStep, type Mark, noWhiteSumMove, passLabel } from "../game/staging";
import { t, useT } from "../i18n";
import { Avatar } from "./Avatar";

export interface TurnBannerProps {
  view: ViewMessage;
  /** Boxes staged for either step (the Confirm button is up). */
  staged: boolean;
  noMove: boolean;
  s1: Mark | null;
}

/** The call to action: the one thing to press to move on, or null when you only wait. */
export function turnCta(view: ViewMessage, p: Pick<TurnBannerProps, "staged" | "noMove" | "s1">) {
  if (view.you.canRoll) return t("turn.roll");
  if (p.noMove || noWhiteSumMove(view)) return null;
  if (p.staged) return t("turn.confirm");
  if (currentStep(view) !== null && canPass(view, p.s1)) {
    return t("turn.pick", { pass: passLabel(view, p.s1) });
  }
  return null;
}

export function TurnBanner({ view, staged, noMove, s1 }: TurnBannerProps) {
  useT();
  const g = view.game;
  if (!g?.turn || g.phase === "GAME_OVER") return null;
  const mine = g.turn.activeSeat === view.you.seat;
  const title = mine
    ? t("turn.yours")
    : t("turn.theirs", { name: seatName(view, g.turn.activeSeat) });
  const step =
    g.phase === "AWAIT_ROLL"
      ? t("turn.stepRoll")
      : g.phase === "ACTION_1"
        ? t("turn.step1")
        : t("turn.step2");
  const cta = turnCta(view, { staged, noMove, s1 });
  return (
    <section
      class={`g-turnbar${mine ? " is-mine" : ""}`}
      aria-label={t("turn.aria")}
      data-testid="turn-banner"
    >
      <span class="g-turnbar-who">
        <Avatar profile={seatProfile(view, g.turn.activeSeat)} size={16} /> {title}
      </span>
      <span class="g-turnbar-step">{step}</span>
      {cta ? <span class="g-turnbar-cta">{cta}</span> : null}
    </section>
  );
}
