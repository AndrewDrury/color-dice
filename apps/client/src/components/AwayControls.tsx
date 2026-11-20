import type { ViewMessage } from "@cd/protocol";
import { t, useT } from "../i18n";
import { PauseIcon } from "./icons";

/**
 * T-NEW-3: the automatic pause. There is no manual "mark away" any more: when a player's
 * connection drops the server pauses the game (no timers, no penalties) and resumes it by
 * itself once they are back. Also lists players who confirmed a leave.
 */
export function AwayControls(props: { view: ViewMessage }) {
  const { view } = props;
  useT();
  const paused = (view.pausedSeatIds ?? [])
    .filter((id) => id !== view.you.seatId)
    .map((id) => view.seats.find((s) => s.seatId === id)?.name)
    .filter((n): n is string => !!n);
  const leftOnes = view.seats.filter((s) => s.left && s.seatId !== view.you.seatId);
  if (paused.length === 0 && leftOnes.length === 0) return null;
  return (
    <section
      class="row g-away"
      aria-label={t("away.title")}
      style={{ flexWrap: "wrap", gap: "var(--s2)" }}
    >
      {paused.length > 0 ? (
        <span class="g-paused" role="status" data-testid="paused-banner">
          <PauseIcon size={18} />
          <span>{t("away.paused", { names: paused.join(", ") })}</span>
        </span>
      ) : null}
      {leftOnes.map((s) => (
        <span key={s.seatId} class="muted" data-left={s.seatId}>
          {t("away.left", { name: s.name })}
        </span>
      ))}
    </section>
  );
}
