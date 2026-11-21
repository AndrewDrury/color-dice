/** Results card (H7) over the dimmed board: winners, reason, ranked table, Rematch / Back home. */
import type { ClientMessage, ViewMessage } from "@cd/protocol";
import type { ComponentType } from "preact";
import { useEffect, useState } from "preact/hooks";
import { AvatarHover } from "../components/AvatarHover";
import { Button } from "../components/Button";
import { ChatControls, ChatLayer } from "../components/ChatButton";
import { CrownIcon, TieIcon } from "../components/icons";
import type { ResultsRevealProps } from "../components/ResultsReveal";
import { rankNumbers, rankPlayers, ScoreTable } from "../components/ScoreTable";
import { Sheet } from "../components/Sheet";
import { hasCard, seatInfo, tieInfo } from "../game/model";
import { endReasonText } from "../game/status";
import { celebrationKey, claimCelebration } from "../game/useReveal";
import { type GameResult, recordGame } from "../history";
import { t, useT } from "../i18n";
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

let LoadedReveal: ComponentType<ResultsRevealProps> | null = null;
const revealModule = import("../components/ResultsReveal").then(({ ResultsReveal }) => {
  LoadedReveal = ResultsReveal;
});

/** Appends this finished game to the device history once (dedupe by room code + game number). */
function useDeviceHistory(view: ViewMessage, result: GameResult) {
  useEffect(() => {
    if (view.code === "DEMO") return;
    if (view.game?.phase !== "GAME_OVER" || view.you.seat === null) return;
    const mine = view.seats.find((s) => s.seatId === view.you.seatId);
    if (!mine) return;
    const minePlayer = view.game.players.find((p) => p.seat === view.you.seat);
    const opponents = view.game.players
      .filter((p) => p.seat !== view.you.seat)
      .map((p) => {
        const seat = view.seats.find((s) => s.seatId === p.seatId);
        return {
          name: seat?.name ?? "",
          colour: seat?.profile?.color ?? ("slate" as const),
          cat: seat?.profile?.cat ?? ("mad-cat" as const),
          score: p.score.total,
        };
      })
      .filter((p) => p.name.length > 0);
    recordGame({
      code: view.code,
      game: mine.record.wins + mine.record.ties + mine.record.losses,
      result,
      at: Date.now(),
      opponents,
      myScore: minePlayer?.score.total,
      players: view.game.players.length,
    });
  }, []);
}

export function GameOver({ view, rematchBusy, send, onRematch, onHome }: GameOverProps) {
  useT();
  const g = view.game;
  const { winnerSeats, tie, allTied } = tieInfo(view);
  const names = winnerSeats.map(
    (s) =>
      view.seats.find((x) => x.seatId === g?.players.find((p) => p.seat === s)?.seatId)?.name ?? "",
  );
  const iWon = view.you.seat !== null && winnerSeats.includes(view.you.seat);
  useDeviceHistory(view, !iWon ? "L" : tie ? "T" : "W");
  const [celebrating, setCelebrating] = useState(() =>
    view.code === "DEMO" ? false : claimCelebration(celebrationKey(view)),
  );
  const [RevealState, setRevealState] = useState<{
    value: ComponentType<ResultsRevealProps> | null;
  }>(() => ({ value: LoadedReveal }));
  const Reveal = RevealState.value;
  useEffect(() => {
    if (!celebrating || Reveal) return;
    let active = true;
    void revealModule.then(() => active && setRevealState({ value: LoadedReveal }));
    return () => {
      active = false;
    };
  }, [celebrating, Reveal]);
  const ranked = rankPlayers(view);
  const ranks = new Map(
    rankNumbers(ranked).map((r, i) => [(ranked[i] as { seat: number }).seat, r]),
  );
  const actions = (
    <>
      {view.you.host ? (
        <Button variant="primary" busy={rematchBusy} onClick={onRematch}>
          {t("over.rematch")}
        </Button>
      ) : null}
      <Button onClick={onHome}>{t("over.home")}</Button>
    </>
  );
  return (
    <div class="g-backdrop g-over">
      <section
        class="g-panel card g-results-card"
        role="dialog"
        aria-modal="true"
        aria-label={t("over.results")}
      >
        <h2 class="g-winner" data-tie={tie ? (allTied ? "all" : "some") : undefined}>
          {tie ? <TieIcon size={22} /> : <CrownIcon size={22} />}{" "}
          {allTied ? (
            t("over.tieAll")
          ) : (
            <>
              {tie ? t("over.tie") : t("over.winner")}
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
        <div>
          <ScoreTable view={view} />
        </div>
        <section class="g-final-cards" aria-label={t("over.finalCards")}>
          {ranked.filter(hasCard).map((p) => (
            <article
              key={p.seat}
              class="g-final-card"
              data-seat-id={seatInfo(view, p)?.seatId}
              aria-label={t("sheet.rowCard", {
                name: seatInfo(view, p)?.name ?? t("player.fallback", { n: p.seat + 1 }),
              })}
            >
              <h3 class="g-final-head">
                <span class="num">{ranks.get(p.seat)}.</span>{" "}
                <AvatarHover
                  profile={seatInfo(view, p)?.profile}
                  size={28}
                  name={seatInfo(view, p)?.name ?? t("player.fallback", { n: p.seat + 1 })}
                />{" "}
                <span class="g-name">
                  {seatInfo(view, p)?.name ?? t("player.fallback", { n: p.seat + 1 })}
                </span>
              </h3>
              <Sheet
                player={p}
                lockedColors={g?.lockedColors ?? []}
                legal={NO_LEGAL}
                staged={[]}
                ghost={[]}
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
        <div class="g-over-actions" hidden={celebrating}>
          {actions}
        </div>
      </section>
      {celebrating && Reveal ? (
        <Reveal
          view={view}
          onDone={() => setCelebrating(false)}
          actions={actions}
          chat={
            <>
              <ChatControls send={send} />
              <ChatLayer send={send} />
            </>
          }
        />
      ) : null}
    </div>
  );
}
