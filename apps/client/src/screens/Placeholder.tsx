import type { Route } from "../router";
import type { SocketStatus } from "../ws";

export interface PlaceholderProps {
  route: Route;
  status: SocketStatus;
}

/** Temporary screen until the real screens land (T14+). Renders text only. */
export function Placeholder({ route, status }: PlaceholderProps) {
  return (
    <main class="stack" style={{ paddingTop: "var(--s8)" }}>
      <section class="card stack">
        <h1>Color Dice</h1>
        <p class="muted">
          Screen: <span>{route.screen}</span>
          {route.code ? (
            <>
              {" · "}Game <span class="num">{route.code}</span>
            </>
          ) : null}
        </p>
        <p class="muted">
          Connection: <span>{status}</span>
        </p>
      </section>
    </main>
  );
}
