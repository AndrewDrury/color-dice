/**
 * "Who goes first?" (K4.1, T-NEW-2, T-NEW-17): a full-screen roll-off with one card per seat.
 * Live: a seat's die tumbles and lands on every client as soon as that seat rolls (D-L1).
 * Replay (after the game starts): same visuals; tap skips the animation, never the result.
 * The result stays until this client presses "Let's go" (D-L2: a local hold).
 */
import type { Profile, ViewMessage } from "@cd/protocol";
import type { ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import type { Face } from "../fx/dice-math";
import { feedback } from "../fx/feedback";
import { useReducedMotion } from "../fx/motion";
import type { RollPhase } from "../fx/useRollAnimation";
import { seatName, seatProfile } from "../game/model";
import { t, useT } from "../i18n";
import { Avatar } from "./Avatar";
import { Die } from "./Die";
import "../styles/dice.css";
import "../styles/rolloff.css";

/** Local timing: a face tumbles, then settles (~800 ms from arrival to rest). */
const TUMBLE_MS = 450;
const SETTLE_MS = 350;
/** A finished round without a unique 6 stays this long before it collapses into history. */
export const ROUND_HOLD_MS = 1400;
/** History keeps only the newest rounds so the screen never grows. */
const HISTORY_MAX = 3;

/** Shown once per game: remembers which roll-offs were already played. */
const played = new Set<string>();
/** The newest live round each client saw, so the replay doesn't re-tumble landed dice. */
const liveSeen = new Map<string, { round: number; faces: (number | null)[] }>();
export const rollOffKey = (code: string, rounds: readonly (readonly number[])[]) =>
  `${code}:${JSON.stringify(rounds)}`;
export const rollOffPlayed = (key: string) => played.has(key);
export const markRollOffPlayed = (key: string) => played.add(key);
export const _resetRollOffForTests = () => {
  played.clear();
  liveSeen.clear();
};

interface SeatInfo {
  name: string;
  profile: Profile | undefined;
}

function uniqueSix(faces: readonly (number | null)[]): number | null {
  const sixes = faces.flatMap((f, seat) => (f === 6 ? [seat] : []));
  return sixes.length === 1 ? (sixes[0] as number) : null;
}

function retryCaption(faces: readonly (number | null)[]): string {
  const n = faces.filter((f) => f === 6).length;
  return n === 0 ? t("rolloff.none") : t("rolloff.many", { n });
}

interface CardProps {
  seat: number;
  info: SeatInfo;
  face: number | null;
  /** Show a face that is already there at mount without tumbling (reconnect, seen live). */
  instant: boolean;
  skip: boolean;
  reduced: boolean;
  winner: boolean;
  onLanded: (seat: number) => void;
}

function SeatCard({ seat, info, face, instant, skip, reduced, winner, onLanded }: CardProps) {
  const [phase, setPhase] = useState<RollPhase>(
    face !== null && (instant || skip || reduced) ? "settled" : "idle",
  );
  useEffect(() => {
    if (face === null) {
      setPhase("idle");
      return;
    }
    if (reduced || skip) {
      setPhase("settled");
      return;
    }
    if (phase === "settled") return;
    setPhase("tumbling");
    const a = setTimeout(() => setPhase("settling"), TUMBLE_MS);
    const b = setTimeout(() => setPhase("settled"), TUMBLE_MS + SETTLE_MS);
    return () => {
      clearTimeout(a);
      clearTimeout(b);
    };
  }, [face, reduced, skip]);

  const landed = face !== null && phase === "settled";
  const quiet = useRef(landed);
  useEffect(() => {
    if (!landed) return;
    onLanded(seat);
    if (!quiet.current && !skip) feedback("land", { semitones: seat });
    quiet.current = false;
  }, [landed]);

  const six = landed && face === 6;
  const cls = ["ro-seat"];
  if (six) cls.push("is-six");
  if (winner) cls.push("is-winner");
  if (face === null) cls.push("is-waiting");
  return (
    <li
      class={cls.join(" ")}
      data-testid="rolloff-seat"
      data-seat={seat}
      data-face={landed ? face : undefined}
    >
      <span class="ro-avatar">
        <Avatar profile={info.profile} size={56} />
      </span>
      <span class="ro-name">{info.name}</span>
      <span class="ro-die">
        <Die
          color="WHITE"
          face={(face ?? 1) as Face}
          phase={phase}
          seed={seat * 7 + 3}
          index={0}
          highlight={six}
          reduced={reduced}
        />
        {six ? <span class="ro-badge">{t("rolloff.six")}</span> : null}
      </span>
      <span class="ro-status">{face === null ? t("rolloff.waiting") : " "}</span>
    </li>
  );
}

interface StageProps {
  testId: string;
  seats: SeatInfo[];
  faces: readonly (number | null)[];
  history: readonly (readonly number[])[];
  /** Per seat: show its face at mount without tumbling. */
  instant: (seat: number) => boolean;
  skip: boolean;
  reduced: boolean;
  me: number | null;
  /** The result (unique 6) may be shown once every die has landed. */
  final: boolean;
  onAllLanded?: () => void;
  onSkip?: () => void;
  footer: (state: { allLanded: boolean; winner: number | null }) => ComponentChildren;
}

function Stage(p: StageProps) {
  const [landed, setLanded] = useState<number[]>([]);
  const onLanded = (seat: number) => setLanded((l) => (l.includes(seat) ? l : [...l, seat]));
  const allLanded = p.faces.every((f, seat) => f !== null && landed.includes(seat));
  const six = allLanded ? uniqueSix(p.faces) : null;
  const winner = p.final ? six : null;
  useEffect(() => {
    if (allLanded) p.onAllLanded?.();
  }, [allLanded]);
  useEffect(() => {
    if (winner !== null) feedback("win");
  }, [winner]);

  const first = p.history.length - Math.min(HISTORY_MAX, p.history.length);
  const history = p.history
    .slice(first)
    .map((f, i) => t("rolloff.round", { n: first + i + 1, result: retryCaption(f) }))
    .join(" · ");
  const winnerName = winner === null ? "" : (p.seats[winner]?.name ?? "");
  let caption = " ";
  if (winner !== null) {
    caption = winner === p.me ? t("rolloff.youFirst") : t("rolloff.first", { name: winnerName });
  } else if (allLanded && six === null) caption = retryCaption(p.faces);

  const cls = ["ro-screen"];
  if (p.reduced) cls.push("is-reduced");
  if (winner !== null) cls.push("has-winner");
  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents lint/a11y/noStaticElementInteractions: the Skip button is the keyboard path
    <div class={cls.join(" ")} data-testid={p.testId} onClick={p.onSkip}>
      <div class="ro-body">
        <h1 class="ro-title">{t("rolloff.title")}</h1>
        {history ? (
          <p class="ro-history" data-testid="rolloff-history">
            {history}
          </p>
        ) : null}
        <ul class="ro-seats" data-count={p.seats.length}>
          {p.seats.map((info, seat) => (
            <SeatCard
              key={seat}
              seat={seat}
              info={info}
              face={p.faces[seat] ?? null}
              instant={p.instant(seat)}
              skip={p.skip}
              reduced={p.reduced}
              winner={winner === seat}
              onLanded={onLanded}
            />
          ))}
        </ul>
        <p class="ro-caption" role="status" aria-live="polite" data-testid="rolloff-caption">
          {caption}
        </p>
        <div class="ro-actions">{p.footer({ allLanded, winner })}</div>
      </div>
    </div>
  );
}

