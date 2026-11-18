import { AWAY_AFTER_OFFLINE_MS, type ClientMessage, type ViewMessage } from "@cd/protocol";
import { useEffect, useState } from "preact/hooks";
import { t, useT } from "../i18n";
import { Button } from "./Button";
import { ConfirmDialog } from "./ConfirmDialog";

/** Host: "Mark as away" for opponents offline 2+ min. Everyone: "away" badges; "I'm back" for you. */
export function AwayControls(props: {
  view: ViewMessage;
  offlineSince: Record<string, number>;
  send: (m: ClientMessage) => boolean;
}) {
  const { view, offlineSince, send } = props;
  useT();
  const [now, setNow] = useState(Date.now());
  const [confirming, setConfirming] = useState<string | null>(null);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const me = view.seats.find((s) => s.seatId === view.you.seatId);
  const awayOnes = view.seats.filter((s) => s.away && s.seatId !== view.you.seatId);
  const markable = view.you.host
    ? view.seats.filter(
        (s) =>
          s.seatId !== view.you.seatId &&
          !s.away &&
          !s.online &&
          now - (offlineSince[s.seatId] ?? now) >= AWAY_AFTER_OFFLINE_MS,
      )
    : [];
  const target = view.seats.find((s) => s.seatId === confirming);
  if (!me?.away && awayOnes.length === 0 && markable.length === 0) return null;

  const setAway = (seatId: string, away: boolean) => send({ type: "setAway", seatId, away });

  return (
    <section
      class="row"
      aria-label={t("away.title")}
      style={{ flexWrap: "wrap", gap: "var(--s2)" }}
    >
      {me?.away ? (
        <Button variant="primary" onClick={() => setAway(view.you.seatId, false)}>
          {t("away.back")}
        </Button>
      ) : null}
      {awayOnes.map((s) => (
        <span key={s.seatId} class="muted">
          {s.name}{" "}
          <span
            style={{
              padding: "0 var(--s2)",
              borderRadius: "var(--r-pill)",
              background: "var(--ink-muted)",
              color: "var(--paper)",
              fontSize: "var(--fs-small)",
            }}
          >
            {t("away.badge")}
          </span>
          {view.you.host ? (
            <Button onClick={() => setAway(s.seatId, false)}>{t("away.bringBack")}</Button>
          ) : null}
        </span>
      ))}
      {markable.map((s) => (
        <span key={s.seatId} class="muted">
          {t("away.offline", { name: s.name })}{" "}
          <Button onClick={() => setConfirming(s.seatId)}>{t("away.mark")}</Button>
        </span>
      ))}
      {target ? (
        <ConfirmDialog
          title={t("away.mark")}
          body={t("away.body", { name: target.name })}
          confirmLabel={t("away.mark")}
          onCancel={() => setConfirming(null)}
          onConfirm={() => {
            setAway(target.seatId, true);
            setConfirming(null);
          }}
        />
      ) : null}
    </section>
  );
}
