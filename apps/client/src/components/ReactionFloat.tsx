/** One floating cat reaction anchored to a seat's chip (or the reaction button for your own). */
import type { Reaction } from "@cd/protocol";
import { useEffect, useState } from "preact/hooks";
import { dropFloat, type ReactionEntry } from "../chat/store";
import { useReducedMotion } from "../fx/motion";
import { CatReaction } from "./CatReaction";

/** Rise + hold + fade, then removal (K5.2). Reduced motion: no movement, same lifetime. */
export const FLOAT_MS = 3500;
const FLOAT_SIZE = 64;

function anchorRect(seatId: string, mine: boolean): DOMRect | null {
  const esc = (s: string) => s.replace(/["\\]/g, "");
  const sel = mine ? "[data-rx-self]" : `[data-seat-id="${esc(seatId)}"]`;
  const el = document.querySelector(sel) ?? document.querySelector("[data-rx-self]");
  return el ? el.getBoundingClientRect() : null;
}

export function ReactionFloat({ entry, mine }: { entry: ReactionEntry; mine: boolean }) {
  const reduced = useReducedMotion();
  const [rect] = useState(() => anchorRect(entry.seatId, mine));
  useEffect(() => {
    const t = setTimeout(() => dropFloat(entry.id), FLOAT_MS);
    return () => clearTimeout(t);
  }, [entry.id]);
  const style = rect
    ? { left: `${rect.left + rect.width / 2}px`, top: `${rect.bottom + 6}px` } // below the chip, never over its name
    : { right: "16px", top: "calc(env(safe-area-inset-top) + 60px)" };
  return (
    <span class={`rx-float${reduced ? " is-static" : ""}`} style={style} aria-hidden="true">
      <CatReaction id={entry.emoji as Reaction} size={FLOAT_SIZE} />
    </span>
  );
}
