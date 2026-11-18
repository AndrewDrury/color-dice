import type { ViewMessage } from "@cd/protocol";
import { logLines } from "../game/log";
import { t, useT } from "../i18n";

/** Recent moves, newest first. */
export function MoveLog({ view }: { view: ViewMessage }) {
  useT();
  const lines = logLines(view);
  return (
    <section class="card g-log" aria-label={t("log.title")}>
      <h2 class="g-log-title">{t("log.heading")}</h2>
      {lines.length === 0 ? (
        <p class="muted">{t("log.empty")}</p>
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
