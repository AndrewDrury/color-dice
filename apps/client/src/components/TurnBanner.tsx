/** T-NEW-9: persistent "whose turn / which step / what to press" strip under the top bar. */
import type { ViewMessage } from "@cd/protocol";
import { seatName, seatProfile } from "../game/model";
import { currentStep, noWhiteSumMove, submitLabel } from "../game/staging";
import { t, useT } from "../i18n";
import { AvatarHover } from "./AvatarHover";

export interface TurnBannerProps {
  view: ViewMessage;
  /** Boxes staged for either step (the Confirm button is up). */
  staged: boolean;
  noMove: boolean;
}

/** The call to action: the one thing to press to move on, or null when you only wait. */
export function turnCta(view: ViewMessage, p: Pick<TurnBannerProps, "staged" | "noMove">) {
  if (view.you.canRoll) return t("turn.roll");
  if (p.noMove || noWhiteSumMove(view)) return null;
  if (currentStep(view) === null) return null;
  return p.staged ? t("turn.confirm") : t("turn.pick", { pass: submitLabel(view, false) });
}

export function TurnBanner({ view, staged, noMove }: TurnBannerProps) {
  useT();
  const g = view.game;
  if (!g?.turn || g.phase === "GAME_OVER") return null;
  const mine = g.turn.activeSeat === view.you.seat;
  const actor = seatName(view, g.turn.activeSeat);
  const title = mine ? t("turn.yours") : t("turn.theirs", { name: actor });
  const step =
    g.phase === "AWAIT_ROLL"
      ? t("turn.stepRoll")
      : g.phase === "ACTION_1"
        ? t("turn.step1")
        : t("turn.step2");
  const cta = turnCta(view, { staged, noMove });
  return (
    <section
      class={`g-turnbar${mine ? " is-mine" : ""}`}
      aria-label={t("turn.aria")}
      data-testid="turn-banner"
    >
      <span class="g-turnbar-who name-clip" title={title} aria-live="polite">
        <AvatarHover profile={seatProfile(view, g.turn.activeSeat)} size={20} name={actor} />{" "}
        {title}
      </span>
      {step === cta ? null : <span class="g-turnbar-step">{step}</span>}
      {cta ? <span class="g-turnbar-cta">{cta}</span> : null}
    </section>
  );
}
