/** Phone opponent chip (H3): name, total, status glyph, four progress bars. Tap opens the sheet. */
import type { ViewMessage, ViewPlayer } from "@cd/protocol";
import { COLORS, cssColor, markCount, seatInfo } from "../game/model";
import { useTween } from "../game/useTween";
import { CheckIcon, DotsIcon, WarningIcon } from "./icons";

export interface OpponentState {
  active: boolean;
  decided: boolean;
  thinking: boolean;
  away: boolean;
  offline: boolean;
}

export function opponentState(view: ViewMessage, p: ViewPlayer): OpponentState {
  const g = view.game;
  const seat = seatInfo(view, p);
  const active = g?.turn?.activeSeat === p.seat && g.phase !== "GAME_OVER";
  const decided = g?.phase === "ACTION_1" && p.action1Submitted;
  const thinking =
    (g?.phase === "ACTION_1" && !p.action1Submitted) ||
    ((g?.phase === "ACTION_2" || g?.phase === "AWAIT_ROLL") && active);
  return {
    active: !!active,
    decided,
    thinking: !decided && thinking,
    away: !!seat?.away,
    offline: seat ? !seat.online : false,
  };
}

export function StatusGlyph({ state }: { state: OpponentState }) {
  if (state.away) {
    return (
      <span class="g-glyph is-away" role="img" aria-label="away">
        <WarningIcon size={14} />
      </span>
    );
  }
  if (state.offline) return <span class="g-glyph is-offline" role="img" aria-label="offline" />;
  if (state.decided) {
    return (
      <span class="g-glyph is-decided" role="img" aria-label="decided">
        <CheckIcon size={14} />
      </span>
    );
  }
  if (state.thinking) {
    return (
      <span class="g-glyph is-thinking" role="img" aria-label="choosing">
        <DotsIcon size={14} />
      </span>
    );
  }
  return null;
}

export interface ChipProps {
  view: ViewMessage;
  player: ViewPlayer;
  flash: boolean;
  onOpen: () => void;
}

export function OpponentChip({ view, player, flash, onOpen }: ChipProps) {
  const seat = seatInfo(view, player);
  const name = seat?.name ?? `Player ${player.seat + 1}`;
  const st = opponentState(view, player);
  const total = useTween(player.score.total);
  return (
    <button
      type="button"
      class={`g-chip${st.active ? " is-active" : ""}${flash ? " is-flash" : ""}`}
      title={name}
      data-seat-id={seat?.seatId}
      aria-label={`${name}, ${player.score.total} points. Open full sheet`}
      onClick={onOpen}
    >
      <span class="g-chip-top">
        <span class="g-name">{name}</span>
        <span class="num" data-total={player.score.total}>
          {total}
        </span>
        <StatusGlyph state={st} />
      </span>
      <span class="g-bars" aria-hidden="true">
        {COLORS.map((c) => (
          <span key={c} class={`g-bar c-${cssColor(c)}`}>
            <span style={{ width: `${(markCount(player.sheet.rows[c]) / 11) * 100}%` }} />
          </span>
        ))}
      </span>
    </button>
  );
}
