import type { RematchOffer, ViewMessage } from "@cd/protocol";
import { useEffect, useRef } from "preact/hooks";
import { useModalTrap } from "../fx/modal";
import { t } from "../i18n";
import { Avatar } from "./Avatar";
import { Button } from "./Button";

export function RematchPopup({
  view,
  offer,
  send,
}: {
  view: ViewMessage;
  offer: RematchOffer;
  send: (msg: { type: "rematchAccept" | "rematchDecline" }) => boolean;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const requester = view.seats.find((s) => s.seatId === offer.fromSeatId);
  const mine = offer.fromSeatId === view.you.seatId;
  const waiting = view.seats
    .filter((s) => s.kind === "human" && s.left !== true)
    .filter((s) => s.seatId !== offer.fromSeatId && !offer.accepted.includes(s.seatId))
    .map((s) => s.name);
  useModalTrap(
    dialogRef,
    () =>
      document.querySelector<HTMLElement>(".rematch-popup-actions button, .rematch-popup button") ??
      document.querySelector<HTMLElement>(".g-over-actions .btn, .g-over-actions button"),
  );
  useEffect(() => {
    dialogRef.current?.focus();
  }, [offer.fromSeatId]);
  return (
    <div class="rematch-popup-backdrop" role="presentation">
      <div
        ref={dialogRef}
        class="rematch-popup"
        role="dialog"
        aria-modal="true"
        aria-label={t("over.rematch")}
        tabIndex={-1}
      >
        <Avatar profile={offer.fromProfile} size={72} class="rematch-avatar" />
        <h2>{t("over.rematch")}</h2>
        <p>
          {mine
            ? t("rematch.waiting", { names: waiting.join(", ") })
            : t("rematch.request", { name: requester?.name ?? offer.fromName })}
        </p>
        {mine ? (
          <Button variant="default" onClick={() => send({ type: "rematchDecline" })}>
            {t("common.cancel")}
          </Button>
        ) : (
          <div class="rematch-popup-actions">
            <Button variant="primary" onClick={() => send({ type: "rematchAccept" })}>
              {t("rematch.accept")}
            </Button>
            <Button onClick={() => send({ type: "rematchDecline" })}>{t("rematch.decline")}</Button>
          </div>
        )}
      </div>
    </div>
  );
}
