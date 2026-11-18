/** Winner confetti (H7): 60 CSS particles in the row colours, 1.6 s, removed afterwards. */
import { useEffect, useState } from "preact/hooks";
import { useReducedMotion } from "../fx/motion";

const COLORS = ["var(--row-red)", "var(--row-yellow)", "var(--row-green)", "var(--row-blue)"];
export const PARTICLES = 60;
const DURATION_MS = 1600;

/** Deterministic spread so the burst looks random but renders the same everywhere. */
const frac = (i: number, k: number) =>
  (((Math.sin(i * 12.9898 + k * 78.233) * 43758.5453) % 1) + 1) % 1;

export function Confetti() {
  const reduced = useReducedMotion();
  const [done, setDone] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setDone(true), DURATION_MS + 300);
    return () => clearTimeout(t);
  }, []);
  if (reduced || done) return null;
  return (
    <div class="cf" aria-hidden="true">
      {Array.from({ length: PARTICLES }, (_, i) => {
        const angle = (frac(i, 1) - 0.5) * Math.PI * 1.1;
        const speed = 120 + frac(i, 2) * 220;
        return (
          <i
            key={i}
            class="cf-p"
            style={{
              background: COLORS[i % COLORS.length] ?? "var(--accent)",
              "--dx": `${Math.round(Math.sin(angle) * speed)}px`,
              "--dy": `${Math.round(-Math.cos(angle) * speed - 40)}px`,
              "--rot": `${Math.round(frac(i, 3) * 720 - 360)}deg`,
              animationDelay: `${Math.round(frac(i, 4) * 120)}ms`,
            }}
          />
        );
      })}
    </div>
  );
}
