import type { ComponentChildren } from "preact";
import { useId } from "preact/hooks";
import { ApiError } from "../api";
import { errorText } from "../i18n";

export interface FieldProps {
  label: string;
  value: string;
  onValue: (value: string) => void;
  error?: string | undefined;
  hint?: string;
  type?: "text" | "password";
  name?: string;
  maxLength?: number;
  autocomplete?: string;
  autocapitalize?: "off" | "none" | "on" | "sentences" | "words" | "characters";
  autocorrect?: "on" | "off";
  spellcheck?: boolean;
  enterkeyhint?: "enter" | "done" | "go" | "next" | "previous" | "search" | "send";
  inputmode?: "text" | "none" | "numeric";
  autofocus?: boolean;
  disabled?: boolean;
  /** Rewrites typed text (e.g. upper-case + alphabet filter); the DOM is kept in sync. */
  filter?: (raw: string) => string;
  /** Extra content placed next to the input (e.g. the show/hide button). */
  addon?: ComponentChildren;
}

const inputStyle = {
  flex: "1 1 auto",
  minWidth: 0,
  minHeight: "var(--tap)",
  padding: "0 var(--s3)",
  borderRadius: "var(--r-box)",
  borderWidth: "2px",
  borderStyle: "solid",
  background: "var(--paper)",
};

/** Labelled text input with its error shown inline underneath (never an alert). */
export function Field(props: FieldProps) {
  const id = useId();
  const errId = `${id}-err`;
  const hintId = `${id}-hint`;
  const describedBy =
    [props.error ? errId : "", props.hint ? hintId : ""].filter(Boolean).join(" ") || undefined;
  return (
    <div class="stack" style={{ gap: "var(--s1)" }}>
      <label for={id} style={{ fontWeight: "var(--fw-bold)" }}>
        {props.label}
      </label>
      <div class="row">
        <input
          id={id}
          // Cast: Preact's input typings split "text" and "password" into separate unions.
          type={(props.type ?? "text") as "text"}
          name={props.name}
          value={props.value}
          maxLength={props.maxLength}
          autocomplete={props.autocomplete}
          autocapitalize={props.autocapitalize}
          autocorrect={props.autocorrect}
          spellcheck={props.spellcheck}
          enterkeyhint={props.enterkeyhint}
          inputMode={props.inputmode}
          autofocus={props.autofocus}
          disabled={props.disabled}
          aria-invalid={props.error ? "true" : undefined}
          aria-describedby={describedBy}
          onInput={(e) => {
            const el = e.currentTarget;
            const v = props.filter ? props.filter(el.value) : el.value;
            if (v !== el.value) el.value = v;
            props.onValue(v);
          }}
          style={{
            ...inputStyle,
            borderColor: props.error ? "var(--danger)" : "var(--ink-muted)",
          }}
        />
        {props.addon}
      </div>
      {props.hint ? (
        <p id={hintId} class="muted" style={{ fontSize: "var(--fs-small)" }}>
          {props.hint}
        </p>
      ) : null}
      <FieldError id={errId} text={props.error} />
    </div>
  );
}

/** Inline error line (field or form level). Renders nothing without text. */
export function FieldError({ id, text }: { id?: string; text?: string | undefined | null }) {
  if (!text) return null;
  return (
    <p id={id} role="alert" style={{ color: "var(--danger)", fontSize: "var(--fs-small)" }}>
      {text}
    </p>
  );
}

/** Friendly text for a failed create/join/reclaim request. */
export function requestErrorText(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 429 || err.code === "E_RATE_LIMITED") {
      return err.retryAfter !== undefined
        ? `Too many attempts, try again in ${Math.max(1, Math.ceil(err.retryAfter))} s.`
        : errorText("E_RATE_LIMITED");
    }
    if (err.code === "E_BAD_CREDENTIALS") return "Wrong password.";
    return errorText(err.code, err.reason);
  }
  return errorText("E_NETWORK");
}

/** Map zod issues (first path segment) to one message per field. */
export function issuesByField(
  issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey>; message: string }>,
  messages: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of issues) {
    const key = String(issue.path[0] ?? "");
    if (!(key in out)) out[key] = messages[key] ?? issue.message;
  }
  return out;
}

/** "Remember on this device" checkbox shared by Create, Join and Reclaim (default ON). */
export function RememberToggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label class="row" style={{ minHeight: "var(--tap)", cursor: "pointer" }}>
      <input
        type="checkbox"
        name="remember"
        checked={checked}
        onChange={(e) => onChange(e.currentTarget.checked)}
        style={{ width: "22px", height: "22px" }}
      />
      <span>Remember on this device</span>
    </label>
  );
}
