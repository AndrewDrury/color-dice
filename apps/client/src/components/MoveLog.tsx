import type { ViewMessage } from "@cd/protocol";
import { useEffect, useRef, useState } from "preact/hooks";
import { reducedMotion } from "../fx/motion";
import { logLines } from "../game/log";
import { cssColor } from "../game/model";
import { useTypewriter } from "../game/useTypewriter";
import { t, useT } from "../i18n";
import { AvatarHover } from "./AvatarHover";

const NEAR_PX = 24;

/** Recent moves, oldest first; the title stays put and only the entries scroll. */
export function MoveLog({ view }: { view: ViewMessage }) {
  useT();
  const lines = logLines(view).reverse();
  const yourSeat = view.you.seat;
  const box = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
  const lastTop = useRef(0);
  const shown = useTypewriter(
    lines.map((l) => ({ id: l.id, text: l.typed })),
    false,
  );
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
                return (
                  <li key={l.id} class={`lg k-${l.kind}`}>
                    <span class="sr-only">{l.text}</span>
                    <span class="lg-turn num" aria-hidden="true">
                      {t("summary.turn", { n: l.turn })}
                    </span>
                    <span class="lg-line" aria-hidden="true" title={l.typed}>
                      {n === undefined ? (
                        l.typed
                      ) : (
                        <>
                          {l.typed.slice(0, n)}
                          {n > 0 ? <i class="g-caret" /> : null}
                          <span class="g-untyped">{l.typed.slice(n)}</span>
                        </>
                      )}
                    </span>
                    <div class="lg-split" aria-hidden="true">
                      <div class="lg-side is-others">
                        <span class="lg-side-title">{t("opp.aria")}</span>
                        <div class="lg-side-list">
                          {l.actors
                            .filter((a) => yourSeat === null || a.seat !== yourSeat)
                            .filter((a) => a.marks.length > 0)
                            .map((a) => (
                              <span class="lg-actor" key={`${l.id}:opp:${a.seat}`}>
                                <AvatarHover profile={a.profile} size={20} name={a.name} />
                                <span class="lg-name" title={a.name}>
                                  {a.name}
                                </span>
                                <span class="lg-actions">
                                  {a.marks.map((m) => (
                                    <span
                                      key={`${a.seat}:${m.color}:${m.number}`}
                                      class={`ts-box lg-box c-${cssColor(m.color)}`}
                                    >
                                      {m.number}
                                    </span>
                                  ))}
                                </span>
                              </span>
                            ))}
                        </div>
                      </div>
                      <div class="lg-side is-mine">
                        <span class="lg-side-title">{t("profile.you")}</span>
                        <div class="lg-side-list">
                          {l.actors
                            .filter((a) => yourSeat !== null && a.seat === yourSeat)
                            .filter((a) => a.marks.length > 0)
                            .map((a) => (
                              <span class="lg-actor" key={`${l.id}:me:${a.seat}`}>
                                <AvatarHover profile={a.profile} size={20} name={a.name} />
                                <span class="lg-name" title={a.name}>
                                  {a.name}
                                </span>
                                <span class="lg-actions">
                                  {a.marks.map((m) => (
                                    <span
                                      key={`${a.seat}:${m.color}:${m.number}`}
                                      class={`ts-box lg-box c-${cssColor(m.color)}`}
                                    >
                                      {m.number}
                                    </span>
                                  ))}
                                </span>
                              </span>
                            ))}
                        </div>
                      </div>
                    </div>
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
