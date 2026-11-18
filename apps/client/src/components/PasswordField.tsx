import { PASSWORD_MAX } from "@cd/protocol";
import { useState } from "preact/hooks";
import { Field } from "./Field";

export interface PasswordFieldProps {
  label?: string;
  value: string;
  onValue: (value: string) => void;
  error?: string | undefined;
  hint?: string;
  /** "new-password" when creating a room, "current-password" when joining. */
  autocomplete?: "new-password" | "current-password";
  enterkeyhint?: "go" | "next" | "done";
}

/** Password input with a Show/Hide toggle. The value is never trimmed or cleaned. */
export function PasswordField(props: PasswordFieldProps) {
  const [shown, setShown] = useState(false);
  return (
    <Field
      label={props.label ?? "Password"}
      type={shown ? "text" : "password"}
      value={props.value}
      onValue={props.onValue}
      error={props.error}
      {...(props.hint ? { hint: props.hint } : {})}
      maxLength={PASSWORD_MAX}
      autocomplete={props.autocomplete ?? "current-password"}
      autocapitalize="off"
      autocorrect="off"
      spellcheck={false}
      enterkeyhint={props.enterkeyhint ?? "go"}
      addon={
        <button
          type="button"
          class="btn"
          aria-pressed={shown ? "true" : "false"}
          aria-label={shown ? "Hide password" : "Show password"}
          onClick={() => setShown((s) => !s)}
        >
          {shown ? "Hide" : "Show"}
        </button>
      }
    />
  );
}
