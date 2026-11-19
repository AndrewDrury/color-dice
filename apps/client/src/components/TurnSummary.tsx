/**
 * T-NEW-12: a non-blocking end-of-turn popup: each player's marks (with the dice that made them),
 * penalty and locks. Auto-closes; a tap anywhere dismisses it (it never intercepts input itself).
 */
import { useEffect } from "preact/hooks";
import { useReducedMotion } from "../fx/motion";
import { ROLL_TIMING } from "../fx/useRollAnimation";
import { cssColor } from "../game/model";
import type { TurnSummary as Summary } from "../game/turnSummary";
import { colorName, t, useT } from "../i18n";
import "../styles/game.css";
import { Die } from "./Die";
import { LockIcon } from "./icons";

export const TURN_SUMMARY_MS = 3500;

export function TurnSummary({ summary, onClose }: { summary: Summary; onClose: () => void }) {
  useT();
  const reduced = useReducedMotion();
  useEffect(() => {
    const timer = setTimeout(onClose, TURN_SUMMARY_MS);
    const down = () => onClose();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("pointerdown", down, true);
    document.addEventListener("keydown", key);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("pointerdown", down, true);
      document.removeEventListener("keydown", key);
    };
  }, [summary.turn]);

  let order = 0;
  return (
    <div class="ts-wrap" role="status" aria-live="polite" aria-label={t("summary.aria")}>
      <section
        key={summary.turn}
        class={`ts-card${reduced ? " is-reduced" : ""}`}
        data-testid="turn-summary"
        data-turn={summary.turn}
      >
        <h2 class="ts-title">{t("summary.title", { n: summary.turn })}</h2>
        <ul class="ts-list">
          {summary.players.map((p) => (
            <li key={p.seat} class="ts-player" data-seat={p.seat}>
              <div class="ts-head">
                <span class="g-name ts-name">{p.name}</span>
                {p.locks.map((c) => (
                  <span key={c} class={`ts-lock c-${cssColor(c)}`} data-testid="ts-lock">
                    <LockIcon size={14} title={t("summary.lock", { color: colorName(c) })} />
                  </span>
                ))}
                {p.penalty ? (
                  <span class="ts-penalty" data-testid="ts-penalty" title={t("summary.penalty")}>
                    −5
                    <span class="sr-only">{t("summary.penalty")}</span>
                  </span>
                ) : null}
              </div>
              <div class="ts-marks">
                {p.marks.length === 0 ? (
                  <span class="muted ts-none">{t("summary.none")}</span>
                ) : (
                  p.marks.map((m) => (
                    <span
                      key={`${m.action}${m.color}${m.index}`}
                      class="ts-mark"
                      data-testid="ts-mark"
                    >
                      <span class="ts-dice">
                        {m.dice.map((d, i) => {
                          const idx = order++;
                          return (
                            <span
                              key={`${d.color}${i}`}
                              class="ts-die"
                              style={{ animationDelay: `${idx * ROLL_TIMING.stagger}ms` }}
                            >
                              <Die
                                color={d.color}
                                face={d.face}
                                phase="settled"
                                seed={idx + 1}
                                index={idx}
                                id={`${d.color}_${idx}`}
                                reduced
                              />
                            </span>
                          );
                        })}
                      </span>
                      <span class={`ts-text c-${cssColor(m.color)}`}>
                        {t("summary.mark", { color: colorName(m.color), n: m.number })}
                      </span>
                    </span>
                  ))
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
