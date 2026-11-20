/**
 * End-of-game reveal (T-NEW-28): every player's card is shown at once; the scores drop in one colour at a
 * time for all players together (red, yellow, green, blue), then penalties, a longer hush, then the totals
 * slam in (winner last); a random full-screen celebration plays behind.
 * Skip completes it at once; "Show full score cards" closes it onto the full results. Rematch / Back home
 * (`actions`) live in the overlay's footer so they are never covered.
 */
import type { Reaction, ViewMessage } from "@cd/protocol";
import type { ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import {
  type CelebrationKind,
  CSS_COUNT,
  frac,
  isCanvasKind,
  KINDS,
  pickCelebration,
  runCanvas,
} from "../fx/celebrate";
import { haptic } from "../fx/haptics";
import { useModalTrap } from "../fx/modal";
import { useReducedMotion } from "../fx/motion";
import { jingleFor, play, playDrumRoll, playJingle, type SoundHandle } from "../fx/sound";
import { COLORS, cssColor, seatInfo, tieInfo } from "../game/model";
import { celebrationKey, HUSH_MS, PLAYER_STAGGER_MS, useReveal } from "../game/useReveal";
import { useTween } from "../game/useTween";
import { t, useT } from "../i18n";
import { getPrefs, onPrefs } from "../prefs";
import { AvatarHover } from "./AvatarHover";
import { CatReaction, REACTION_MOOD_ORDER } from "./CatReaction";
import { CrownIcon, TieIcon } from "./icons";
import { rankNumbers, rankPlayers } from "./ScoreTable";
import "../styles/celebration.css";

function Total({ value, reduced }: { value: number; reduced: boolean }) {
  const eased = useTween(value, 1400, 0);
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (reduced) {
      setStep(value);
      return;
    }
    setStep(0);
    if (value <= 0) return;
    const stepMs = Math.max(18, Math.floor(2200 / Math.max(1, value)));
    const id = setInterval(() => {
      setStep((prev) => {
        if (prev >= value) return value;
        return prev + 1;
      });
    }, stepMs);
    return () => clearInterval(id);
  }, [value, reduced]);
  const v = reduced ? value : Math.min(step, eased);
  return (
    <span class="rv-total-num num" data-value={value}>
      {v}
    </span>
  );
}

function Backdrop({
  kind,
  rand,
  still,
}: {
  kind: CelebrationKind;
  rand?: () => number;
  still: boolean;
}) {
  const cv = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (still || !isCanvasKind(kind) || !cv.current) return;
    return runCanvas(cv.current, kind, rand);
  }, [kind, still]);
  if (still) return <div class="rv-fx rv-fx--still" data-celebration={kind} aria-hidden="true" />;
  const n = CSS_COUNT[kind] ?? 0;
  return (
    <div class={`rv-fx rv-fx--${kind}`} data-celebration={kind} aria-hidden="true">
      {isCanvasKind(kind) ? <canvas ref={cv} /> : null}
      {Array.from({ length: n }, (_, i) => (
        <i
          key={i}
          style={{
            "--i": i,
            "--n": n,
            "--x": `${Math.round(frac(i, 1) * 100)}%`,
            "--d": `${(3.5 + frac(i, 2) * 4).toFixed(2)}s`,
            "--w": `${(frac(i, 3) * -6).toFixed(2)}s`,
            "--sz": `${Math.round(18 + frac(i, 4) * 26)}px`,
            "--h": Math.round(frac(i, 5) * 360),
          }}
        >
          {kind === "hearts" ? "♥" : null}
        </i>
      ))}
    </div>
  );
}

/** `?fx=hearts` forces one celebration (QA and screenshots). */
function queryKind(): CelebrationKind | null {
  try {
    const k = new URLSearchParams(location.search).get("fx");
    return KINDS.find((x) => x === k) ?? null;
  } catch {
    return null;
  }
}

