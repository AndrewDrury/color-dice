/** One number box of your sheet (H2 styles; a real `<button>` for H13). */
import type { BoxStatus, Color } from "@cd/engine";
import { cssColor } from "../game/model";
import { colorName, t } from "../i18n";
import { LockIcon } from "./icons";

export interface BoxProps {
  color: Color;
  number: number;
  status: BoxStatus;
  legal: boolean;
  staged: boolean;
  /** Optimistic ✕ after you confirmed (50 % until the next view). */
  ghost: boolean;
  /** Newly marked: pop / flash. */
  flash?: boolean;
  /** Inputs locked (after send, or the dice have not landed). */
  disabled: boolean;
  /** Shake after a server error. */
  shake?: boolean;
  onPick: () => void;
}

export function Cross() {
  return (
    <svg class="g-x" viewBox="0 0 20 20" aria-hidden="true">
      <path d="M4 4 L16 16 M16 4 L4 16" pathLength={1} />
    </svg>
  );
}

export function boxLabel(color: Color, number: number, status: BoxStatus, legal: boolean): string {
  const v = { color: colorName(color), n: number };
  switch (status) {
    case "MARKED":
      return t("box.marked", v);
    case "SKIPPED":
      return t("box.skipped", v);
    case "CLOSED":
      return t("box.closed", v);
    case "OPEN_LOCK_GATED":
      return t("box.gated", v);
    default:
      return legal ? t("box.canMark", v) : t("box.open", v);
  }
}

export function Box(p: BoxProps) {
  const { status, legal, staged } = p;
  const cls = [
    "g-box",
    `c-${cssColor(p.color)}`,
    `s-${status.toLowerCase().replace(/_/g, "-")}`,
    legal && !staged ? "is-legal" : "",
    staged ? "is-staged" : "",
    p.ghost ? "is-ghost" : "",
    p.flash ? "is-flash" : "",
    p.shake ? "is-shake" : "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <button
      type="button"
      class={cls}
      aria-label={boxLabel(p.color, p.number, status, legal)}
      aria-pressed={staged ? "true" : undefined}
      disabled={p.disabled || !legal}
      onClick={p.onPick}
    >
      {status === "MARKED" ? (
        <Cross />
      ) : status === "OPEN_LOCK_GATED" ? (
        <>
          <LockIcon size={14} />
          <span class="g-hint from-tablet" aria-hidden="true">
            5×
          </span>
        </>
      ) : (
        <span class="num g-num">{p.number}</span>
      )}
      {p.ghost || staged ? <Cross /> : null}
    </button>
  );
}
