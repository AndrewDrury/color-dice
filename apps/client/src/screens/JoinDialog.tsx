import { JoinReqSchema, PLAYER_NAME_MAX, type PublicGame } from "@cd/protocol";
import { useEffect, useRef, useState } from "preact/hooks";
import { ApiError, joinGame } from "../api";
import { Button } from "../components/Button";
import { Dialog } from "../components/Dialog";
import { Field, FieldError, issuesByField, requestErrorText } from "../components/Field";
import { PasswordField } from "../components/PasswordField";
import { t, useT } from "../i18n";
import { getRoomPassword, rememberedName, rememberSubmit } from "../remembered";
import { navigate } from "../router";
import { saveSession } from "../session";

/** After a wrong password the Join button stays disabled this long. */
export const WRONG_PASSWORD_LOCK_MS = 2000;

const fieldText = (): Record<string, string> => ({
  name: t("field.name", { max: PLAYER_NAME_MAX }),
  password: t("field.password"),
});

export interface JoinDialogProps {
  code: string;
  /** Live public list (null while connecting); used for the room name and the gone notice. */
  games: PublicGame[] | null;
  onClose: () => void;
}

export function JoinDialog({ code, games, onClose }: JoinDialogProps) {
  useT();
  const [name, setName] = useState(rememberedName);
  // Only for a room this device already holds a seat in; never for an unknown room.
  const [password, setPassword] = useState(() => getRoomPassword(code));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [locked, setLocked] = useState(false);
  const [roomName, setRoomName] = useState<string | null>(null);
  const [gone, setGone] = useState(false);
  const seen = useRef(false);
  const lockTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (lockTimer.current !== null) clearTimeout(lockTimer.current);
    };
  }, []);

  useEffect(() => {
    if (games === null) return;
    const g = games.find((x) => x.code === code);
    if (g) {
      seen.current = true;
      setRoomName(g.roomName);
      setGone(false);
    } else if (seen.current) {
      setGone(true);
    }
  }, [games, code]);

  const lockFor = (ms: number) => {
    setLocked(true);
    if (lockTimer.current !== null) clearTimeout(lockTimer.current);
    lockTimer.current = setTimeout(() => {
      lockTimer.current = null;
      setLocked(false);
    }, ms);
  };

  const submit = async (e: Event) => {
    e.preventDefault();
    if (busy || locked) return;
    setFormError(null);
    const parsed = JoinReqSchema.safeParse({ name, password });
    if (!parsed.success) {
      setErrors(issuesByField(parsed.error.issues, fieldText()));
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      const res = await joinGame(code, parsed.data);
      saveSession(res.code, {
        token: res.token,
        seatId: res.seatId,
        name: parsed.data.name,
        roomName: roomName ?? "",
      });
      rememberSubmit({
        code: res.code,
        name: parsed.data.name,
        ...(roomName ? { roomName } : {}),
        password: parsed.data.password ?? password,
      });
      navigate("waiting", res.code);
    } catch (err) {
      if (!alive.current) return;
      setFormError(requestErrorText(err));
      if (err instanceof ApiError && err.status === 401) lockFor(WRONG_PASSWORD_LOCK_MS);
    } finally {
      if (alive.current) setBusy(false);
    }
  };

  return (
    <Dialog
      title={roomName ? t("join.titleNamed", { room: roomName }) : t("join.title")}
      onClose={onClose}
    >
      {gone ? (
        <p role="status" style={{ fontWeight: "var(--fw-bold)" }}>
          {t("join.gone")}
        </p>
      ) : null}
      <form class="stack" onSubmit={submit} noValidate>
        <Field
          label={t("field.yourName")}
          name="name"
          value={name}
          onValue={setName}
          error={errors.name}
          maxLength={PLAYER_NAME_MAX}
          autocomplete="nickname"
          enterkeyhint="next"
        />
        <PasswordField
          value={password}
          onValue={setPassword}
          error={errors.password}
          autocomplete="off"
        />
        <FieldError text={formError} />
        <Button type="submit" variant="primary" block busy={busy} disabled={locked || gone}>
          {t("common.join")}
        </Button>
      </form>
      <Button variant="link" onClick={() => navigate("reclaim", code)}>
        {t("join.reclaimLink")}
      </Button>
    </Dialog>
  );
}