export interface ResultsRevealProps {
  view: ViewMessage;
  /** Closes the overlay onto the full score cards. */
  onDone: () => void;
  /** Rematch / Back home buttons, always visible in the footer. */
  actions: ComponentChildren;
  /** Chat and emoji controls, kept usable above the celebration. */
  chat?: ComponentChildren;
  /** Tests: fixes the celebration. */
  kind?: CelebrationKind;
  rand?: () => number;
}

export function ResultsReveal({ view, onDone, actions, chat, kind, rand }: ResultsRevealProps) {
  useT();
  const reduced = useReducedMotion();
  const { winnerSeats, tie, allTied } = tieInfo(view);
  const ranked = rankPlayers(view);
  const ranks = rankNumbers(ranked);
  const n = ranked.length;
  // Seat order while revealing, so the layout never hints at the winner or jumps when totals land.
  const bySeat = [...ranked].sort((a, b) => a.seat - b.seat);
  const key = celebrationKey(view);
  const [fx] = useState<CelebrationKind>(() => kind ?? queryKind() ?? pickCelebration(rand));
  const [reaction] = useState<Reaction>(
    () =>
      REACTION_MOOD_ORDER[
        Math.floor((rand ? rand() : Math.random()) * REACTION_MOOD_ORDER.length)
      ] ?? "cat-dancing-gif-by-unscreen",
  );
  const [reactionPos] = useState<"top" | "bottom">(() =>
    (rand ? rand() : Math.random()) < 0.5 ? "top" : "bottom",
  );
  const sounds = useRef<SoundHandle[]>([]);
  const stopSounds = () => {
    for (const h of sounds.current) h.stop();
    sounds.current = [];
  };
  const keep = (h: SoundHandle | null) => {
    if (h) sounds.current.push(h);
  };
  const r = useReveal(n, reduced, {
    drop: () => {
      play("land");
      haptic("land");
    },
    hush: () => keep(playDrumRoll(HUSH_MS / 1000 + 0.4)),
    total: (i) => {
      stopSounds();
      if (i === n - 1) {
        keep(playJingle(jingleFor(key)));
        haptic("success");
      } else {
        play("reveal");
        haptic("medium");
      }
    },
  });
  const done = r.phase === "done";
  const rootRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  // Tab stays inside, the page behind is inert, and focus lands on Rematch (or Back home) on close.
  useModalTrap(
    rootRef,
    () => document.querySelector<HTMLElement>(".g-over-actions .btn, .g-over-actions button"),
    false,
  );
  useEffect(() => {
    const off = onPrefs(() => {
      if (!getPrefs().sound) stopSounds();
    });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && done) onDone();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      off();
      document.removeEventListener("keydown", onKey);
      stopSounds();
    };
  }, [done]);
  // Keep keyboard focus on the primary control: Skip while running, then the cards button.
  useEffect(() => {
    btnRef.current?.focus();
  }, [done]);

  const name = (p: (typeof ranked)[number]) =>
    seatInfo(view, p)?.name ?? t("player.fallback", { n: p.seat + 1 });
  const winners = ranked.filter((p) => winnerSeats.includes(p.seat));
  const iWon = view.you.seat !== null && winnerSeats.includes(view.you.seat);
  const allIn = r.totals >= n;
  const heading = allTied
    ? t("over.tieAll")
    : tie
      ? t("over.tie") + winners.map(name).join(" & ")
      : iWon
        ? t("celebrate.youWin")
        : winners[0]
          ? name(winners[0])
          : "";
  const title = allIn ? heading : r.phase === "drop" ? t("celebrate.scores") : t("celebrate.title");
  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: Escape and the Skip button cover the keyboard
    <div
      ref={rootRef}
      class={`cel rv${reduced ? " is-reduced" : ""}`}
      data-testid="celebration"
      data-phase={r.phase}
      data-celebration={fx}
      role="dialog"
      aria-modal="true"
      aria-label={t("celebrate.label")}
      onClick={undefined}
    >
      {allIn || r.phase === "totals" ? <Backdrop kind={fx} rand={rand} still={reduced} /> : null}
      <div class="rv-stage">
        {reactionPos === "top" ? (
          <div class="rv-cat rv-cat--top" aria-hidden="true" data-testid="celebration-cat">
            <CatReaction id={reaction} size={88} />
          </div>
        ) : null}
        <h2
          class={`rv-title${allIn ? " is-win" : ""}${r.phase === "hush" ? " is-hush" : ""}`}
          data-testid="rv-title"
          aria-live="polite"
        >
          {allIn ? tie ? <TieIcon size={30} /> : <CrownIcon size={30} /> : null}
          <span class="rv-title-text">{title}</span>
        </h2>
        <ol class="rv-cards">
          {bySeat.map((p) => {
            const i = ranked.indexOf(p);
            const pos = bySeat.indexOf(p);
            const order = n - 1 - i; // total order: last place first, winner last
            const stag = `${pos * PLAYER_STAGGER_MS}ms`;
            const showTotal = r.totals > order;
            const win = winnerSeats.includes(p.seat);
            const { rows, penalties, total } = p.score;
            const pen = Math.abs(penalties);
            const nm = name(p);
            return (
              <li
                key={p.seat}
                class={`rv-card${showTotal ? " has-total" : ""}${
                  showTotal && win ? " is-winner" : ""
                }`}
                data-testid="rv-card"
                data-seat={p.seat}
                data-order={order}
                style={{ "--p": stag }}
                aria-label={t("over.equationAria", {
                  name: nm,
                  r: rows?.RED ?? 0,
                  y: rows?.YELLOW ?? 0,
                  g: rows?.GREEN ?? 0,
                  b: rows?.BLUE ?? 0,
                  p: pen,
                  total,
                })}
              >
                <span class="rv-who">
                  <span class="num rv-rank">{showTotal ? `${ranks[i]}.` : ""}</span>
                  <AvatarHover profile={seatInfo(view, p)?.profile} size={32} name={nm} />
                  <span class="rv-name g-name" title={nm}>
                    {nm}
                  </span>
                  {showTotal && win ? (
                    tie ? (
                      <span class="rv-badge">
                        <TieIcon size={14} /> {t("table.tie")}
                      </span>
                    ) : (
                      <CrownIcon size={18} title={t("table.winner")} />
                    )
                  ) : null}
                </span>
                <span class="rv-pills" aria-hidden="true">
                  {COLORS.map((c, k) => (
                    <span
                      key={c}
                      class={`rv-pill c-${cssColor(c)}${r.step > k ? " is-in" : ""}`}
                      data-term={c}
                      data-step={k}
                    >
                      {rows?.[c] ?? 0}
                    </span>
                  ))}
                  <span
                    class={`rv-pill rv-pen${r.step > 4 ? " is-in" : ""}`}
                    data-term="PEN"
                    data-step={4}
                    title={t("sheet.penaltiesCaption")}
                  >
                    −{pen}
                  </span>
                </span>
                <span class="rv-total" aria-hidden="true">
                  {showTotal ? (
                    <Total value={total} reduced={reduced} />
                  ) : (
                    <span class="rv-total-num rv-q">?</span>
                  )}
                  <span class="rv-total-cap">{t("sheet.totalCaption")}</span>
                </span>
              </li>
            );
          })}
        </ol>
        {reactionPos === "bottom" ? (
          <div class="rv-cat rv-cat--bottom" aria-hidden="true" data-testid="celebration-cat">
            <CatReaction id={reaction} size={88} />
          </div>
        ) : null}
      </div>
      <div class="rv-foot">
        {chat ? <div class="rv-chat">{chat}</div> : null}
        {done ? (
          <button
            type="button"
            class="btn btn-primary rv-show"
            ref={btnRef}
            data-testid="rv-show-cards"
            onClick={onDone}
          >
            {t("celebrate.showCards")}
          </button>
        ) : null}
        <div class="rv-actions">{actions}</div>
      </div>
    </div>
  );
}
