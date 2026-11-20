import type { ViewMessage } from "@cd/protocol";
import { useEffect, useMemo } from "preact/hooks";
import { reducedMotion } from "./fx/motion";
import { tieInfo } from "./game/model";
import { t } from "./i18n";
import type { Route } from "./router";

const APP = "Color Dice";
const ALERT_DOT = "●";
const FLASH_MS = 1000;

// i18n-ok: punctuation-only formatting around an already-localized name.
const cap = (name: string) => (name.length > 16 ? `${name.slice(0, 15)}…` : name);
const myTurnNow = (v: ViewMessage): boolean => {
  const g = v.game;
  if (!g || (v.pausedSeatIds ?? []).length > 0) return false;
  if (v.you.canRoll) return true;
  if (g.phase === "ACTION_1")
    return v.you.legalAction1.length > 0 && v.you.action1Decision === null;
  return (
    g.phase === "ACTION_2" && g.turn?.activeSeat === v.you.seat && v.you.legalAction2.length > 0
  );
};
// i18n-ok: punctuation-only app-title suffix.
const title = (txt: string) => `${txt} — ${APP}`;

function rollOffTitle(v: ViewMessage): string {
  const ro = v.rollOff;
  if (!ro) return title(t("title.rollFirst"));
  if (ro.faces.some((f) => f === null)) return title(t("title.rollFirst"));
  const max = Math.max(...ro.faces.map((f) => f ?? 0));
  const winners = ro.faces.flatMap((f, i) => (f === max ? [i] : []));
  if (winners.length !== 1) return title(t("title.rollFirst"));
  const seat = winners[0];
  if (seat === undefined) return title(t("title.rollFirst"));
  const winner = v.seats[seat]?.name ?? t("player.fallback", { n: seat + 1 });
  return title(t("title.rollWinner", { name: cap(winner) }));
}

function gameTitle(v: ViewMessage): string {
  if (v.rollOff && !v.game) return rollOffTitle(v);
  const g = v.game;
  if (!g) return APP;
  if ((v.pausedSeatIds ?? []).length > 0) return title(t("title.paused"));
  if (g.phase === "GAME_OVER") {
    const { tie, winnerSeats } = tieInfo(v);
    if (tie) return title(t("title.tie"));
    if (v.you.seat !== null && winnerSeats.includes(v.you.seat)) return title(t("title.youWon"));
    const winnerSeat = winnerSeats[0];
    const winner = winnerSeat === undefined ? "" : (v.seats[winnerSeat]?.name ?? "");
    return title(t("title.won", { name: cap(winner) }));
  }
  if (myTurnNow(v)) {
    if (v.you.canRoll) return title(t("title.yourTurn"));
    if (g.phase === "ACTION_1" && v.you.action1Decision !== null)
      return title(t("title.waitingOthers"));
    return title(t("title.yourMove"));
  }
  const active = g.turn?.activeSeat;
  const nm = active === undefined ? "" : (v.seats[active]?.name ?? "");
  return title(t("title.turnOf", { name: cap(nm) }));
}

function waitingTitle(v: ViewMessage | null): string {
  if (!v) return APP;
  return title(t("title.waiting", { players: v.seats.length, max: v.room.maxPlayers }));
}

export function useDocumentTitle(route: Route, view: ViewMessage | null) {
  const base = useMemo(() => {
    if (route.screen === "game" && view) return gameTitle(view);
    if (route.screen === "waiting") return waitingTitle(view);
    return APP;
  }, [route.screen, route.code, view?.version]);

  const flash = route.screen === "game" && view ? myTurnNow(view) : false;
  useEffect(() => {
    let iv: ReturnType<typeof setInterval> | undefined;
    let on = false;
    const apply = () => {
      if (document.hidden && flash) {
        // i18n-ok: punctuation-only alert prefix.
        const alert = title(`${ALERT_DOT} ${t("title.yourTurnAlert")}`);
        if (reducedMotion()) {
          document.title = alert;
          return;
        }
        iv = setInterval(() => {
          on = !on;
          document.title = on ? alert : base;
        }, FLASH_MS);
        document.title = alert;
        return;
      }
      document.title = base;
    };
    const stop = () => {
      if (iv !== undefined) clearInterval(iv);
      iv = undefined;
    };
    const onVis = () => {
      stop();
      apply();
    };
    stop();
    apply();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVis);
      document.title = APP;
    };
  }, [base, flash]);
}
