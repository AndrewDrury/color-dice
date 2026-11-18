/** K4.2: a short, non-blocking popup in the row's colour whenever a row locks; queued, aria-live. */
import { useEffect } from "preact/hooks";
import type { LockItem } from "../game/flow";
import { cssColor } from "../game/model";
import { LockIcon } from "./icons";

export const LOCK_POPUP_MS = 2200;

export function LockPopup({ queue, shift }: { queue: readonly LockItem[]; shift: () => void }) {
  const head = queue[0];
  useEffect(() => {
    if (!head) return;
    const timer = setTimeout(shift, LOCK_POPUP_MS);
    return () => clearTimeout(timer);
  }, [head?.id]);
  return (
    <div class="lp-wrap" role="status" aria-live="polite">
      {head ? (
        <div key={head.id} class={`lp-card c-${cssColor(head.color)}`}>
          <LockIcon size={20} />
          <span>{head.text}</span>
        </div>
      ) : null}
    </div>
  );
}
