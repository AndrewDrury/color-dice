/** First-game coaching (H12): one hint line with "Got it", tracked in prefs.seenHints. */
import type { ViewMessage } from "@cd/protocol";
import { usePrefs } from "../components/Settings";
import { setPrefs } from "../prefs";

export interface Hint {
  id: string;
  text: string;
}

/** The first applicable hint this device has not dismissed yet. */
export function pickHint(view: ViewMessage, seen: readonly string[]): Hint | null {
  const g = view.game;
  if (!g || g.phase === "GAME_OVER") return null;
  const me = g.players.find((p) => p.seat === view.you.seat);
  if (!me) return null;
  const marks = Object.values(me.sheet.rows).reduce(
    (n, r) => n + r.marked.filter(Boolean).length,
    0,
  );
  const mine = g.turn?.activeSeat === view.you.seat;
  const candidates: (Hint & { when: boolean })[] = [
    {
      id: "white-sum",
      text: "Everyone may use the white sum. Tap a glowing box, or Pass.",
      when: g.phase === "ACTION_1" && !me.action1Submitted,
    },
    {
      id: "your-turn",
      text: "Your turn: combine one white die with one coloured die.",
      when: g.phase === "ACTION_2" && mine,
    },
    {
      id: "left-right",
      text: "Marks must go left → right. Skipped numbers are gone for good.",
      when: marks > 0 && (g.phase === "ACTION_1" || g.phase === "ACTION_2"),
    },
    {
      id: "lock",
      text: "Mark 5 in a row to unlock its lock box.",
      when: Object.values(me.sheet.rows).some((r) => r.marked.filter(Boolean).length >= 4),
    },
  ];
  const hit = candidates.find((c) => c.when && !seen.includes(c.id));
  return hit ? { id: hit.id, text: hit.text } : null;
}

export function GameHint({ view }: { view: ViewMessage }) {
  const prefs = usePrefs();
  const hint = pickHint(view, prefs.seenHints);
  if (!hint) {
    // Desktop-only nudge next to the roll action.
    return view.you.canRoll ? (
      <p class="key-hint muted" aria-hidden="true">
        Space to roll
      </p>
    ) : null;
  }
  return (
    <div class="g-hintline">
      <p>{hint.text}</p>
      <button
        type="button"
        class="btn"
        onClick={() => setPrefs({ seenHints: [...prefs.seenHints, hint.id] })}
      >
        Got it
      </button>
    </div>
  );
}
