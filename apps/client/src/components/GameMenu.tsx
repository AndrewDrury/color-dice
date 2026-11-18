import { useRef, useState } from "preact/hooks";
import { ApiError, leaveGame } from "../api";
import { t, useT } from "../i18n";
import { forgetRoom, markLeaving } from "../roomEnd";
import { navigate } from "../router";
import { getSession } from "../session";
import { clearView, showToast } from "../store";
import { Button } from "./Button";
import { InviteButton } from "./CopyButton";
import { Dialog } from "./Dialog";
import { FieldError, requestErrorText } from "./Field";

export interface GameMenuProps {
  code: string;
  onClose: () => void;
}

/** In-game menu: invite link, back to Home (seat kept), and Leave game (confirmed, K2.2). */
export function GameMenu({ code, onClose }: GameMenuProps) {
  useT();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busyRef = useRef(false);
  const token = getSession(code)?.token ?? "";

  const home = () => {
    clearView();
    navigate("home");
  };

  const leave = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    markLeaving(code, true);
    try {
      await leaveGame(code, token);
    } catch (err) {
      // 401/404: the seat or the room is already gone, which is what leaving wants anyway.
      if (!(err instanceof ApiError && (err.status === 401 || err.status === 404))) {
        markLeaving(code, false);
        busyRef.current = false;
        setBusy(false);
        setError(requestErrorText(err));
        return;
      }
    }
    forgetRoom(code);
    home();
    showToast(t("toast.left"));
  };

  if (confirming) {
    return (
      <Dialog title={t("game.leaveGameTitle")} onClose={() => !busy && setConfirming(false)}>
        <p>{t("game.leaveGameBody")}</p>
        <FieldError text={error} />
        <div class="row" style={{ justifyContent: "flex-end" }}>
          <Button onClick={() => setConfirming(false)}>{t("waiting.stay")}</Button>
          <Button variant="primary" busy={busy} onClick={leave}>
            {t("waiting.leaveGame")}
          </Button>
        </div>
      </Dialog>
    );
  }
  return (
    <Dialog title={t("game.menuTitle")} onClose={onClose}>
      <InviteButton code={code} token={token} />
      <Button block onClick={home}>
        {t("game.backHome")}
      </Button>
      <Button block onClick={() => setConfirming(true)}>
        {t("waiting.leaveGame")}
      </Button>
      <p class="muted" style={{ fontSize: "var(--fs-small)" }}>
        {t("game.menuNote")}
      </p>
    </Dialog>
  );
}
