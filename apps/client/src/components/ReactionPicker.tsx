/** Small horizontal popover with the 8 allow-listed reactions (I3). One tap sends and closes. */
import { REACTIONS, type Reaction } from "@cd/protocol";
import { useEffect, useRef } from "preact/hooks";

export function ReactionPicker({
  onPick,
  onClose,
}: {
  onPick: (emoji: Reaction) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLFieldSetElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") close.current();
    };
    const down = (e: Event) => {
      const root = ref.current?.parentElement;
      if (root && !root.contains(e.target as Node)) close.current();
    };
    document.addEventListener("keydown", key);
    document.addEventListener("pointerdown", down);
    ref.current?.querySelector<HTMLElement>("button")?.focus();
    return () => {
      document.removeEventListener("keydown", key);
      document.removeEventListener("pointerdown", down);
    };
  }, []);
  return (
    <fieldset ref={ref} class="rx-picker" aria-label="Reactions">
      {REACTIONS.map((emoji) => (
        <button
          key={emoji}
          type="button"
          class="rx-pick"
          aria-label={`React ${emoji}`}
          onClick={() => onPick(emoji)}
        >
          {emoji}
        </button>
      ))}
    </fieldset>
  );
}
