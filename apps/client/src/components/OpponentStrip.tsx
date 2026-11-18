/** Opponents: chips on phones, mini sheets from 600 px; tapping opens a read-only full sheet. */
import type { ViewMessage, ViewPlayer } from "@cd/protocol";
import { useState } from "preact/hooks";
import { opponents, seatInfo } from "../game/model";
import { SheetPanel } from "../game/SheetPanel";
import type { Viewport } from "../game/useViewport";
import { MiniSheet } from "./MiniSheet";
import { OpponentChip } from "./OpponentChip";
import { Sheet } from "./Sheet";

const NO_FX = { flash: {}, glint: null, floats: [], shakeKey: 0 } as const;

export interface OpponentStripProps {
  view: ViewMessage;
  viewport: Viewport;
  /** Seats whose newest marks are flashing, as `${seat}:${color}:${index}`. */
  flash: ReadonlySet<string>;
}

export function OpponentStrip({ view, viewport, flash }: OpponentStripProps) {
  const [open, setOpen] = useState<number | null>(null);
  const list = opponents(view);
  const selected: ViewPlayer | undefined = list.find((p) => p.seat === open);
  const flashOf = (p: ViewPlayer) =>
    new Set(
      [...flash].filter((k) => k.startsWith(`${p.seat}:`)).map((k) => k.slice(`${p.seat}:`.length)),
    );
  if (list.length === 0) return null;
  return (
    <>
      {viewport === "phone" ? (
        <section class="g-chips" aria-label="Opponents">
          {list.map((p) => (
            <OpponentChip
              key={p.seat}
              view={view}
              player={p}
              flash={flashOf(p).size > 0}
              onOpen={() => setOpen(p.seat)}
            />
          ))}
        </section>
      ) : (
        <section class="g-minis" aria-label="Opponents">
          {list.map((p) => (
            <MiniSheet
              key={p.seat}
              view={view}
              player={p}
              flash={flashOf(p)}
              onOpen={() => setOpen(p.seat)}
            />
          ))}
        </section>
      )}
      {selected ? (
        <SheetPanel
          title={seatInfo(view, selected)?.name ?? "Opponent"}
          onClose={() => setOpen(null)}
        >
          <Sheet
            player={selected}
            lockedColors={view.game?.lockedColors ?? []}
            legal={new Set()}
            staged={null}
            ghost={null}
            disabled
            readOnly
            fx={NO_FX as never}
            onPick={() => {}}
          />
        </SheetPanel>
      ) : null}
    </>
  );
}
