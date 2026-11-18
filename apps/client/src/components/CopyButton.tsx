import { useEffect, useRef, useState } from "preact/hooks";
import { reducedMotion } from "../fx/motion";
import { t, useT } from "../i18n";

/** How long the "Link copied" confirmation stays up. */
export const COPIED_MS = 2000;

export interface CopyButtonProps {
  /** The invite link. Only the link is shared or copied (never a password). */
  url: string;
  /** Title for the native share sheet. */
  title: string;
  label?: string;
}

type Outcome = "idle" | "copied" | "failed";

function isAbort(err: unknown): boolean {
  return (
    typeof err === "object" && err !== null && (err as { name?: unknown }).name === "AbortError"
  );
}

/**
 * Invite button: the native share sheet when available (iPhone), otherwise copy the link
 * to the clipboard and show a "Link copied" check. If both fail, the link is shown as text.
 */
export function CopyButton({ url, title, label }: CopyButtonProps) {
  useT();
  const [outcome, setOutcome] = useState<Outcome>("idle");
  const checkRef = useRef<HTMLSpanElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (timer.current !== null) clearTimeout(timer.current);
    };
  }, []);

  useEffect(() => {
    const el = checkRef.current;
    if (outcome !== "copied" || !el || typeof el.animate !== "function" || reducedMotion()) return;
    el.animate(
      [
        { transform: "scale(0.4)", opacity: 0 },
        { transform: "scale(1.15)", opacity: 1, offset: 0.6 },
        { transform: "scale(1)", opacity: 1 },
      ],
      { duration: 320, easing: "ease-out" },
    );
  }, [outcome]);

  const copy = async (): Promise<boolean> => {
    try {
      if (!navigator.clipboard?.writeText) return false;
      await navigator.clipboard.writeText(url);
      return true;
    } catch {
      return false;
    }
  };

  const onClick = async () => {
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title, url });
        return;
      } catch (err) {
        // The user closed the sheet: nothing to do. Any other failure falls back to copy.
        if (isAbort(err)) return;
      }
    }
    const ok = await copy();
    if (!alive.current) return;
    setOutcome(ok ? "copied" : "failed");
    if (timer.current !== null) clearTimeout(timer.current);
    if (ok) {
      timer.current = setTimeout(() => {
        if (alive.current) setOutcome("idle");
      }, COPIED_MS);
    }
  };

  return (
    <div class="stack" style={{ gap: "var(--s1)", alignItems: "flex-start" }}>
      <button type="button" class="btn" onClick={onClick}>
        {outcome === "copied" ? (
          <span>
            <span ref={checkRef} aria-hidden="true" style={{ display: "inline-block" }}>
              ✓
            </span>{" "}
            {t("waiting.linkCopied")}
          </span>
        ) : (
          <span>{label ?? t("waiting.invite")}</span>
        )}
      </button>
      <span class="sr-only" role="status" aria-live="polite">
        {outcome === "copied" ? t("waiting.linkCopied") : ""}
      </span>
      {outcome === "failed" ? (
        <p class="muted" style={{ fontSize: "var(--fs-small)", overflowWrap: "anywhere" }}>
          {t("waiting.copyThis", { url })}
        </p>
      ) : null}
    </div>
  );
}
