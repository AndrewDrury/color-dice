/** Read-only 4x12 grid of an opponent (>= 600 px): marks, locks, total, status. */
import { type Color, numberAt } from "@cd/engine";
import type { ViewMessage, ViewPlayer } from "@cd/protocol";
import { COLOR_LETTER, COLORS, cssColor, seatInfo } from "../game/model";
import { useTween } from "../game/useTween";
import { opponentState, StatusGlyph } from "./OpponentChip";

export interface MiniSheetProps {
  view: ViewMessage;
  player: ViewPlayer;
  /** `${color}:${index}` of marks to flash. */
  flash: ReadonlySet<string>;
  onOpen: () => void;
}

export function MiniSheet({ view, player, flash, onOpen }: MiniSheetProps) {
  const seat = seatInfo(view, player);
  const name = seat?.name ?? `Player ${player.seat + 1}`;
  const st = opponentState(view, player);
  const total = useTween(player.score.total);
  const locked = view.game?.lockedColors ?? [];
  return (
    <button
      type="button"
      class={`g-mini card${st.active ? " is-active" : ""}`}
      aria-label={`${name}, ${player.score.total} points. Open full sheet`}
      onClick={onOpen}
    >
      <span class="g-mini-head">
        <span class="g-name">{name}</span>
        <StatusGlyph state={st} />
        <span class="num g-mini-total" data-total={player.score.total}>
          {total}
        </span>
      </span>
      <span class="g-mini-grid" aria-hidden="true">
        {COLORS.map((c: Color) => (
          <span
            key={c}
            class={`g-mini-row c-${cssColor(c)}${locked.includes(c) ? " is-closed" : ""}`}
          >
            <span class="g-mini-l">{COLOR_LETTER[c]}</span>
            {player.sheet.rows[c].marked.map((on, i) => (
              <span
                key={numberAt(c, i)}
                class={`g-mini-cell${on ? " is-on" : ""}${flash.has(`${c}:${i}`) ? " is-flash" : ""}`}
              />
            ))}
            <span
              class={`g-mini-cell g-mini-lock${player.sheet.rows[c].lockCrossed ? " is-on" : ""}`}
            />
          </span>
        ))}
      </span>
    </button>
  );
}
