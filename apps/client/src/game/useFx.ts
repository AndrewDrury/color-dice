/** Visual effects from feedback events: score float, row glint, card shake, mark flashes. */
import type { Color } from "@cd/engine";
import { useEffect, useRef, useState } from "preact/hooks";
import type { SheetFx } from "../components/Sheet";
import { type FeedbackEvent, playMoments } from "./feedback";

export interface Fx {
  sheet: SheetFx;
  /** Newest marks of any seat as `${seat}:${color}:${index}` (opponent chips / mini sheets). */
  flash: ReadonlySet<string>;
  dropFloat: (id: number) => void;
}

const EMPTY: SheetFx = { flash: {}, glint: null, floats: [], shakeKey: 0 };

export function useFx(
  version: number | null,
  events: readonly FeedbackEvent[],
  mySeat: number | null,
): Fx {
  const [sheet, setSheet] = useState<SheetFx>(EMPTY);
  const [flash, setFlash] = useState<ReadonlySet<string>>(new Set());
  const seq = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const evRef = useRef(events);
  evRef.current = events;

  useEffect(() => {
    const evs = evRef.current;
    if (evs.length === 0) return;
    playMoments(evs);
    const flashing = new Set<string>();
    const mine: Partial<Record<Color, number[]>> = {};
    const floats: SheetFx["floats"] = [];
    let glint: Color | null = null;
    let shake = false;
    for (const e of evs) {
      if ((e.kind === "mark" || e.kind === "opponentMark") && e.color && e.index !== undefined) {
        flashing.add(`${e.seat}:${e.color}:${e.index}`);
        if (e.seat === mySeat) mine[e.color] = [...(mine[e.color] ?? []), e.index];
        if (e.kind === "mark" && e.delta && e.delta > 0) {
          seq.current += 1;
          floats.push({ id: seq.current, color: e.color, amount: e.delta });
        }
      }
      if (e.kind === "lock" && e.color) glint = e.color;
      if (e.kind === "penalty") shake = true;
    }
    setFlash(flashing);
    setSheet((s) => ({
      flash: mine,
      glint,
      floats: [...s.floats, ...floats],
      shakeKey: shake ? s.shakeKey + 1 : s.shakeKey,
    }));
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setFlash(new Set());
      setSheet((s) => ({ ...s, flash: {}, glint: null }));
    }, 1000);
  }, [version]);
  useEffect(() => () => clearTimeout(timer.current), []);

  return {
    sheet,
    flash,
    dropFloat: (id) => setSheet((s) => ({ ...s, floats: s.floats.filter((f) => f.id !== id) })),
  };
}
