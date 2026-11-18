/** Results card (H7) over the dimmed board: winners, reason, ranked table, Rematch / Back home. */
import type { ViewMessage } from "@cd/protocol";
import { Button } from "../components/Button";
import { CrownIcon } from "../components/icons";
import { ScoreTable } from "../components/ScoreTable";
import { joinNames, seatOfPlayer } from "../game/model";
import { Celebration } from "../game/slots";
import { endReasonText } from "../game/status";

export interface GameOverProps {
  view: ViewMessage;
  rematchBusy: boolean;
  onRematch: () => void;
  onHome: () => void;
}

export function GameOver({ view, rematchBusy, onRematch, onHome }: GameOverProps) {
  const g = view.game;
  const winnerSeats = (g?.winners ?? []).map((id) => seatOfPlayer(id, g));
  const names = winnerSeats.map(
    (s) =>
      view.seats.find((x) => x.seatId === g?.players.find((p) => p.seat === s)?.seatId)?.name ?? "",
  );
  const iWon = view.you.seat !== null && winnerSeats.includes(view.you.seat);
  return (
    <div class="g-backdrop g-over">
      <section
        class="g-panel card g-results-card"
        role="dialog"
        aria-modal="true"
        aria-label="Results"
      >
        <Celebration winner={iWon} />
        <h2 class="g-winner">
          <CrownIcon size={22} /> {winnerSeats.length > 1 ? "Tied winners" : "Winner"}
          {": "}
          <span class="g-name">{joinNames(names)}</span>
        </h2>
        <p class="muted g-reason">{endReasonText(view)}</p>
        <ScoreTable view={view} />
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
