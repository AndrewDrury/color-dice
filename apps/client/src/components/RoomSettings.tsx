import { type PatchRoomReq, PatchRoomReqSchema, ROOM_NAME_MAX } from "@cd/protocol";
import { useEffect, useRef, useState } from "preact/hooks";
import { patchRoom } from "../api";
import { Button } from "./Button";
import { Field, FieldError, issuesByField, requestErrorText } from "./Field";
import { PasswordField } from "./PasswordField";

const FIELD_TEXT: Record<string, string> = {
  roomName: `Room names are 3–${ROOM_NAME_MAX} characters.`,
  password: "Passwords are 4–64 characters.",
};

export interface RoomSettingsProps {
  code: string;
  token: string;
  roomName: string;
  listed: boolean;
}

/** Host-only, collapsible: rename, toggle "listed", change password → `PATCH`. */
export function RoomSettings({ code, token, roomName, listed }: RoomSettingsProps) {
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
      setFormError("Nothing to change.");
      return;
    }
    const parsed = PatchRoomReqSchema.safeParse(patch);
    if (!parsed.success) {
      setErrors(issuesByField(parsed.error.issues, FIELD_TEXT));
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
        Room settings
      </summary>
      <form class="stack" onSubmit={submit} noValidate style={{ marginTop: "var(--s3)" }}>
        <Field
          label="Room name"
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
          <span>Show in public list</span>
        </label>
        <PasswordField
          label="New password"
          value={password}
          onValue={setPassword}
          error={errors.password}
          hint="Leave empty to keep the current password."
          autocomplete="new-password"
          enterkeyhint="done"
        />
        <FieldError text={formError} />
        {saved ? (
          <p role="status" class="muted">
            Saved.
          </p>
        ) : null}
        <Button type="submit" busy={busy}>
          Save settings
        </Button>
      </form>
    </details>
  );
}
