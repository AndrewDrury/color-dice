/**
 * Winner reveal (K5.4/K5.7): suspenseful build-up (results drop in lowest first under a drum-roll),
 * a hush, the winner celebration with confetti and a jingle, then the laughing-cat moment.
 * Tap anywhere (or Skip / Esc) ends it. Plays once per game: see `claimCelebration`.
 */
import type { ViewMessage } from "@cd/protocol";
import type { ComponentType } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { useReducedMotion } from "../fx/motion";
import { jingleFor, playDrumRoll, playJingle, playLaugh, type SoundHandle } from "../fx/sound";
import { seatInfo, tieInfo } from "../game/model";
import { t, useT } from "../i18n";
import { getPrefs, onPrefs } from "../prefs";
import "../styles/motion.css";
import { LaughingCat } from "./cats/LaughingCat";
import { CrownIcon, TieIcon } from "./icons";
import { ResultEquation, rankPlayers } from "./ScoreTable";

const HUSH_MS = 600;
const WIN_MIN_MS = 3000;
const WIN_MAX_MS = 6000;
const CAT_TAIL_MS = 800;
const claimed = new Set<string>();

/** Room code + game number (the seat records sum to the finished games), so a rematch plays again. */
export function celebrationKey(view: ViewMessage): string {
  const rec = (view.seats.find((s) => s.seatId === view.you.seatId) ?? view.seats[0])?.record;
  return `${view.code}:${rec ? rec.wins + rec.ties + rec.losses : 0}`;
}

/** True the first time a game is claimed (also across a reload, via sessionStorage). */
export function claimCelebration(key: string): boolean {
  if (claimed.has(key)) return false;
  claimed.add(key);
  try {
    const k = `cd:cel:${key}`;
    if (sessionStorage.getItem(k)) return false;
    sessionStorage.setItem(k, "1");
  } catch {
    // No storage: the in-memory set still dedupes reconnects.
  }
  return true;
}

export function _resetCelebrationForTests(): void {
  claimed.clear();
}

type Phase = "build" | "reveal" | "win" | "cat";

function useConfetti(on: boolean): ComponentType | null {
  const [C, setC] = useState<ComponentType | null>(null);
  useEffect(() => {
    if (!on || C) return;
    let alive = true;
    import("./Confetti").then((m) => alive && setC(() => m.Confetti));
    return () => {
      alive = false;
    };
  }, [on]);
  return C;
}

