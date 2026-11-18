import { JoinReqSchema, PLAYER_NAME_MAX, type PublicGame } from "@cd/protocol";
import { useEffect, useRef, useState } from "preact/hooks";
import { ApiError, joinGame } from "../api";
import { Button } from "../components/Button";
import { Dialog } from "../components/Dialog";
import {
  Field,
  FieldError,
  issuesByField,
  RememberToggle,
  requestErrorText,
} from "../components/Field";
import { PasswordField } from "../components/PasswordField";
import { getRoomPassword, rememberedName, rememberSubmit } from "../remembered";
import { navigate } from "../router";
import { saveSession } from "../session";

/** After a wrong password the Join button stays disabled this long. */
export const WRONG_PASSWORD_LOCK_MS = 2000;

export const GONE_TEXT = "This game has started or is full.";

const FIELD_TEXT: Record<string, string> = {
  name: `Enter a name (1–${PLAYER_NAME_MAX} characters).`,
  password: "Passwords are 4–64 characters.",
};

export interface JoinDialogProps {
  code: string;
  /** Live public list (null while connecting); used for the room name and the gone notice. */
  games: PublicGame[] | null;
  onClose: () => void;
}

export function JoinDialog({ code, games, onClose }: JoinDialogProps) {
  const [name, setName] = useState(rememberedName);
  // Only for a room this device already holds a seat in; never for an unknown room.
  const [password, setPassword] = useState(() => getRoomPassword(code));
  const [remember, setRemember] = useState(true);
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
      setErrors(issuesByField(parsed.error.issues, FIELD_TEXT));
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
      rememberSubmit(
        {
          code: res.code,
          name: parsed.data.name,
          ...(roomName ? { roomName } : {}),
          password: parsed.data.password,
        },
        remember,
      );
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
    <Dialog title={roomName ? `Join ${roomName}` : "Join game"} onClose={onClose}>
      <p class="muted">
        Game code <span class="num">{code}</span>
      </p>
      {gone ? (
        <p role="status" style={{ fontWeight: "var(--fw-bold)" }}>
          {GONE_TEXT}
        </p>
      ) : null}
      <form class="stack" onSubmit={submit} noValidate>
        <Field
          label="Your name"
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
        <RememberToggle checked={remember} onChange={setRemember} />
        <FieldError text={formError} />
        <Button type="submit" variant="primary" block busy={busy} disabled={locked || gone}>
          Join
        </Button>
      </form>
      <Button variant="link" onClick={() => navigate("reclaim", code)}>
        Reclaim my seat
      </Button>
    </Dialog>
  );
}
