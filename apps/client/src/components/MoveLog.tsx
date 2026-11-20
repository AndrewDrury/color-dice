import type { ViewMessage } from "@cd/protocol";
import { useEffect, useRef, useState } from "preact/hooks";
import { reducedMotion } from "../fx/motion";
import { logLines } from "../game/log";
import { useTypewriter } from "../game/useTypewriter";
import { t, useT } from "../i18n";

const NEAR_PX = 24;

/** Recent moves, oldest first; the title stays put and only the entries scroll. */
export function MoveLog({ view }: { view: ViewMessage }) {
  useT();
  const lines = logLines(view).reverse();
  const box = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
  const lastTop = useRef(0);
  const shown = useTypewriter(lines);
  const [more, setMore] = useState({ above: false, below: false });

  const measure = () => {
    const el = box.current;
    if (!el) return;
    const below = el.scrollHeight - el.scrollTop - el.clientHeight;
    // Only scrolling up unpins; smooth auto-scroll moves down and must not.
    if (el.scrollTop < lastTop.current - 1) pinned.current = false;
    if (below <= NEAR_PX) pinned.current = true;
    lastTop.current = el.scrollTop;
    const next = { above: el.scrollTop > 1, below: below > 1 };
    setMore((m) => (m.above === next.above && m.below === next.below ? m : next));
  };

  const last = lines[lines.length - 1]?.id;
  useEffect(() => {
    const el = box.current;
    if (el && pinned.current) {
      const top = el.scrollHeight;
      if (!reducedMotion() && typeof el.scrollTo === "function")
        el.scrollTo({ top, behavior: "smooth" });
      else el.scrollTop = top;
    }
    measure();
  }, [last, lines.length]);

  return (
    <section class="card g-log" aria-label={t("log.title")}>
      <h2 class="g-log-title">{t("log.heading")}</h2>
      <div class="g-log-wrap">
        <div class="g-log-scroll" ref={box} onScroll={measure} data-testid="log-scroll">
          {lines.length === 0 ? (
            <p class="muted">{t("log.empty")}</p>
          ) : (
            <ol>
              {lines.map((l) => {
                const n = shown(l.id);
                return n === undefined ? (
                  <li key={l.id}>{l.text}</li>
                ) : (
                  <li key={l.id}>
                    <span class="sr-only">{l.text}</span>
                    <span aria-hidden="true">
                      {l.text.slice(0, n)}
                      {n > 0 ? <i class="g-caret" /> : null}
                      <span class="g-untyped">{l.text.slice(n)}</span>
                    </span>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
        {more.above ? <span class="g-log-fade is-top" data-testid="log-fade-top" /> : null}
        {more.below ? <span class="g-log-fade is-bottom" data-testid="log-fade-bottom" /> : null}
      </div>
    </section>
  );
}
