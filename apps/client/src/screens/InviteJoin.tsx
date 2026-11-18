import { JoinReqSchema, PLAYER_NAME_MAX } from "@cd/protocol";
import { useEffect, useRef, useState } from "preact/hooks";
import { ApiError, getMe, joinGame, reclaimSeat } from "../api";
import { Button } from "../components/Button";
import { Field, FieldError, issuesByField, requestErrorText } from "../components/Field";
import { errorText, t, useT } from "../i18n";
import { rememberedName, rememberSubmit } from "../remembered";
import { getPendingInvite, navigate } from "../router";
import { saveSession } from "../session";

/**
 * `#/join/<CODE>/<key>` lands here: only a name is needed (K2.1). The key stays in memory,
 * is sent as `invite` (never `password`) and is never stored.
 */
export function InviteJoin({ code }: { code: string }) {
  useT();
  const [name, setName] = useState(rememberedName);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const alive = useRef(true);
  const [key] = useState(() => getPendingInvite(code));

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // No key in memory (e.g. a reload after the fragment was stripped): fall back to the code dialog.
  useEffect(() => {
    if (key === null) navigate("join", code);
  }, [key, code]);
  if (key === null) return null;

  const submit = async (e: Event) => {
    e.preventDefault();
    if (busy) return;
    setFormError(null);
    const parsed = JoinReqSchema.safeParse({ name, invite: key });
    if (!parsed.success) {
      setErrors(
        issuesByField(parsed.error.issues, { name: t("field.name", { max: PLAYER_NAME_MAX }) }),
      );
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      let res: Awaited<ReturnType<typeof joinGame>>;
      let started = false;
      try {
        res = await joinGame(code, parsed.data);
      } catch (err) {
        // The game already began: a seat with this name may still be ours to take back.
        if (!(err instanceof ApiError && err.code === "E_NOT_IN_LOBBY")) throw err;
        started = true;
        try {
          res = await reclaimSeat(code, parsed.data);
        } catch (err2) {
          if (err2 instanceof ApiError && err2.code === "E_BAD_CREDENTIALS") throw err;
          throw err2;
        }
      }
      saveSession(res.code, {
        token: res.token,
        seatId: res.seatId,
        name: parsed.data.name,
        roomName: "",
      });
      rememberSubmit({ code: res.code, name: parsed.data.name });
      let screen: "waiting" | "game" = started ? "game" : "waiting";
      if (!started) {
        try {
          if ((await getMe(res.code, res.token)).status !== "lobby") screen = "game";
        } catch {
          // Best effort: the waiting room re-routes once the view arrives.
        }
      }
      navigate(screen, res.code);
    } catch (err) {
      if (!alive.current) return;
      setFormError(
        err instanceof ApiError && err.code === "E_BAD_CREDENTIALS"
          ? t("invite.invalid")
          : err instanceof ApiError
            ? requestErrorText(err)
            : errorText("E_NETWORK"),
      );
    } finally {
      if (alive.current) setBusy(false);
    }
  };

  return (
    <main class="stack" style={{ paddingBlock: "var(--s6)" }}>
      <div class="row" style={{ justifyContent: "space-between" }}>
        <h1 style={{ fontSize: "var(--fs-title)" }}>{t("invite.title")}</h1>
        <Button onClick={() => navigate("home")}>{t("common.back")}</Button>
      </div>
      <form class="card stack" onSubmit={submit} noValidate style={{ maxWidth: "560px" }}>
        <p class="muted">{t("invite.intro")}</p>
        <Field
          label={t("field.yourName")}
          name="name"
          value={name}
          onValue={setName}
          error={errors.name}
          maxLength={PLAYER_NAME_MAX}
          autocomplete="nickname"
          enterkeyhint="go"
          autofocus
        />
        <FieldError text={formError} />
        <Button type="submit" variant="primary" block busy={busy}>
          {t("common.join")}
        </Button>
      </form>
    </main>
  );
}
