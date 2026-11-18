/** Status line (D2 + H15) and the H13 roll / reveal announcements. */
import type { ViewMessage } from "@cd/protocol";
import { colorName, joinNames, t } from "../i18n";
import { COLORS, seatName, seatOfPlayer } from "./model";
import { currentStep, isActive, noWhiteSumMove } from "./staging";

export function statusText(view: ViewMessage, s1Staged = false): string {
  const g = view.game;
  if (!g) return "";
  const active = g.turn?.activeSeat ?? -1;
  const you = view.you.seat;
  const activeName = active >= 0 ? seatName(view, active) : "";
  switch (g.phase) {
    case "AWAIT_ROLL":
      return active === you ? t("status.yourRoll") : t("status.waitingRoll", { name: activeName });
    case "ACTION_1": {
      const step = currentStep(view);
      if (step === 1 && !noWhiteSumMove(view)) {
        if (!isActive(view)) return t("step.passive", { sum: g.roll?.whiteSum ?? "" });
        return s1Staged ? t("step.two") : t("step.one", { sum: g.roll?.whiteSum ?? "" });
      }
      if (step === 2) return t("step.two");
      const waiting = g.players
        .filter((p) => !p.action1Submitted && p.seat !== you)
        .map((p) => seatName(view, p.seat));
      return waiting.length > 0
        ? t("status.waitingFor", { names: joinNames(waiting) })
        : t("status.revealing");
    }
    case "ACTION_2":
      return active === you ? t("step.two") : t("status.choosing", { name: activeName });
    case "GAME_OVER":
      return t("status.gameOver");
    default:
      return "";
  }
}

/** "Cleo rolled. White 3 and 5, sum 8. Red 2, Green 6, Blue 1." */
export function rollAnnouncement(view: ViewMessage): string {
  const g = view.game;
  if (!g?.roll || !g.turn) return "";
  const colored = COLORS.filter((c) => g.roll?.colored[c] !== undefined).map(
    (c) => `${colorName(c)} ${g.roll?.colored[c]}`,
  );
  const [w1, w2] = g.roll.white;
  return t("announce.roll", {
    name: seatName(view, g.turn.activeSeat),
    a: w1,
    b: w2,
    sum: g.roll.whiteSum,
    colored: colored.join(", "),
  });
}

/** "Dev marked Red 8. Ria passed." from the latest ACTION1_REVEALED event. */
export function revealAnnouncement(view: ViewMessage): string {
  const g = view.game;
  if (!g) return "";
  let rev: Extract<(typeof g.events)[number], { type: "ACTION1_REVEALED" }> | undefined;
  for (const e of g.events) if (e.type === "ACTION1_REVEALED") rev = e;
  if (!rev) return "";
  const sum = g.roll?.whiteSum;
  return rev.decisions
    .map((d) => {
      const name = seatName(view, seatOfPlayer(d.playerId, g));
      return d.decision.kind === "PASS"
        ? t("announce.passed", { name })
        : t("announce.marked", { name, color: colorName(d.decision.color), sum: sum ?? "" });
    })
    .join(" ");
}

/** End-of-game reason in plain words. */
export function endReasonText(view: ViewMessage): string {
  const r = view.game?.endReason;
  if (!r) return "";
  if (r.kind === "TWO_ROWS_LOCKED") return t("end.twoRows");
  const names = r.playerIds.map((id) => seatName(view, seatOfPlayer(id, view.game)));
  return t("end.penalty", { names: joinNames(names) });
}
