import type { ViewMessage } from "@cd/protocol";
import { useEffect, useRef } from "preact/hooks";
import { reducedMotion } from "../fx/motion";

export type Seat = ViewMessage["seats"][number];

export interface SeatListProps {
  seats: readonly Seat[];
  youSeatId: string | null;
  /** The viewer is the host: show a ✕ remove button on every other seat. */
  isHost: boolean;
  onKick?: (seat: Seat) => void;
}

/** Spring-like pop for a seat that just appeared (skipped under reduced motion). */
function popIn(el: HTMLElement | null): void {
  if (!el || typeof el.animate !== "function" || reducedMotion()) return;
  el.animate(
    [
      { transform: "scale(0.6)", opacity: 0 },
      { transform: "scale(1.06)", opacity: 1, offset: 0.55 },
      { transform: "scale(0.98)", offset: 0.8 },
      { transform: "scale(1)", opacity: 1 },
    ],
    { duration: 420, easing: "cubic-bezier(0.34, 1.56, 0.64, 1)" },
  );
}

function SeatRow({
  seat,
  you,
  canKick,
  showRecord,
  onKick,
}: {
  seat: Seat;
  you: boolean;
  canKick: boolean;
  showRecord: boolean;
  onKick: ((seat: Seat) => void) | undefined;
}) {
  const ref = useRef<HTMLLIElement>(null);
  useEffect(() => popIn(ref.current), []);

  return (
    <li
      ref={ref}
      class="row"
      data-seat={seat.seatId}
      style={{
        justifyContent: "space-between",
        minHeight: "var(--tap)",
        padding: "var(--s1) var(--s2)",
        borderRadius: "var(--r-box)",
        background: "var(--paper)",
      }}
    >
      <span class="row" style={{ gap: "var(--s2)", minWidth: 0 }}>
        <span
          role="img"
          aria-label={seat.online ? "Online" : "Offline"}
          style={{
            flex: "0 0 auto",
            width: "10px",
            height: "10px",
            borderRadius: "50%",
            background: seat.online ? "var(--row-green)" : "transparent",
            border: `2px solid ${seat.online ? "var(--row-green)" : "var(--ink-muted)"}`,
          }}
        />
        <span style={{ overflowWrap: "anywhere", fontWeight: "var(--fw-bold)" }}>{seat.name}</span>
        {you ? <span class="muted">(you)</span> : null}
        {showRecord ? (
          <span
            role="img"
            class="num muted"
            data-record={`${seat.record.wins}-${seat.record.losses}`}
            aria-label={`${seat.record.wins} wins, ${seat.record.losses} losses`}
          >
            {seat.record.wins}–{seat.record.losses}
          </span>
        ) : null}
        {seat.host ? (
          <span
            style={{
              fontSize: "var(--fs-small)",
              padding: "0 var(--s2)",
              borderRadius: "var(--r-pill)",
              border: "1px solid currentColor",
            }}
          >
            Host
          </span>
        ) : null}
      </span>
      {canKick ? (
        <button
          type="button"
          class="btn"
          aria-label={`Remove ${seat.name}`}
          onClick={() => onKick?.(seat)}
        >
          ✕
        </button>
      ) : null}
    </li>
  );
}

/** Live seat list: online dot, name (text only), host badge, "(you)", host kick buttons. */
export function SeatList({ seats, youSeatId, isHost, onKick }: SeatListProps) {
  // W–L is hidden until somebody in the room has played a game.
  const showRecord = seats.some((s) => s.record.wins + s.record.losses > 0);
  return (
    <ul class="stack" aria-label="Players" style={{ listStyle: "none", margin: 0, padding: 0 }}>
      {seats.map((seat) => (
        <SeatRow
          key={seat.seatId}
          seat={seat}
          you={seat.seatId === youSeatId}
          canKick={isHost && seat.seatId !== youSeatId}
          showRecord={showRecord}
          onKick={onKick}
        />
      ))}
    </ul>
  );
}
