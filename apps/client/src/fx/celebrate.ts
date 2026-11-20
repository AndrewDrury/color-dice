/**
 * Full-screen celebrations for the end-of-game reveal (T-NEW-25). Lazy chunk only (game over).
 * CSS kinds (lasers, hearts, aurora, disco) are plain elements; canvas kinds (confetti, fireworks,
 * starfield) run one rAF loop with a small, phone-friendly particle cap. Colours are their own,
 * independent of the theme; text always sits on theme panels, never directly on the effect.
 */
export const KINDS = [
  "confetti",
  "lasers",
  "hearts",
  "fireworks",
  "aurora",
  "starfield",
  "disco",
] as const;
export type CelebrationKind = (typeof KINDS)[number];
const CANVAS_KINDS: readonly CelebrationKind[] = ["confetti", "fireworks", "starfield"];
export const isCanvasKind = (k: CelebrationKind) => CANVAS_KINDS.includes(k);

/** Uniform pick; `rand` is injectable so tests can seed it. */
export function pickCelebration(rand: () => number = Math.random): CelebrationKind {
  return KINDS[Math.min(KINDS.length - 1, Math.floor(rand() * KINDS.length))] as CelebrationKind;
}

/** Deterministic 0..1 spread for the CSS particles (renders the same everywhere). */
export const frac = (i: number, k: number) =>
  (((Math.sin(i * 12.9898 + k * 78.233) * 43758.5453) % 1) + 1) % 1;

/** Number of CSS elements per kind (kept small: each is a composited animation). */
export const CSS_COUNT: Readonly<Partial<Record<CelebrationKind, number>>> = {
  lasers: 8,
  hearts: 22,
  aurora: 3,
  disco: 6,
};

const PALETTE = ["#ff4d6d", "#ffd23f", "#3ddc97", "#4dabf7", "#b388ff", "#ff9f1c", "#ffffff"];
const MAX_MS = 40_000;

/** Particle budget: phones get fewer. */
export const particleCap = (width: number) => (width < 600 ? 60 : 120);

interface P {
  x: number;
  y: number;
  vx: number;
  vy: number;
  a: number;
  va: number;
  s: number;
  c: string;
  life: number;
}

/** Starts the canvas effect; returns a stop function (also auto-stops after 40 s). */
export function runCanvas(
  canvas: HTMLCanvasElement,
  kind: CelebrationKind,
  rand: () => number = Math.random,
): () => void {
  const ctx = canvas.getContext("2d");
  if (!ctx || typeof requestAnimationFrame !== "function") return () => {};
  const dpr = Math.min(globalThis.devicePixelRatio || 1, 1.5);
  let w = 0;
  let h = 0;
  const resize = () => {
    w = canvas.clientWidth || globalThis.innerWidth || 360;
    h = canvas.clientHeight || globalThis.innerHeight || 640;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  resize();
  globalThis.addEventListener?.("resize", resize);
  const cap = particleCap(w);
  const ps: P[] = [];
  const pick = <T>(a: readonly T[]) => a[Math.floor(rand() * a.length)] as T;

  const confetti = (): P => ({
    x: rand() * w,
    y: -10 - rand() * h,
    vx: (rand() - 0.5) * 60,
    vy: 90 + rand() * 120,
    a: rand() * 6.28,
    va: (rand() - 0.5) * 9,
    s: 6 + rand() * 6,
    c: pick(PALETTE),
    life: 1,
  });
  const star = (): P => ({
    x: (rand() - 0.5) * w,
    y: (rand() - 0.5) * h,
    vx: 0,
    vy: 0,
    a: 0,
    va: 0,
    s: 0.15 + rand() * 0.85, // depth: smaller is farther
    c: pick(["#ffffff", "#9ad1ff", "#ffe9a8"]),
    life: 1,
  });
  if (kind === "confetti") for (let i = 0; i < cap; i++) ps.push(confetti());
  if (kind === "starfield") for (let i = 0; i < cap * 2; i++) ps.push(star());

  let last = performance.now();
  const t0 = last;
  let nextBurst = 0;
  let raf = 0;
  let stopped = false;
  const frame = (now: number) => {
    if (stopped) return;
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (document.hidden) return;
    if (now - t0 > MAX_MS) return stop();
    if (kind === "fireworks") {
      // Fade instead of clear: leaves short glowing trails.
      ctx.globalCompositeOperation = "destination-out";
      ctx.fillStyle = "rgba(0,0,0,0.2)";
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = "source-over";
    } else ctx.clearRect(0, 0, w, h);
    if (kind === "confetti") {
      for (const p of ps) {
        p.x += p.vx * dt + Math.sin(p.a) * 20 * dt;
        p.y += p.vy * dt;
        p.a += p.va * dt;
        if (p.y > h + 12) Object.assign(p, confetti(), { y: -12 });
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.a);
        ctx.fillStyle = p.c;
        ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2);
        ctx.restore();
      }
    } else if (kind === "fireworks") {
      nextBurst -= dt;
      if (nextBurst <= 0 && ps.length < cap * 2) {
        nextBurst = 0.45 + rand() * 0.5;
        const cx = w * (0.15 + rand() * 0.7);
        const cy = h * (0.12 + rand() * 0.4);
        const c = pick(PALETTE);
        const n = Math.round(cap / 2);
        for (let i = 0; i < n; i++) {
          const ang = (i / n) * 6.283 + rand() * 0.2;
          const sp = 80 + rand() * 140;
          ps.push({
            x: cx,
            y: cy,
            vx: Math.cos(ang) * sp,
            vy: Math.sin(ang) * sp,
            a: 0,
            va: 0,
            s: 2.5,
            c,
            life: 1,
          });
        }
      }
      for (let i = ps.length - 1; i >= 0; i--) {
        const p = ps[i] as P;
        p.vy += 140 * dt;
        p.vx *= 0.985;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.life -= dt * 0.7;
        if (p.life <= 0) {
          ps.splice(i, 1);
          continue;
        }
        ctx.globalAlpha = p.life;
        ctx.fillStyle = p.c;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.s, 0, 6.283);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    } else if (kind === "starfield") {
      const cx = w / 2;
      const cy = h / 2;
      ctx.lineCap = "round";
      for (const p of ps) {
        const z = p.s;
        const px = p.x;
        const py = p.y;
        const k = 1 + dt * (1.4 + z * 3.2);
        p.x *= k;
        p.y *= k;
        if (Math.abs(p.x) > w * 0.7 || Math.abs(p.y) > h * 0.7)
          Object.assign(p, star(), { x: (rand() - 0.5) * 40, y: (rand() - 0.5) * 40 });
        ctx.strokeStyle = p.c;
        ctx.globalAlpha = Math.min(1, 0.25 + z);
        ctx.lineWidth = 0.6 + z * 2;
        ctx.beginPath();
        ctx.moveTo(cx + px, cy + py);
        ctx.lineTo(cx + p.x, cy + p.y);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
  };
  raf = requestAnimationFrame(frame);
  function stop() {
    stopped = true;
    cancelAnimationFrame(raf);
    ctx?.clearRect(0, 0, w, h);
    globalThis.removeEventListener?.("resize", resize);
  }
  return stop;
}
