import {
  CreateGameReqSchema,
  MAX_PLAYERS,
  MIN_PLAYERS,
  PLAYER_NAME_MAX,
  ROOM_NAME_MAX,
  ROOM_NAME_MIN,
} from "@cd/protocol";
import { useEffect, useRef, useState } from "preact/hooks";
import { createGame } from "../api";
import { Button } from "../components/Button";
import { Field, FieldError, issuesByField, requestErrorText } from "../components/Field";
import { PasswordField } from "../components/PasswordField";
import { t, useT } from "../i18n";
import { primeInvite } from "../invite";
import { getRemembered, rememberedName, rememberSubmit } from "../remembered";
import { navigate } from "../router";
import { saveSession } from "../session";

const fieldText = (): Record<string, string> => ({
  roomName: t("field.roomName", { min: ROOM_NAME_MIN, max: ROOM_NAME_MAX }),
  name: t("field.name", { max: PLAYER_NAME_MAX }),
  password: t("field.password"),
  maxPlayers: t("field.maxPlayers"),
});

const SIZES = Array.from({ length: MAX_PLAYERS - MIN_PLAYERS + 1 }, (_, i) => MIN_PLAYERS + i);

const segStyle = (on: boolean) => ({
  flex: "1 1 0",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: "var(--tap)",
  borderRadius: "var(--r-box)",
  fontWeight: "var(--fw-bold)",
  cursor: "pointer",
  background: on ? "var(--accent)" : "transparent",
  color: on ? "var(--on-accent)" : "var(--ink)",
});

export function CreateGame() {
  useT();
  const [initial] = useState(getRemembered);
  const [roomName, setRoomName] = useState(initial.roomName);
  const [name, setName] = useState(rememberedName);
  const [password, setPassword] = useState(initial.password);
  const [maxPlayers, setMaxPlayers] = useState(initial.maxPlayers);
  const [listed, setListed] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const submit = async (e: Event) => {
    e.preventDefault();
    if (busy) return;
    setFormError(null);
    const parsed = CreateGameReqSchema.safeParse({ roomName, name, password, maxPlayers, listed });
    if (!parsed.success) {
      setErrors(issuesByField(parsed.error.issues, fieldText()));
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      const res = await createGame(parsed.data);
      saveSession(res.code, {
        token: res.token,
        seatId: res.seatId,
        name: parsed.data.name,
        roomName: parsed.data.roomName,
      });
      rememberSubmit({
        code: res.code,
        name: parsed.data.name,
        roomName: parsed.data.roomName,
        password: parsed.data.password,
        maxPlayers: parsed.data.maxPlayers,
      });
      primeInvite(res.code, res.inviteKey);
      // navigate() writes ?game=CODE with history.replaceState.
      navigate("waiting", res.code);
    } catch (err) {
      if (alive.current) setFormError(requestErrorText(err));
    } finally {
      if (alive.current) setBusy(false);
    }
  };

  return (
    <main class="stack" style={{ paddingBlock: "var(--s6)" }}>
      <div class="row" style={{ justifyContent: "space-between" }}>
        <h1 style={{ fontSize: "var(--fs-title)" }}>{t("create.title")}</h1>
        <Button onClick={() => navigate("home")}>{t("common.back")}</Button>
      </div>
      <form class="card stack" onSubmit={submit} noValidate style={{ maxWidth: "560px" }}>
        <Field
          label={t("field.roomName.label")}
          name="roomName"
          value={roomName}
          onValue={setRoomName}
          error={errors.roomName}
          maxLength={ROOM_NAME_MAX}
          autocomplete="off"
          enterkeyhint="next"
          autofocus
        />
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
          hint={t("create.passwordHint")}
          autocomplete="off"
          enterkeyhint="next"
        />
        <fieldset class="stack" style={{ border: 0, padding: 0, margin: 0, gap: "var(--s1)" }}>
          <legend style={{ fontWeight: "var(--fw-bold)", padding: 0 }}>
            {t("create.maxPlayers")}
          </legend>
          <div
            class="row"
            style={{
              gap: "var(--s1)",
              padding: "var(--s1)",
              borderRadius: "var(--r-button)",
              background: "var(--table)",
            }}
          >
            {SIZES.map((n) => (
              <label key={n} style={segStyle(n === maxPlayers)}>
                <input
                  type="radio"
                  name="maxPlayers"
                  class="sr-only"
                  value={String(n)}
                  checked={n === maxPlayers}
                  onChange={() => setMaxPlayers(n)}
                />
                <span class="num">{n}</span>
              </label>
            ))}
          </div>
          <FieldError text={errors.maxPlayers} />
        </fieldset>
        <label class="row" style={{ minHeight: "var(--tap)", cursor: "pointer" }}>
          <input
            type="checkbox"
            name="listed"
            checked={listed}
            onChange={(e) => setListed(e.currentTarget.checked)}
            style={{ width: "22px", height: "22px" }}
          />
          <span>{t("create.listed")}</span>
        </label>
        <FieldError text={formError} />
        <Button type="submit" variant="primary" block busy={busy}>
          {t("create.title")}
        </Button>
      </form>
    </main>
  );
}
