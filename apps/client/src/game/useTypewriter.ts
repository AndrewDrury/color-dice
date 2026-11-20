import { useEffect, useRef, useState } from "preact/hooks";
import { reducedMotion } from "../fx/motion";

/**
 * Typewriter queue for lines that arrive while mounted. Returns how many chars of each
 * line are visible (`undefined` = all). Lines present at mount, and reduced motion, are instant.
 * While `paused` the queue waits (T-FIX-12: nothing types behind the turn summary) and resumes after.
 */
export function useTypewriter(
  lines: { id: number; text: string }[],
  paused = false,
): (id: number) => number | undefined {
  const known = useRef<Set<number> | null>(null);
  const queue = useRef<{ id: number; len: number }[]>([]);
  const n = useRef(0);
  const [, tick] = useState(0);
  if (!known.current) known.current = new Set(lines.map((l) => l.id));

  useEffect(() => {
    const k = known.current as Set<number>;
    let added = false;
    for (const l of lines) {
      if (k.has(l.id)) continue;
      k.add(l.id);
      if (!reducedMotion()) {
        queue.current.push({ id: l.id, len: l.text.length });
        added = true;
      }
    }
    if ((!added && queue.current.length === 0) || paused) return;
    let raf = 0;
    let last = performance.now();
    const step = (now: number) => {
      const q = queue.current;
      // Backlog beyond 3 queued: speed up in proportion so the log never lags.
      const rate = q.length > 3 ? q.length * 4 : 1;
      const head = q[0];
      if (head) {
        n.current += ((now - last) / Math.min(25, 1200 / head.len)) * rate;
        if (n.current >= head.len) q.shift(), (n.current = 0);
        tick((v) => v + 1);
      }
      last = now;
      if (q.length) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [lines.length, lines[lines.length - 1]?.id, paused]);

  return (id) => {
    const q = queue.current;
    const i = q.findIndex((e) => e.id === id);
    return i < 0 ? undefined : i === 0 ? Math.floor(n.current) : 0;
  };
}
