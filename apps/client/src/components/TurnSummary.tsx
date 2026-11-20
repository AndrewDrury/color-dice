/**
 * End-of-turn summary (T-NEW-12, redesigned T-NEW-20): per player, avatar + name and the numbers
 * they marked as row-coloured boxes. Overlays the moves card (or a centre sheet on phones), closes
 * after SUMMARY_MS or with the ✕, and never intercepts game input.
 */
import { useEffect } from "preact/hooks";
import { useReducedMotion } from "../fx/motion";
import { cssColor } from "../game/model";
import type { TurnSummary as Summary } from "../game/turnSummary";
import { colorName, t, useT } from "../i18n";
import "../styles/game.css";
import { Avatar } from "./Avatar";
import { CloseIcon, LockIcon } from "./icons";

export const SUMMARY_MS = 4000;

export function TurnSummary({
  summary,
  onClose,
  placement = "log",
}: {
  summary: Summary;
  onClose: () => void;
  /** "log": over the moves card; "sheet": centred sheet (no side card on phones). */
  placement?: "log" | "sheet";
}) {
  useT();
  const reduced = useReducedMotion();
  useEffect(() => {
    const timer = setTimeout(onClose, SUMMARY_MS);
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", key);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("keydown", key);
    };
  }, [summary.turn]);

  return (
    <section
      key={summary.turn}
      class={`ts-card is-${placement}${reduced ? " is-reduced" : ""}`}
      role="status"
      aria-live="polite"
      aria-label={t("summary.aria")}
      data-testid="turn-summary"
      data-turn={summary.turn}
    >
      <header class="ts-head">
        <h2 class="ts-title">{t("summary.turn", { n: summary.turn })}</h2>
        <button type="button" class="ts-close" aria-label={t("common.close")} onClick={onClose}>
          <CloseIcon size={16} />
        </button>
      </header>
      <ul class="ts-list">
        {summary.players.map((p) => (
          <li key={p.seat} class="ts-player" data-seat={p.seat}>
            <div class="ts-who">
              <Avatar profile={p.profile} size={44} />
              <span class="ts-name" title={p.name}>
                {p.name}
              </span>
            </div>
            <div class="ts-marks">
              {p.marks.map((m) => (
                <span
                  key={`${m.action}${m.color}${m.index}`}
                  class={`ts-box c-${cssColor(m.color)}`}
                  data-testid="ts-mark"
                >
                  <span aria-hidden="true">{m.number}</span>
                  <span class="sr-only">
                    {t("summary.mark", { color: colorName(m.color), n: m.number })}
                  </span>
                </span>
              ))}
              {p.locks.map((c) => (
                <span key={c} class={`ts-lock c-${cssColor(c)}`} data-testid="ts-lock">
                  <LockIcon size={18} title={t("summary.lock", { color: colorName(c) })} />
                </span>
              ))}
              {p.penalty ? (
                <span class="ts-penalty" data-testid="ts-penalty" title={t("summary.penalty")}>
                  −5
                  <span class="sr-only">{t("summary.penalty")}</span>
                </span>
              ) : null}
              {p.marks.length === 0 && !p.penalty && p.locks.length === 0 ? (
                <span class="muted ts-none">{t("summary.none")}</span>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
