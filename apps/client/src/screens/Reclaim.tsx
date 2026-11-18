import {
  CODE_ALPHABET,
  CODE_LENGTH,
  GameCodeSchema,
  PLAYER_NAME_MAX,
  ReclaimReqSchema,
} from "@cd/protocol";
import { useEffect, useRef, useState } from "preact/hooks";
import { getMe, reclaimSeat } from "../api";
import { Button } from "../components/Button";
import { Field, FieldError, issuesByField, requestErrorText } from "../components/Field";
import { PasswordField } from "../components/PasswordField";
import { t, useT } from "../i18n";
import { getRoomPassword, rememberedName, rememberSubmit } from "../remembered";
import { navigate } from "../router";
import { getSession, saveSession } from "../session";

const fieldText = (): Record<string, string> => ({
  code: t("field.gameCode"),
  name: t("field.nameReclaim"),
  password: t("field.password"),
});

/** Upper-case and keep only game-code characters (max 5). */
export function cleanCode(raw: string): string {
  let out = "";
  for (const ch of raw.toUpperCase()) {
    if (CODE_ALPHABET.includes(ch)) out += ch;
    if (out.length === CODE_LENGTH) break;
  }
  return out;
}

export interface ReclaimProps {
  code: string | null;
}

/** Take back an offline seat (new device, cleared storage) with code + name + password. */
export function Reclaim({ code: initialCode }: ReclaimProps) {
  useT();
  const [code, setCode] = useState(initialCode ?? "");
  const [name, setName] = useState(rememberedName);
  const [password, setPassword] = useState(() => (initialCode ? getRoomPassword(initialCode) : ""));
  const passwordTouched = useRef(false);
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
    const errs: Record<string, string> = {};
    if (!GameCodeSchema.safeParse(code).success) errs.code = fieldText().code ?? "";
    const parsed = ReclaimReqSchema.safeParse({ name, password });
    if (!parsed.success) Object.assign(errs, issuesByField(parsed.error.issues, fieldText()));
    setErrors(errs);
    if (!parsed.success || errs.code) return;
    setBusy(true);
    try {
      const res = await reclaimSeat(code, parsed.data);
      const roomName = getSession(res.code)?.roomName ?? "";
      saveSession(res.code, {
        token: res.token,
        seatId: res.seatId,
        name: parsed.data.name,
        roomName,
      });
      rememberSubmit({
        code: res.code,
        name: parsed.data.name,
        ...(roomName ? { roomName } : {}),
        password: parsed.data.password ?? password,
      });
      let screen: "waiting" | "game" = "waiting";
      try {
        const me = await getMe(res.code, res.token);
        if (me.status !== "lobby") screen = "game";
      } catch {
        // Best effort: the waiting room re-routes once the view arrives.
      }
      navigate(screen, res.code);
    } catch (err) {
      if (alive.current) setFormError(requestErrorText(err));
    } finally {
      if (alive.current) setBusy(false);
    }
  };

  return (
    <main class="stack" style={{ paddingBlock: "var(--s6)" }}>
      <div class="row" style={{ justifyContent: "space-between" }}>
        <h1 style={{ fontSize: "var(--fs-title)" }}>{t("reclaim.title")}</h1>
        <Button onClick={() => navigate("home")}>{t("common.back")}</Button>
      </div>
      <form class="card stack" onSubmit={submit} noValidate style={{ maxWidth: "560px" }}>
        <p class="muted">{t("reclaim.intro")}</p>
        <Field
          label={t("field.gameCode.label")}
          name="code"
          value={code}
          onValue={(v) => {
            setCode(v);
            if (!passwordTouched.current && GameCodeSchema.safeParse(v).success) {
              setPassword(getRoomPassword(v));
            }
          }}
          filter={cleanCode}
          error={errors.code}
          maxLength={CODE_LENGTH}
          autocomplete="off"
          autocapitalize="characters"
          autocorrect="off"
          spellcheck={false}
          inputmode="text"
          enterkeyhint="next"
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
          autofocus
        />
        <PasswordField
          value={password}
          onValue={(v) => {
            passwordTouched.current = true;
            setPassword(v);
          }}
          error={errors.password}
        />
        <FieldError text={formError} />
        <Button type="submit" variant="primary" block busy={busy}>
          {t("reclaim.submit")}
        </Button>
      </form>
    </main>
  );
}
