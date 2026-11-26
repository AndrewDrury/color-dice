/** K4.2: short, non-blocking queued popups (locks, penalties, game end); aria-live. */
import { useEffect } from "preact/hooks";
import type { FlowItem } from "../game/flow";
import { cssColor } from "../game/model";
import { LockIcon, WarningIcon } from "./icons";

export const LOCK_POPUP_MS = 2200;

export function LockPopup({ queue, shift }: { queue: readonly FlowItem[]; shift: () => void }) {
  const head = queue[0];
  useEffect(() => {
    if (!head) return;
    const timer = setTimeout(shift, LOCK_POPUP_MS);
    return () => clearTimeout(timer);
  }, [head?.id]);
  return (
    <div class="lp-wrap" role="status" aria-live="polite">
      {head ? (
        <div
          key={head.id}
          class={`lp-card${head.kind === "lock" ? ` c-${cssColor(head.color ?? "RED")}` : ""}${
            head.kind === "penalty" ? " is-penalty" : ""
          }${head.kind === "end" ? " is-end" : ""}`}
        >
          {head.kind === "lock" ? <LockIcon size={20} /> : <WarningIcon size={20} />}
          <span>{head.text}</span>
        </div>
      ) : null}
    </div>
  );
}
