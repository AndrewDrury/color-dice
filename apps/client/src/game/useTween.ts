import { useEffect, useRef, useState } from "preact/hooks";
import { reducedMotion } from "../fx/motion";

/** Tween a number toward `target` over `ms` (rows/total: 400 ms; results: from 0 over 900 ms). */
export function useTween(target: number, ms = 400, initial?: number): number {
  const [value, setValue] = useState(initial ?? target);
  const from = useRef(value);
  from.current = value;
  useEffect(() => {
    const start = from.current;
    if (start === target) return;
    if (reducedMotion() || typeof requestAnimationFrame !== "function") {
      setValue(target);
      return;
    }
    const t0 = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / ms);
      const eased = 1 - (1 - k) ** 3;
      setValue(Math.round(start + (target - start) * eased));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return value;
}
