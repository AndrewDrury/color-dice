import { type PatchRoomReq, PatchRoomReqSchema, ROOM_NAME_MAX, ROOM_NAME_MIN } from "@cd/protocol";
import { useEffect, useRef, useState } from "preact/hooks";
import { patchRoom } from "../api";
import { t, useT } from "../i18n";
import { Button } from "./Button";
import { Field, FieldError, issuesByField, requestErrorText } from "./Field";
import { PasswordField } from "./PasswordField";

const fieldText = (): Record<string, string> => ({
  roomName: t("field.roomName", { min: ROOM_NAME_MIN, max: ROOM_NAME_MAX }),
  password: t("field.password"),
});

export interface RoomSettingsProps {
  code: string;
  token: string;
  roomName: string;
  listed: boolean;
}

/** Host-only, collapsible: rename, toggle "listed", change password → `PATCH`. */
export function RoomSettings({ code, token, roomName, listed }: RoomSettingsProps) {
  useT();
  const [name, setName] = useState(roomName);
  const [isListed, setListed] = useState(listed);
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // Follow server changes to the listed flag (e.g. another tab of the host).
  useEffect(() => setListed(listed), [listed]);

  const submit = async (e: Event) => {
    e.preventDefault();
    if (busy) return;
    setFormError(null);
    setSaved(false);
    const patch: PatchRoomReq = {};
    if (name.trim() !== roomName) patch.roomName = name;
    if (isListed !== listed) patch.listed = isListed;
    if (password !== "") patch.password = password;
    if (Object.keys(patch).length === 0) {
      setErrors({});
      setFormError(t("room.nothing"));
      return;
    }
    const parsed = PatchRoomReqSchema.safeParse(patch);
    if (!parsed.success) {
      setErrors(issuesByField(parsed.error.issues, fieldText()));
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      await patchRoom(code, token, parsed.data);
      if (!alive.current) return;
      setPassword("");
      setSaved(true);
    } catch (err) {
      if (alive.current) setFormError(requestErrorText(err));
    } finally {
      if (alive.current) setBusy(false);
    }
  };

  return (
    <details class="card">
      <summary style={{ minHeight: "var(--tap)", cursor: "pointer", fontWeight: "var(--fw-bold)" }}>
        {t("room.title")}
      </summary>
      <form class="stack" onSubmit={submit} noValidate style={{ marginTop: "var(--s3)" }}>
        <Field
          label={t("field.roomName.label")}
          name="roomName"
          value={name}
          onValue={setName}
          error={errors.roomName}
          maxLength={ROOM_NAME_MAX}
          autocomplete="off"
          enterkeyhint="next"
        />
        <label class="row" style={{ minHeight: "var(--tap)", cursor: "pointer" }}>
          <input
            type="checkbox"
            name="listed"
            checked={isListed}
            onChange={(e) => setListed(e.currentTarget.checked)}
            style={{ width: "22px", height: "22px" }}
          />
          <span>{t("room.listed")}</span>
        </label>
        <PasswordField
          label={t("room.newPassword")}
          value={password}
          onValue={setPassword}
          error={errors.password}
          hint={t("room.passwordHint")}
          autocomplete="new-password"
          enterkeyhint="done"
        />
        <FieldError text={formError} />
        {saved ? (
          <p role="status" class="muted">
            {t("room.saved")}
          </p>
        ) : null}
        <Button type="submit" busy={busy}>
          {t("room.save")}
        </Button>
      </form>
    </details>
  );
}
