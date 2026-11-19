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

/* ---------- T-NEW-2: the live roll-off (players roll their own die) ---------- */

const REVEAL_MS = 900;

export interface RollOffLiveProps {
  view: ViewMessage;
  /** Returns false when the socket is not connected. */
  send: (msg: { type: "rollOff"; round: number }) => boolean;
}

/** Seat i of a roll-off is the i-th seat of the room, in join order (the server's seat order). */
const liveName = (view: ViewMessage, seat: number) =>
  view.seats[seat]?.name ?? t("player.fallback", { n: seat + 1 });

function liveCaption(view: ViewMessage, faces: readonly number[]): string {
  const sixes = faces.flatMap((f, seat) => (f === 6 ? [seat] : []));
  return sixes.length === 0 ? t("rolloff.none") : t("rolloff.many", { n: sixes.length });
}

export function RollOffLive({ view, send }: RollOffLiveProps) {
  useT();
  const reduced = useReducedMotion();
  const ro = view.rollOff;
  const mySeat = view.you.seat;
  const done = ro?.completed.length ?? 0;
  // The newest revealed round tumbles briefly, then settles.
  const [settledAt, setSettledAt] = useState(done);
  useEffect(() => {
    if (reduced || settledAt >= done) {
      setSettledAt(done);
      return;
    }
    const timer = setTimeout(() => setSettledAt(done), REVEAL_MS);
    return () => clearTimeout(timer);
  }, [done, reduced]);
  if (!ro) return null;
  const waiting = ro.rolled.flatMap((r, seat) => (r ? [] : [liveName(view, seat)]));
  const iRolled = mySeat !== null && ro.rolled[mySeat] === true;
  const lastRevealed = ro.completed.length - 1;
  return (
    <div class="ro-overlay" data-testid="rolloff-live">
      <div class="ro-card" role="status" aria-live="polite">
        <h2 class="ro-title">{t("rolloff.title")}</h2>
        {ro.completed.map((faces, r) => (
          <div class="ro-round" key={r} data-testid="rolloff-round">
            <div class="ro-dice">
              {faces.map((f, seat) => (
                <div class="ro-seat" key={seat}>
                  <Die
                    color="WHITE"
                    face={f as Face}
                    phase={r === lastRevealed && settledAt < done ? "tumbling" : "settled"}
                    seed={r * 31 + seat * 7 + 3}
                    index={seat}
                    reduced={reduced}
                  />
                  <span class="ro-name">{liveName(view, seat)}</span>
                </div>
              ))}
            </div>
            <p class="ro-caption">{liveCaption(view, faces)}</p>
          </div>
        ))}
        <div class="ro-round" data-testid="rolloff-current">
          <div class="ro-dice">
            {ro.rolled.map((rolled, seat) => (
              <div class="ro-seat" key={seat} data-rolled={rolled ? "1" : "0"}>
                <Die
                  color="WHITE"
                  face={1}
                  phase={rolled ? "tumbling" : "idle"}
                  seed={ro.round * 31 + seat * 7 + 3}
                  index={seat}
                  reduced={reduced}
                />
                <span class="ro-name">{liveName(view, seat)}</span>
              </div>
            ))}
          </div>
          {iRolled || mySeat === null ? (
            <p class="ro-caption">
              {waiting.length > 0 ? t("rolloff.waiting", { names: waiting.join(", ") }) : " "}
            </p>
          ) : (
            <button
              type="button"
              class="btn g-primary"
              data-testid="rolloff-roll"
              onClick={() => send({ type: "rollOff", round: ro.round })}
            >
              {t("rolloff.roll")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
