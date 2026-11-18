import type { ComponentChildren } from "preact";
import { useEffect, useState } from "preact/hooks";

/** Show the spinner only for requests slower than this (no flicker on fast ones). */
export const SPINNER_DELAY_MS = 400;

export interface ButtonProps {
  children: ComponentChildren;
  variant?: "primary" | "default" | "link";
  type?: "button" | "submit";
  /** A request is in flight: the button is disabled, and a spinner appears after 400 ms. */
  busy?: boolean;
  disabled?: boolean;
  block?: boolean;
  onClick?: () => void;
  "aria-label"?: string;
  title?: string;
}

/** Spinner drawn with SVG SMIL so it needs no stylesheet. */
function Spinner() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      aria-hidden="true"
      style={{ position: "absolute", inset: 0, margin: "auto" }}
    >
      <circle
        cx="10"
        cy="10"
        r="8"
        fill="none"
        stroke="currentColor"
        stroke-width="3"
        stroke-linecap="round"
        stroke-dasharray="34 50"
      >
        <animateTransform
          attributeName="transform"
          type="rotate"
          from="0 10 10"
          to="360 10 10"
          dur="0.8s"
          repeatCount="indefinite"
        />
      </circle>
    </svg>
  );
}

/** Text button, ≥ 44 px tall. The spinner overlays the label so the layout never jumps. */
export function Button({
  children,
  variant = "default",
  type = "button",
  busy = false,
  disabled = false,
  block = false,
  onClick,
  title,
  ...aria
}: ButtonProps) {
  const [spinning, setSpinning] = useState(false);

  useEffect(() => {
    if (!busy) {
      setSpinning(false);
      return;
    }
    const t = setTimeout(() => setSpinning(true), SPINNER_DELAY_MS);
    return () => clearTimeout(t);
  }, [busy]);

  const cls = ["btn"];
  if (variant === "primary") cls.push("btn-primary");
  if (block) cls.push("btn-block");
  const linkStyle =
    variant === "link"
      ? {
          background: "transparent",
          boxShadow: "none",
          color: "var(--accent)",
          textDecoration: "underline",
          padding: "0 var(--s2)",
        }
      : {};

  return (
    <button
      type={type}
      class={cls.join(" ")}
      disabled={disabled || busy}
      aria-busy={busy ? "true" : undefined}
      aria-label={aria["aria-label"]}
      title={title}
      onClick={onClick}
      style={{ position: "relative", ...linkStyle }}
    >
      <span style={{ visibility: spinning ? "hidden" : "visible" }}>{children}</span>
      {spinning ? <Spinner /> : null}
    </button>
  );
}
