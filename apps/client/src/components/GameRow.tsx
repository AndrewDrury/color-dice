import type { PublicGame } from "@cd/protocol";
import { useLayoutEffect, useRef } from "preact/hooks";
import { t, useT } from "../i18n";
import { LockIcon } from "./icons";

export const ROW_ANIM_MS = 220;

/** "just now" · "3 min ago" · "2 h ago" · "4 d ago". */
export function relativeTime(then: number, now: number): string {
  const s = Math.max(0, Math.floor((now - then) / 1000));
  if (s < 60) return t("time.now");
  const m = Math.floor(s / 60);
  if (m < 60) return t("time.min", { n: m });
  const h = Math.floor(m / 60);
  if (h < 24) return t("time.hour", { n: h });
  return t("time.day", { n: Math.floor(h / 24) });
}

function reducedMotion(): boolean {
  try {
    return globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  } catch {
    return false;
  }
}

/** Slide/fade a row in or out with the Web Animations API (skipped when unsupported). */
function animateRow(el: HTMLElement | null, dir: "in" | "out"): void {
  if (!el || typeof el.animate !== "function" || reducedMotion()) return;
  const hidden = { opacity: 0, transform: "translateY(-6px)" };
  const shown = { opacity: 1, transform: "none" };
  el.animate(dir === "in" ? [hidden, shown] : [shown, hidden], {
    duration: ROW_ANIM_MS,
    easing: "cubic-bezier(0.2, 0.8, 0.2, 1)",
    fill: "forwards",
  });
}

export interface GameRowProps {
  game: PublicGame;
  now: number;
  /** The game left the live list; the row is fading out and can't be used. */
  leaving?: boolean;
  onJoin: (game: PublicGame) => void;
}

/** One open game. Room and host names are user-supplied: rendered as text nodes only. */
export function GameRow({ game, now, leaving = false, onJoin }: GameRowProps) {
  useT();
  const ref = useRef<HTMLLIElement>(null);

  useLayoutEffect(() => {
    animateRow(ref.current, "in");
  }, []);

  useLayoutEffect(() => {
    if (leaving) animateRow(ref.current, "out");
  }, [leaving]);

  return (
    <li
      ref={ref}
      aria-hidden={leaving ? "true" : undefined}
      class="row"
      style={{
        padding: "var(--s2) 0",
        borderBottom: "1px solid color-mix(in srgb, var(--ink) 10%, transparent)",
        flexWrap: "wrap",
      }}
    >
      <span aria-label={t("home.passwordProtected")} role="img">
        <LockIcon size={16} />
      </span>
      <span class="stack" style={{ gap: 0, flex: "1 1 10rem", minWidth: 0 }}>
        <strong style={{ overflowWrap: "anywhere" }}>{game.roomName}</strong>
        <span class="muted" style={{ fontSize: "var(--fs-small)", overflowWrap: "anywhere" }}>
          {t("home.host", { name: game.hostName })}
        </span>
      </span>
      <span class="num">
        {game.players} / {game.maxPlayers}
        <span class="sr-only"> {t("home.playersSr")}</span>
      </span>
      <time
        class="muted"
        dateTime={new Date(game.createdAt).toISOString()}
        style={{ fontSize: "var(--fs-small)", minWidth: "5.5em", textAlign: "right" }}
      >
        {relativeTime(game.createdAt, now)}
      </time>
      <button
        type="button"
        class="btn"
        disabled={leaving}
        tabIndex={leaving ? -1 : undefined}
        aria-label={t("home.joinAria", { room: game.roomName })}
        onClick={() => onJoin(game)}
      >
        {t("common.join")}
      </button>
    </li>
  );
}
