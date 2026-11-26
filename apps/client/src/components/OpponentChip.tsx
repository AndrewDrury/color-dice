/** Phone opponent chip (H3): name, status glyph, penalties (totals stay hidden until game over). */
import type { ViewMessage, ViewPlayer } from "@cd/protocol";
import { seatInfo } from "../game/model";
import { t, tn, useT } from "../i18n";
import { AvatarHover } from "./AvatarHover";
import { CheckIcon, CloseIcon, DotsIcon, WarningIcon } from "./icons";
import { isCpuSeat } from "./SeatList";

export interface OpponentState {
  active: boolean;
  decided: boolean;
  thinking: boolean;
  away: boolean;
  /** The player left the game for good (K2.2); shown apart from away. */
  left: boolean;
  offline: boolean;
}

export function opponentState(view: ViewMessage, p: ViewPlayer): OpponentState {
  const g = view.game;
  const seat = seatInfo(view, p);
  const cpu = seat ? isCpuSeat(seat) : false;
  const active = g?.turn?.activeSeat === p.seat && g.phase !== "GAME_OVER";
  const decided = g?.phase === "ACTION_1" && (p.decided ?? p.action1Submitted);
  const thinking =
    (g?.phase === "ACTION_1" && !(p.decided ?? p.action1Submitted)) ||
    ((g?.phase === "ACTION_2" || g?.phase === "AWAIT_ROLL") && active);
  return {
    active: !!active,
    decided,
    thinking: !decided && thinking,
    away: !!seat?.away && !seat.left && !cpu,
    left: !!seat?.left,
    offline: seat ? !seat.online && !cpu : false,
  };
}

export function StatusGlyph({ state }: { state: OpponentState }) {
  if (state.left) {
    return (
      <span class="g-glyph is-left" role="img" aria-label={t("opp.left")}>
        <CloseIcon size={14} />
      </span>
    );
  }
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

/** Opponent avatar size (T-NEW-15): 2.5× the old 16 px, never below 40 px. */
export const OPP_AVATAR = 40;

export interface ChipProps {
  view: ViewMessage;
  player: ViewPlayer;
  flash: boolean;
}

/** Opponent chip: name, status glyph and penalty count. Their total (and card) stay hidden until game over. */
export function OpponentChip({ view, player, flash }: ChipProps) {
  useT();
  const seat = seatInfo(view, player);
  const cpu = seat ? isCpuSeat(seat) : false;
  const rawName = seat?.name;
  const cpuNumber = rawName?.match(/(\d+)$/)?.[1];
  const name = cpu
    ? t("waiting.cpuName", { n: cpuNumber ?? "" })
    : (rawName ?? t("player.fallback", { n: player.seat + 1 }));
  const g = view.game;
  const st = opponentState(view, player);
  const strikes = Math.round(-player.score.penalties / 5);
  const penaltyAria = strikes > 0 ? tn("opp.penalties", strikes) : t("opp.none");
  return (
    <div
      class={`g-chip${st.active ? " is-active" : g?.phase !== "GAME_OVER" ? " is-dim" : ""}${flash ? " is-flash" : ""}`}
      title={name}
      data-seat-id={seat?.seatId}
      role="img"
      aria-label={t("opp.chip", {
        name,
        strikes: penaltyAria,
      })}
    >
      <AvatarHover profile={seat?.profile} size={OPP_AVATAR} name={name} />
      <span class="g-chip-body">
        <span class="g-chip-top">
          <span class="g-name name-clip" title={name}>
            {name}
          </span>
          {cpu ? <span class="cpu-badge">{t("waiting.cpu")}</span> : null}
          <StatusGlyph state={st} />
        </span>
        <span class="g-chip-penboxes" data-penalties={strikes} aria-hidden="true">
          {Array.from({ length: 4 }, (_, i) => (
            <span key={i} class={`g-pbox g-chip-pbox${i < strikes ? " is-on" : ""}`}>
              {i < strikes ? "✕" : "−5"}
            </span>
          ))}
        </span>
      </span>
    </div>
  );
}
