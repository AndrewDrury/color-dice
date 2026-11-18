/** K4.1: the opening roll-off. Every player's die tumbles together each round; tap to skip. */
import type { ViewMessage } from "@cd/protocol";
import { useEffect, useState } from "preact/hooks";
import type { Face } from "../fx/dice-math";
import { useReducedMotion } from "../fx/motion";
import type { RollPhase } from "../fx/useRollAnimation";
import { roundCaption } from "../game/flow";
import { seatName } from "../game/model";
import { t, useT } from "../i18n";
import { Die } from "./Die";

const ROUND_MS = 900;
const LAST_HOLD_MS = 1800;
/** Rounds after the 3rd play at double speed. */
const roundMs = (r: number) => (r >= 3 ? ROUND_MS / 2 : ROUND_MS);

/** Shown once per game: remembers which roll-offs were already played. */
const played = new Set<string>();
export const rollOffKey = (code: string, rounds: readonly (readonly number[])[]) =>
  `${code}:${JSON.stringify(rounds)}`;
export const rollOffPlayed = (key: string) => played.has(key);
export const markRollOffPlayed = (key: string) => played.add(key);
export const _resetRollOffForTests = () => played.clear();

export interface RollOffProps {
  view: ViewMessage;
  rounds: readonly (readonly number[])[];
  onDone: () => void;
}

export function RollOff({ view, rounds, onDone }: RollOffProps) {
  useT();
  const reduced = useReducedMotion();
  const last = rounds.length - 1;
  const [round, setRound] = useState(0);
  const [phase, setPhase] = useState<RollPhase>(reduced ? "settled" : "idle");

  useEffect(() => {
    if (reduced) {
      const timer = setTimeout(onDone, 3500);
      return () => clearTimeout(timer);
    }
    const d = roundMs(round);
    const timers = [
      setTimeout(() => setPhase("tumbling"), 20),
      setTimeout(() => setPhase("settling"), d * 0.5),
      setTimeout(() => setPhase("settled"), d * 0.85),
      setTimeout(
        () => {
          if (round >= last) onDone();
          else {
            setPhase("idle");
            setRound(round + 1);
          }
        },
        round >= last ? d + LAST_HOLD_MS : d,
      ),
    ];
    return () => {
      for (const x of timers) clearTimeout(x);
    };
  }, [round, reduced]);

  const seats = view.game?.players.map((p) => p.seat) ?? [];
  const showRound = (r: number, live: boolean) => {
    const faces = rounds[r] as readonly number[];
    return (
      <div class="ro-round" key={r}>
        <div class="ro-dice">
          {seats.map((seat) => (
            <div class="ro-seat" key={seat}>
              <Die
                color="WHITE"
                face={(faces[seat] ?? 1) as Face}
                phase={live ? phase : "settled"}
                seed={r * 31 + seat * 7 + 3}
                index={seat}
                reduced={reduced}
              />
              <span class="ro-name">{seatName(view, seat)}</span>
            </div>
          ))}
        </div>
        {!live || phase === "settled" ? (
          <p class="ro-caption">{roundCaption(view, faces)}</p>
        ) : (
          <p class="ro-caption">{" "}</p>
        )}
      </div>
    );
  };

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents lint/a11y/noStaticElementInteractions: the Skip button is the keyboard path
    <div class="ro-overlay" data-testid="rolloff" onClick={onDone}>
      <div class="ro-card" role="status" aria-live="polite">
        <h2 class="ro-title">{t("rolloff.title")}</h2>
        {reduced ? rounds.map((_, r) => showRound(r, false)) : showRound(round, true)}
        <button type="button" class="btn ro-hint" onClick={onDone}>
          {t("rolloff.skip")}
        </button>
      </div>
    </div>
  );
}
