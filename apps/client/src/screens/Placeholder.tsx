import { t, useT } from "../i18n";
import type { Route } from "../router";
import type { SocketStatus } from "../ws";

export interface PlaceholderProps {
  route: Route;
  status: SocketStatus;
}

/** Temporary screen until the real screens land (T14+). Renders text only. */
export function Placeholder({ route, status }: PlaceholderProps) {
  useT();
  return (
    <main class="stack" style={{ paddingTop: "var(--s8)" }}>
      <section class="card stack">
        <h1>Color Dice</h1>
        <p class="muted">
          {t("placeholder.screen")} <span>{route.screen}</span>
          {route.code ? (
            <>
              {" · "}
              {t("placeholder.game")} <span class="num">{route.code}</span>
            </>
          ) : null}
        </p>
        <p class="muted">
          {t("placeholder.connection")} <span>{status}</span>
        </p>
      </section>
    </main>
  );
}
