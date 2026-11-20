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
import { AvatarHover } from "./AvatarHover";
import { Die } from "./Die";
import "../styles/dice.css";
import "../styles/rolloff.css";

/** Local timing: a face tumbles, then settles (~800 ms from arrival to rest). */
const TUMBLE_MS = 450;
const SETTLE_MS = 350;
/** A finished tied round stays this long before the tied dice are tossed again. */
export const ROUND_HOLD_MS = 1400;

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

const rollOffSeatName = (view: ViewMessage, seat: number): string => {
  const record = view.seats[seat];
  if (record?.kind === "cpu") {
    const number = record.name.match(/(\d+)$/)?.[1] ?? "";
    return t("waiting.cpuName", { n: number });
  }
  return seatName(view, seat);
};

/** Seats holding the highest face of a round (0 / null = did not roll). */
const leaders = (faces: readonly (number | null)[]): number[] => {
  const max = Math.max(0, ...faces.map((f) => f ?? 0));
  return max === 0 ? [] : faces.flatMap((f, seat) => (f === max ? [seat] : []));
};

interface CardProps {
  seat: number;
  info: SeatInfo;
  /** This round: null = not rolled yet, 0 = out of this round, else the new face. */
  face: number | null;
  /** The face the die already shows (its last roll), kept while it waits or is out. */
  prev: number | null;
  /** Round index; with `face` it identifies one toss of this same die. */
  round: number;
  /** Show a face that is already there at mount without tumbling (reconnect, seen live). */
  instant: boolean;
  skip: boolean;
  reduced: boolean;
  lead: boolean;
  winner: boolean;
  onLanded: (seat: number, tag: string) => void;
}

/** One player's physical die. It stays mounted across rounds and is tossed again on a tie. */
function SeatCard(p: CardProps) {
  const { seat, info, face, prev, round, skip, reduced } = p;
  const shown = face !== null && face > 0 ? face : prev;
  const first = useRef(true);
  const [phase, setPhase] = useState<RollPhase>(shown !== null ? "settled" : "idle");
  useEffect(() => {
    const isFirst = first.current;
    first.current = false;
    if (face === null || face === 0) return;
    const tag = `${round}:${face}`;
    if (reduced || skip || (isFirst && p.instant)) {
      setPhase("settled");
      p.onLanded(seat, tag);
      return;
    }
    setPhase("tumbling");
    const a = setTimeout(() => setPhase("settling"), TUMBLE_MS);
    const b = setTimeout(() => {
      setPhase("settled");
      p.onLanded(seat, tag);
      feedback("land", { semitones: seat });
    }, TUMBLE_MS + SETTLE_MS);
    return () => {
      clearTimeout(a);
      clearTimeout(b);
    };
  }, [round, face, reduced, skip]);

  const out = face === 0;
  const cls = ["ro-seat"];
  if (p.lead) cls.push("is-lead");
  if (p.winner) cls.push("is-winner");
  if (out) cls.push("is-out");
  if (shown === null) cls.push("is-waiting");
  return (
    <li
      class={cls.join(" ")}
      data-testid="rolloff-seat"
      data-seat={seat}
      data-face={phase === "settled" && shown !== null ? shown : undefined}
    >
      <span class="ro-avatar">
        <AvatarHover profile={info.profile} size={56} name={info.name} />
      </span>
      <span class="ro-name">{info.name}</span>
      <span class="ro-die">
        <Die
          color="WHITE"
          face={(shown ?? 1) as Face}
          phase={phase}
          seed={seat * 7 + 3}
          index={0}
          highlight={p.lead}
          reduced={reduced}
        />
      </span>
      <span class="ro-status">
        {out ? t("rolloff.out") : face === null ? t("rolloff.waiting") : " "}
      </span>
    </li>
  );
}

interface StageProps {
  testId: string;
  seats: SeatInfo[];
  /** Index of the round on screen (history length). */
  round: number;
  /** Per seat: this round's face, null before it rolls, 0 if out. */
  faces: readonly (number | null)[];
  /** Rounds before this one (full-width, 0 = out), for each die's last face. */
  history: readonly (readonly number[])[];
  /** Per seat: show its face at mount without tumbling. */
  instant: (seat: number) => boolean;
  skip: boolean;
  reduced: boolean;
  me: number | null;
  /** The unique leader of this round wins (only the deciding round). */
  final: boolean;
  onAllLanded?: () => void;
  onSkip?: () => void;
  footer: (state: { allLanded: boolean; winner: number | null }) => ComponentChildren;
}

function Stage(p: StageProps) {
  const [landed, setLanded] = useState<Record<number, string>>({});
  const onLanded = (seat: number, tag: string) => setLanded((l) => ({ ...l, [seat]: tag }));
  const allLanded = p.faces.every(
    (f, seat) => f === 0 || (f !== null && landed[seat] === `${p.round}:${f}`),
  );
  const lead = allLanded ? leaders(p.faces) : [];
  const winner = p.final && lead.length === 1 ? (lead[0] as number) : null;
  useEffect(() => {
    if (allLanded) p.onAllLanded?.();
  }, [allLanded, p.round]);
  useEffect(() => {
    if (winner !== null) feedback("win");
  }, [winner]);

  const prevFace = (seat: number): number | null => {
    for (let r = p.history.length - 1; r >= 0; r--) {
      const f = p.history[r]?.[seat];
      if (f) return f;
    }
    return null;
  };
  const winnerName = winner === null ? "" : (p.seats[winner]?.name ?? "");
  let caption = " ";
  if (winner !== null) {
    caption = winner === p.me ? t("rolloff.youFirst") : t("rolloff.first", { name: winnerName });
  } else if (lead.length > 1) caption = t("rolloff.tie");

  const cls = ["ro-screen"];
  if (p.reduced) cls.push("is-reduced");
  if (winner !== null) cls.push("has-winner");
  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents lint/a11y/noStaticElementInteractions: the Skip button is the keyboard path
    <div class={cls.join(" ")} data-testid={p.testId} onClick={p.onSkip}>
      <div class="ro-body">
        <h1 class="ro-title">{t("rolloff.title")}</h1>
        <p class="ro-history" data-testid="rolloff-history">
          {p.round > 0 ? t("rolloff.round", { n: p.round + 1 }) : t("rolloff.rule")}
        </p>
        <ul class="ro-seats" data-count={p.seats.length}>
          {p.seats.map((info, seat) => (
            <SeatCard
              key={seat}
              seat={seat}
              info={info}
              face={p.faces[seat] ?? null}
              prev={prevFace(seat)}
              round={p.round}
              instant={p.instant(seat)}
              skip={p.skip}
              reduced={p.reduced}
              lead={lead.includes(seat)}
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
    name: rollOffSeatName(view, seat),
    profile: seatProfile(view, seat),
  }));
  return (
    <Stage
      testId="rolloff"
      seats={seats}
      round={shown}
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
  name: rollOffSeatName(view, seat),
  profile: view.seats[seat]?.profile,
});

export function RollOffLive({ view, send }: RollOffLiveProps) {
  useT();
  const reduced = useReducedMotion();
  const ro = view.rollOff;
  const done = ro?.completed.length ?? 0;
  /** Index of the round on screen; it lags behind `done` while a finished round is held. */
  const [shown, setShown] = useState(done);
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
      testId="rolloff-live"
      seats={seats}
      round={shown}
      faces={faces}
      history={ro.completed.slice(0, shown)}
      instant={() => true}
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
