/** Results card (H7) over the dimmed board: winners, reason, ranked table, Rematch / Back home. */
import type { ClientMessage, ViewMessage } from "@cd/protocol";
import type { ComponentType } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { Button } from "../components/Button";
import { ChatControls } from "../components/ChatButton";
import { CrownIcon, TieIcon } from "../components/icons";
import { rankNumbers, rankPlayers, ScoreTable } from "../components/ScoreTable";
import { Sheet } from "../components/Sheet";
import { reducedMotion } from "../fx/motion";
import { hasCard, seatInfo, tieInfo } from "../game/model";
import { endReasonText } from "../game/status";
import { type GameResult, recordGame } from "../history";
import "../styles/opponents.css";

const NO_FX = { flash: {}, glint: null, floats: [], shakeKey: 0 };
const NO_LEGAL: ReadonlySet<string> = new Set();
const noop = () => {};

export interface GameOverProps {
  view: ViewMessage;
  rematchBusy: boolean;
  send: (m: ClientMessage) => boolean;
  onRematch: () => void;
  onHome: () => void;
}

const COUNT_MS = 900;
const FLIP_MS = 500;

/**
 * FLIP reorder (H7): the table is ranked, but while the scores count up it shows seat order;
 * after the count-up the rows glide into rank order.
 */
function useFlipReorder(view: ViewMessage) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const rows = Array.from(ref.current?.querySelectorAll<HTMLElement>("tbody tr") ?? []);
    if (rows.length < 2 || reducedMotion() || typeof rows[0]?.animate !== "function") return;
    const ranked = rankPlayers(view);
    const seatOrder = [...ranked].sort((a, b) => a.seat - b.seat);
    const tops = rows.map((r) => r.offsetTop);
    rows.forEach((row, i) => {
      const player = ranked[i];
      if (!player) return;
      const from = tops[seatOrder.indexOf(player)] ?? tops[i] ?? 0;
      const dy = from - (tops[i] ?? 0);
      if (dy === 0) return;
      row.animate([{ transform: `translateY(${dy}px)` }, { transform: "none" }], {
        duration: FLIP_MS,
        delay: COUNT_MS,
        easing: "cubic-bezier(0.2, 0.8, 0.2, 1)",
        fill: "backwards",
      });
    });
  }, []);
  return ref;
}

/** Lazy winner confetti: its chunk loads only for winners, and not under reduced motion. */
function useConfetti(winner: boolean): ComponentType | null {
  const [C, setC] = useState<ComponentType | null>(null);
  useEffect(() => {
    if (!winner || reducedMotion()) return;
    let alive = true;
    import("../components/Confetti").then((m) => {
      if (alive) setC(() => m.Confetti);
    });
    return () => {
      alive = false;
    };
  }, [winner]);
  return C;
}

/** Appends this finished game to the device history once (dedupe by room code + game number). */
function useDeviceHistory(view: ViewMessage, result: GameResult) {
  useEffect(() => {
    if (view.game?.phase !== "GAME_OVER" || view.you.seat === null) return;
    const mine = view.seats.find((s) => s.seatId === view.you.seatId);
    if (!mine) return;
    recordGame({
      code: view.code,
      game: mine.record.wins + mine.record.ties + mine.record.losses,
      result,
      at: Date.now(),
    });
  }, []);
}

export function GameOver({ view, rematchBusy, send, onRematch, onHome }: GameOverProps) {
  const g = view.game;
  const { winnerSeats, tie, allTied } = tieInfo(view);
  const names = winnerSeats.map(
    (s) =>
      view.seats.find((x) => x.seatId === g?.players.find((p) => p.seat === s)?.seatId)?.name ?? "",
  );
  const iWon = view.you.seat !== null && winnerSeats.includes(view.you.seat);
  const tableRef = useFlipReorder(view);
  useDeviceHistory(view, !iWon ? "L" : tie ? "T" : "W");
  const Confetti = useConfetti(iWon);
  const ranked = rankPlayers(view);
  const ranks = new Map(
    rankNumbers(ranked).map((r, i) => [(ranked[i] as { seat: number }).seat, r]),
  );
  return (
    <div class="g-backdrop g-over">
      <section
        class="g-panel card g-results-card"
        role="dialog"
        aria-modal="true"
        aria-label="Results"
      >
        {Confetti ? <Confetti /> : null}
        <h2 class="g-winner" data-tie={tie ? (allTied ? "all" : "some") : undefined}>
          {tie ? <TieIcon size={22} /> : <CrownIcon size={22} />}{" "}
          {allTied ? (
            "It's a tie!"
          ) : (
            <>
              {tie ? "Tie: " : "Winner: "}
              {names.map((n, i) => (
                <>
                  {i > 0 ? " & " : null}
                  <span class="g-name" title={n}>
                    {n}
                  </span>
                </>
              ))}
            </>
          )}
        </h2>
        <p class="muted g-reason">{endReasonText(view)}</p>
        <div ref={tableRef}>
          <ScoreTable view={view} />
        </div>
        <section class="g-final-cards" aria-label="Final score cards">
          {ranked.filter(hasCard).map((p) => (
            <article
              key={p.seat}
              class="g-final-card"
              data-seat-id={seatInfo(view, p)?.seatId}
              aria-label={`${seatInfo(view, p)?.name ?? `Player ${p.seat + 1}`}'s card`}
            >
              <h3 class="g-final-head">
                <span class="num">{ranks.get(p.seat)}.</span>{" "}
                <span class="g-name">{seatInfo(view, p)?.name ?? `Player ${p.seat + 1}`}</span>
              </h3>
              <Sheet
                player={p}
                lockedColors={g?.lockedColors ?? []}
                legal={NO_LEGAL}
                staged={null}
                ghost={null}
                disabled
                readOnly
                fx={NO_FX}
                onPick={noop}
              />
            </article>
          ))}
        </section>
        <div class="chat-over">
          <ChatControls send={send} />
        </div>
        <div class="g-over-actions">
          {view.you.host ? (
            <Button variant="primary" busy={rematchBusy} onClick={onRematch}>
              Rematch
            </Button>
          ) : null}
          <Button onClick={onHome}>Back to home</Button>
        </div>
      </section>
    </div>
  );
}
