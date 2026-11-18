import type { ViewMessage } from "@cd/protocol";
import { logLines } from "../game/log";

/** Recent moves, newest first. */
export function MoveLog({ view }: { view: ViewMessage }) {
  const lines = logLines(view);
  return (
    <section class="card g-log" aria-label="Move log">
      <h2 class="g-log-title">Moves</h2>
      {lines.length === 0 ? (
        <p class="muted">Nothing yet.</p>
      ) : (
        <ol>
          {lines.map((l) => (
            <li key={l.id}>{l.text}</li>
          ))}
        </ol>
      )}
    </section>
  );
}
