/** One floating reaction anchored to a seat's chip (or the reaction button for your own). */
import { useEffect, useState } from "preact/hooks";
import { dropFloat, type ReactionEntry } from "../chat/store";
import { useReducedMotion } from "../fx/motion";

const FLOAT_MS = 1200;
const STATIC_MS = 1500;

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
    const t = setTimeout(() => dropFloat(entry.id), reduced ? STATIC_MS : FLOAT_MS);
    return () => clearTimeout(t);
  }, [entry.id, reduced]);
  const style = rect
    ? reduced
      ? { left: `${rect.right + 4}px`, top: `${rect.top + rect.height / 2}px` }
      : { left: `${rect.left + rect.width / 2}px`, top: `${rect.bottom}px` }
    : { right: "16px", top: "calc(env(safe-area-inset-top) + 60px)" };
  return (
    <span class={`rx-float${reduced ? " is-static" : ""}`} style={style} aria-hidden="true">
      {entry.emoji}
    </span>
  );
}