function GoButton({ onGo }: { onGo: () => void }) {
  return (
    <button
      type="button"
      class="btn ro-go"
      data-testid="rolloff-go"
      onClick={(e) => {
        e.stopPropagation();
        onGo();
      }}
    >
      {t("rolloff.go")}
    </button>
  );
}

/* ---------- Replay: the game has started; play the rounds, then hold the result ---------- */

export interface RollOffProps {
  view: ViewMessage;
  rounds: readonly (readonly number[])[];
  /** This client watched the live roll-off: start at the deciding round. */
  live?: boolean;
  onDone: () => void;
}

export function RollOff({ view, rounds, live = false, onDone }: RollOffProps) {
  useT();
  const reduced = useReducedMotion();
  const last = rounds.length - 1;
  const [round, setRound] = useState(live ? last : 0);
  const [skip, setSkip] = useState(false);
  const [doneRound, setDoneRound] = useState(-1);
  const shown = skip ? last : round;
  useEffect(() => {
    if (doneRound !== round || round >= last || skip) return;
    const timer = setTimeout(() => setRound(round + 1), ROUND_HOLD_MS);
    return () => clearTimeout(timer);
  }, [doneRound, round, skip]);

  const faces = rounds[shown] ?? [];
  const seen = live ? liveSeen.get(view.code) : undefined;
  const seenNow = seen && seen.round === shown + 1 ? seen.faces : [];
  const seats = faces.map((_, seat) => ({
    name: seatName(view, seat),
    profile: seatProfile(view, seat),
  }));
  return (
    <Stage
      key={shown}
      testId="rolloff"
      seats={seats}
      faces={faces}
      history={rounds.slice(0, shown)}
      instant={(seat) => seenNow[seat] === faces[seat]}
      skip={skip}
      reduced={reduced}
      me={view.you.seat}
      final={shown === last}
      onAllLanded={() => setDoneRound(shown)}
      onSkip={skip ? undefined : () => setSkip(true)}
      footer={({ winner }) =>
        winner !== null ? (
          <GoButton onGo={onDone} />
        ) : (
          <button
            type="button"
            class="btn ro-hint"
            onClick={(e) => {
              e.stopPropagation();
              setSkip(true);
            }}
          >
            {t("rolloff.skip")}
          </button>
        )
      }
    />
  );
}

