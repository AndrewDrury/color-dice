/**
 * Winner reveal (K5.4/K5.7): "And the scores are..." beat, then each player's final card one at a time
 * from last place to first with a row-by-row count-up (red, yellow, green, blue, penalties, total),
 * a hush, the winner modal (reaction GIF, confetti, jingle), then the laughing-cat moment.
 * Tap anywhere (or Skip / Esc) ends it. Plays once per game: see `claimCelebration`.
 */
import type { Reaction, ViewMessage } from "@cd/protocol";
import type { ComponentType } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { useReducedMotion } from "../fx/motion";
import { jingleFor, playDrumRoll, playJingle, playLaugh, type SoundHandle } from "../fx/sound";
import { hasCard, seatInfo, tieInfo } from "../game/model";
import { t, useT } from "../i18n";
import { getPrefs, onPrefs } from "../prefs";
import { Avatar } from "./Avatar";
import "../styles/motion.css";
import { reactionAsset } from "./CatReaction";
import { LaughingCat } from "./cats/LaughingCat";
import { CrownIcon, TieIcon } from "./icons";
import { ResultEquation, rankNumbers, rankPlayers } from "./ScoreTable";
import { Sheet } from "./Sheet";

const HUSH_MS = 600;
const INTRO_MS = 1400;
const REDUCED_STEP_MS = 900;
const NO_FX = { flash: {}, glint: null, floats: [], shakeKey: 0 };
const NO_LEGAL: ReadonlySet<string> = new Set();
const noop = () => {};

const HAPPY_GIFS: readonly Reaction[] = [
  "cat-dancing-gif-by-unscreen",
  "dance-cat-gif",
  "happy-black-cat-gif-by-sou-eu-na-vida",
  "cat-laugh-gif",
  "in-love-cat-gif",
  "kitty-cute-cat-gif",
];
const SAD_GIFS: readonly Reaction[] = [
  "shocked-cat-gif",
  "surprised-cat-quedado-gif",
  "cat-screaming-gif",
];

/** Deterministic reaction GIF by game key, so everyone with the same outcome sees the same one. */
export function winnerGif(key: string, happy: boolean): Reaction {
  const list = happy ? HAPPY_GIFS : SAD_GIFS;
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  return list[(h >>> 0) % list.length] as Reaction;
}
function randomGif(happy: boolean): Reaction {
  const list = happy ? HAPPY_GIFS : SAD_GIFS;
  return list[Math.floor(Math.random() * list.length)] as Reaction;
}
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

type Phase = "intro" | "build" | "reveal" | "win" | "cat";

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
  const [phase, setPhase] = useState<Phase>("intro");
  const [shown, setShown] = useState(0); // players revealed so far (phase "build")
  const stepMs = reduced ? REDUCED_STEP_MS : Math.max(1600, Math.min(3000, 7000 / rows.length));
  const lost = view.you.seat !== null && !iWon;
  // Cosmetic and random per client; picked once so re-renders keep the same cat.
  const [gif] = useState(() => randomGif(!lost));
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
    const intro = reduced ? 600 : INTRO_MS;
    const buildMs = intro + rows.length * stepMs;
    const roll = keep(playDrumRoll(buildMs / 1000 + 0.3));
    for (let i = 0; i < rows.length; i++)
      at(intro + i * stepMs, () => {
        setPhase("build");
        setShown(i + 1);
      });
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
  const cur = phase === "build" ? rows[shown - 1] : undefined;
  const rowRanks = new Map(
    rankNumbers(ranked).map((r, i) => [(ranked[i] as { seat: number }).seat, r]),
  );
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
      {showWinner ? (
        <img
          class="cel-gif"
          data-testid="cel-gif"
          src={reactionAsset(gif)}
          alt=""
          aria-hidden="true"
          width={140}
          height={140}
          decoding="async"
        />
      ) : null}
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
                {phase === "reveal" ? t("celebrate.title") : t("celebrate.scores")}
              </span>
            )}
          </h2>
          {cur ? (
            <article
              key={cur.seat}
              class="cel-reveal"
              data-testid="cel-reveal"
              data-seat={cur.seat}
              aria-live="polite"
            >
              <h3 class="cel-reveal-head">
                <span class="num">{rowRanks.get(cur.seat)}.</span>{" "}
                <Avatar profile={seatInfo(view, cur)?.profile} size={32} />{" "}
                <span class="g-name cel-pname">{name(cur)}</span>
              </h3>
              {hasCard(cur) ? (
                <Sheet
                  player={cur}
                  lockedColors={view.game?.lockedColors ?? []}
                  legal={NO_LEGAL}
                  staged={[]}
                  ghost={[]}
                  disabled
                  readOnly
                  fx={NO_FX}
                  onPick={noop}
                />
              ) : null}
              <ResultEquation player={cur} name={name(cur)} ms={reduced ? 1 : stepMs * 0.7} />
            </article>
          ) : null}
          {showWinner ? (
            <ol class="cel-rows">
              {rows.map((p) => {
                const win = winnerSeats.includes(p.seat);
                return (
                  <li
                    key={p.seat}
                    class={`cel-row is-in${win ? " is-winner" : " is-dim"}`}
                    data-seat={p.seat}
                  >
                    <Avatar profile={seatInfo(view, p)?.profile} size={28} />
                    <span class="g-name cel-pname">{name(p)}</span>
                    <ResultEquation player={p} name={name(p)} ms={1} />
                  </li>
                );
              })}
            </ol>
          ) : null}
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
