import { PASSWORD_MAX } from "@cd/protocol";
import { useState } from "preact/hooks";
import { t, useT } from "../i18n";
import { Field } from "./Field";

export interface PasswordFieldProps {
  label?: string;
  value: string;
  onValue: (value: string) => void;
  error?: string | undefined;
  hint?: string;
  /** Defaults to "new-password" (browsers ignore "off" on password inputs): a room password is not a login. */
  autocomplete?: "off" | "new-password" | "current-password";
  enterkeyhint?: "go" | "next" | "done";
}

/** Password input with a Show/Hide toggle. The value is never trimmed or cleaned. */
export function PasswordField(props: PasswordFieldProps) {
  useT();
  const [shown, setShown] = useState(false);
  return (
    <Field
      label={props.label ?? t("field.password.label")}
      type={shown ? "text" : "password"}
      name="room-pass"
      value={props.value}
      onValue={props.onValue}
      error={props.error}
      {...(props.hint ? { hint: props.hint } : {})}
      maxLength={PASSWORD_MAX}
      autocomplete={props.autocomplete ?? "new-password"}
      autocapitalize="off"
      autocorrect="off"
      spellcheck={false}
      enterkeyhint={props.enterkeyhint ?? "go"}
      addon={
        <button
          type="button"
          class="btn"
          aria-pressed={shown ? "true" : "false"}
          aria-label={shown ? t("field.password.hide") : t("field.password.show")}
          onClick={() => setShown((s) => !s)}
        >
          {shown ? t("common.hide") : t("common.show")}
        </button>
      }
    />
  );
}
