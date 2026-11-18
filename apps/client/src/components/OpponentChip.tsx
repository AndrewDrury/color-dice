/** Phone opponent chip (H3): name, total, status glyph, status glyph, penalties. */
import type { ViewMessage, ViewPlayer } from "@cd/protocol";
import { seatInfo } from "../game/model";
import { useTween } from "../game/useTween";
import { t, tn, useT } from "../i18n";
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
      <span class="g-glyph is-away" role="img" aria-label={t("opp.away")}>
        <WarningIcon size={14} />
      </span>
    );
  }
  if (state.offline)
    return <span class="g-glyph is-offline" role="img" aria-label={t("opp.offline")} />;
  if (state.decided) {
    return (
      <span class="g-glyph is-decided" role="img" aria-label={t("opp.decided")}>
        <CheckIcon size={14} />
      </span>
    );
  }
  if (state.thinking) {
    return (
      <span class="g-glyph is-thinking" role="img" aria-label={t("opp.choosing")}>
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
}

/** Opponent chip: name, status glyph, total and penalty count. Their card stays hidden until game over. */
export function OpponentChip({ view, player, flash }: ChipProps) {
  useT();
  const seat = seatInfo(view, player);
  const name = seat?.name ?? t("player.fallback", { n: player.seat + 1 });
  const st = opponentState(view, player);
  const total = useTween(player.score.total);
  const strikes = Math.round(-player.score.penalties / 5);
  return (
    <div
      class={`g-chip${st.active ? " is-active" : ""}${flash ? " is-flash" : ""}`}
      title={name}
      data-seat-id={seat?.seatId}
      role="img"
      aria-label={t("opp.chip", {
        name,
        points: player.score.total,
        strikes: tn("opp.penalties", strikes),
      })}
    >
      <span class="g-chip-top">
        <span class="g-name">{name}</span>
        <StatusGlyph state={st} />
        <span class="num" data-total={player.score.total}>
          {total}
        </span>
      </span>
      <span class="g-chip-pen" data-penalties={strikes} aria-hidden="true">
        {strikes > 0 ? `✕ ${strikes}` : t("opp.none")}
      </span>
    </div>
  );
}
