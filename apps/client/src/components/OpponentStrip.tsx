/** Opponents (J0.4/J0.7): name chips with status, total and penalties. Their cards stay hidden until game over. */
import type { ViewMessage, ViewPlayer } from "@cd/protocol";
import { opponents } from "../game/model";
import type { Viewport } from "../game/useViewport";
import { t } from "../i18n";
import "../styles/opponents.css";
import { OpponentChip } from "./OpponentChip";

export interface OpponentStripProps {
  view: ViewMessage;
  viewport: Viewport;
  /** Seats whose newest marks are flashing, as `${seat}:${color}:${index}`. */
  flash: ReadonlySet<string>;
}

export function OpponentStrip({ view, viewport, flash }: OpponentStripProps) {
  const list = opponents(view);
  const flashing = (p: ViewPlayer) => [...flash].some((k) => k.startsWith(`${p.seat}:`));
  if (list.length === 0) return null;
  return (
    <section class={`g-chips g-opp is-${viewport}`} aria-label={t("opp.aria")}>
      {list.map((p) => (
        <OpponentChip key={p.seat} view={view} player={p} flash={flashing(p)} />
      ))}
    </section>
  );
}