export function Celebration({ view, onDone }: { view: ViewMessage; onDone: () => void }) {
  useT();
  const reduced = useReducedMotion();
  const { winnerSeats, tie, allTied } = tieInfo(view);
  const ranked = rankPlayers(view);
  const rows = [...ranked].reverse(); // lowest score first
  const name = (p: (typeof rows)[number]) =>
    seatInfo(view, p)?.name ?? t("player.fallback", { n: p.seat + 1 });
  const winners = ranked.filter((p) => winnerSeats.includes(p.seat));
  const iWon = view.you.seat !== null && winnerSeats.includes(view.you.seat);
  const [phase, setPhase] = useState<Phase>("build");
  const [shown, setShown] = useState(0);
  const [second, setSecond] = useState(false);
  const Confetti = useConfetti(phase === "win" && !reduced);
  const sounds = useRef<SoundHandle[]>([]);
  const finished = useRef(false);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const skipBtn = useRef<HTMLButtonElement>(null);

  const stopSounds = () => {
    for (const h of sounds.current) h.stop();
    sounds.current = [];
  };
  const keep = (h: SoundHandle | null): SoundHandle | null => {
    if (h) sounds.current.push(h);
    return h;
  };
  const finish = () => {
    if (finished.current) return;
    finished.current = true;
    stopSounds();
    onDoneRef.current();
  };

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    const at = (ms: number, fn: () => void) => timers.push(setTimeout(fn, ms));
    const n = Math.max(1, rows.length);
    const step = reduced ? 250 : Math.min(600, 2800 / n);
    const buildMs = n * step + 500;
    const roll = keep(playDrumRoll(buildMs / 1000 + 0.3));
    for (let i = 0; i < rows.length; i++) at(200 + i * step, () => setShown(i + 1));
    at(buildMs, () => {
      roll?.stop();
      setPhase("reveal");
    });
    at(buildMs + HUSH_MS, () => {
      setPhase("win");
      const jingle = keep(playJingle(jingleFor(celebrationKey(view))));
      const winMs = Math.min(WIN_MAX_MS, Math.max(WIN_MIN_MS, (jingle?.duration ?? 0) * 1000));
      at(700, () => setSecond(true));
      at(winMs, () => {
        jingle?.stop();
        setPhase("cat");
        const laugh = keep(playLaugh());
        at((laugh?.duration ?? 3.2) * 1000 + CAT_TAIL_MS, finish);
      });
    });
    const off = onPrefs(() => {
      if (!getPrefs().sound) stopSounds();
    });
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish();
    };
    document.addEventListener("keydown", key);
    skipBtn.current?.focus();
    return () => {
      for (const id of timers) clearTimeout(id);
      off();
      document.removeEventListener("keydown", key);
      stopSounds();
    };
  }, []);

  const showWinner = phase === "win" || phase === "cat";
  const heading = allTied
    ? t("over.tieAll")
    : tie
      ? t("over.tie") + winners.map(name).join(" & ")
      : iWon
        ? t("celebrate.youWin")
        : winners[0]
          ? name(winners[0])
          : "";
  const top = winners[0]?.score.total ?? 0;
  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: Escape and the Skip button cover the keyboard
    <div
      class={`cel mo-fade${reduced ? " is-reduced" : ""}`}
      data-testid="celebration"
      data-phase={phase}
      role="dialog"
      aria-modal="true"
      aria-label={t("celebrate.label")}
      onClick={finish}
    >
      <button type="button" class="btn cel-skip" ref={skipBtn} onClick={finish}>
        {t("celebrate.skip")}
      </button>
      {phase === "cat" ? null : (
        <div class="cel-card">
          <h2 class="cel-title">
            {showWinner ? (
              <span class="cel-win" data-testid="cel-winner">
                {tie ? <TieIcon size={40} /> : <CrownIcon size={40} />}
                <span class="cel-name">{heading}</span>
                <span class="cel-score num">{t("celebrate.points", { n: top })}</span>
              </span>
            ) : (
              <span class={phase === "reveal" ? "cel-hush" : undefined}>
                {t("celebrate.title")}
              </span>
            )}
          </h2>
          <ol class="cel-rows">
            {rows.map((p, i) => {
              const win = winnerSeats.includes(p.seat);
              return (
                <li
                  key={p.seat}
                  class={`cel-row${i < shown ? " is-in" : ""}${phase === "build" && i === shown - 1 ? " is-lead" : ""}${phase !== "build" && win ? " is-winner" : ""}${phase !== "build" && !win ? " is-dim" : ""}`}
                  data-seat={p.seat}
                >
                  <span class="g-name cel-pname">{name(p)}</span>
                  <ResultEquation player={p} name={name(p)} ms={reduced ? 1 : 700} />
                </li>
              );
            })}
          </ol>
          {Confetti ? <Confetti key="a" /> : null}
          {Confetti && second ? <Confetti key="b" /> : null}
        </div>
      )}
      {phase === "cat" ? (
        <div class="cel-card cel-catcard">
          <p class="cel-name cel-catname">{heading}</p>
          <button
            type="button"
            class="cel-cat"
            aria-label={t("celebrate.cat")}
            onClick={(e) => {
              e.stopPropagation();
              stopSounds();
              keep(playLaugh());
            }}
          >
            <LaughingCat still={reduced} />
          </button>
        </div>
      ) : null}
    </div>
  );
}