/* ---------- Live: players roll their own die (T-NEW-2) ---------- */

export interface RollOffLiveProps {
  view: ViewMessage;
  /** Returns false when the socket is not connected. */
  send: (msg: { type: "rollOff"; round: number }) => boolean;
}

/** Seat i of a roll-off is the i-th seat of the room, in join order (the server's seat order). */
const liveSeat = (view: ViewMessage, seat: number): SeatInfo => ({
  name: view.seats[seat]?.name ?? t("player.fallback", { n: seat + 1 }),
  profile: view.seats[seat]?.profile,
});

export function RollOffLive({ view, send }: RollOffLiveProps) {
  useT();
  const reduced = useReducedMotion();
  const ro = view.rollOff;
  const done = ro?.completed.length ?? 0;
  /** Index of the round on screen; it lags behind `done` while a finished round is held. */
  const [shown, setShown] = useState(done);
  const firstShown = useRef(done);
  const [landedRound, setLandedRound] = useState(-1);
  useEffect(() => {
    if (shown >= done) return;
    if (landedRound !== shown) return;
    const timer = setTimeout(() => setShown(shown + 1), ROUND_HOLD_MS);
    return () => clearTimeout(timer);
  }, [shown, done, landedRound]);
  if (!ro) return null;
  liveSeen.set(view.code, { round: ro.round, faces: [...ro.faces] });

  const current = shown >= done;
  const faces = current ? ro.faces : (ro.completed[shown] ?? []);
  const seats = faces.map((_, seat) => liveSeat(view, seat));
  const mySeat = view.you.seat;
  const canRoll = current && mySeat !== null && ro.rolled[mySeat] === false;
  return (
    <Stage
      key={shown}
      testId="rolloff-live"
      seats={seats}
      faces={faces}
      history={ro.completed.slice(0, shown)}
      instant={() => shown === firstShown.current}
      skip={false}
      reduced={reduced}
      me={mySeat}
      final={false}
      onAllLanded={() => setLandedRound(shown)}
      footer={() =>
        mySeat === null ? null : (
          <button
            type="button"
            class={`btn ro-roll${canRoll ? " is-ready" : ""}`}
            data-testid="rolloff-roll"
            disabled={!canRoll}
            onClick={() => send({ type: "rollOff", round: ro.round })}
          >
            {t("rolloff.roll")}
          </button>
        )
      }
    />
  );
}
