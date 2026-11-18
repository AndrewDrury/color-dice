/**
 * Pure dice geometry (H4). Cube faces are placed in CSS space (x right, y down, z toward
 * the viewer): 1 front (+Z), 6 back (-Z), 3 right (+X), 4 left (-X), 2 top (-Y), 5 bottom (+Y).
 * Opposite faces sum to 7. The cube transform is `rotateZ(z) rotateX(x) rotateY(y)`.
 */

export type Face = 1 | 2 | 3 | 4 | 5 | 6;

export interface Angles {
  x: number;
  y: number;
  z: number;
}

export interface SettlePose extends Angles {
  /** Resting position offset in px (always 0: dice rest in a straight row). */
  tx: number;
  ty: number;
}

export const FACE_NORMALS: Readonly<Record<Face, readonly [number, number, number]>> = {
  1: [0, 0, 1],
  6: [0, 0, -1],
  3: [1, 0, 0],
  4: [-1, 0, 0],
  2: [0, -1, 0],
  5: [0, 1, 0],
};

const FACE_ROTATION: Readonly<Record<Face, { x: number; y: number }>> = {
  1: { x: 0, y: 0 },
  6: { x: 0, y: 180 },
  3: { x: 0, y: -90 },
  4: { x: 0, y: 90 },
  2: { x: -90, y: 0 },
  5: { x: 90, y: 0 },
};

/** Cube rotation that turns `face` toward the viewer. */
export function faceRotation(face: Face): { x: number; y: number } {
  return { ...FACE_ROTATION[face] };
}

/** FNV-1a over the parts, so (code, turn, die) always gives the same seed for every player. */
export function hashSeed(...parts: Array<string | number>): number {
  let h = 0x811c9dc5;
  for (const ch of parts.join("|")) {
    h ^= ch.codePointAt(0) ?? 0;
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32: small deterministic PRNG returning floats in [0, 1). */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function between(rand: () => number, min: number, max: number): number {
  return min + (max - min) * rand();
}

/** Dice rest square: no resting yaw and no position offset (J0.3). */
export const MAX_YAW = 0;
export const MAX_JITTER = 0;

/** Final pose: face rotation + 1–2 whole spins per axis; zero yaw, zero x/y offset. */
export function settleTransform(face: Face, seed: number): SettlePose {
  const rand = seededRandom(seed ^ 0x5e771e);
  const base = FACE_ROTATION[face];
  const spinsX = 1 + Math.floor(rand() * 2);
  const spinsY = 1 + Math.floor(rand() * 2);
  return {
    x: base.x + 360 * spinsX,
    y: base.y + 360 * spinsY,
    z: 0,
    tx: 0,
    ty: 0,
  };
}

/** Normalise an angle to [0, 360). */
export function mod360(a: number): number {
  return ((a % 360) + 360) % 360;
}

export function rotateCss(a: Angles): string {
  return `rotateZ(${a.z}deg) rotateX(${a.x}deg) rotateY(${a.y}deg)`;
}

export interface TumblePlan {
  /** One loop; it repeats seamlessly because every axis turns a whole number of times. */
  keyframes: Keyframe[];
  duration: number;
  from: Angles;
  /** Degrees added per loop, per axis. */
  delta: Angles;
}

/** Spin rate 720–1080 °/s on the fastest axis, with random axis weights and directions. */
export function tumbleKeyframes(seed: number): TumblePlan {
  const rand = seededRandom(seed ^ 0x7a3b1e);
  const rate = between(rand, 720, 1080);
  const sx = rand() < 0.5 ? -1 : 1;
  const sy = rand() < 0.5 ? -1 : 1;
  // Axis weights: one axis turns twice per loop, the other once (or the other way round).
  const xHeavy = rand() < 0.5;
  const delta: Angles = { x: sx * (xHeavy ? 720 : 360), y: sy * (xHeavy ? 360 : 720), z: 0 };
  const duration = Math.round((720 / rate) * 1000);
  const from: Angles = {
    x: Math.round(rand() * 360),
    y: Math.round(rand() * 360),
    z: Math.round(between(rand, -20, 20)),
  };
  const mid: Angles = {
    x: from.x + delta.x / 2,
    y: from.y + delta.y / 2,
    z: from.z + between(rand, -25, 25),
  };
  const to: Angles = { x: from.x + delta.x, y: from.y + delta.y, z: from.z };
  return {
    keyframes: [
      { transform: rotateCss(from) },
      { transform: rotateCss(mid) },
      { transform: rotateCss(to) },
    ],
    duration,
    from,
    delta,
  };
}

/** Where the (linear) tumble is after `elapsed` ms. z wobble is ignored (it is small). */
export function anglesAt(plan: TumblePlan, elapsed: number): Angles {
  const t = plan.duration > 0 ? (Math.max(0, elapsed) % plan.duration) / plan.duration : 0;
  return {
    x: plan.from.x + plan.delta.x * t,
    y: plan.from.y + plan.delta.y * t,
    z: plan.from.z,
  };
}

/**
 * Shift each axis of `target` by whole turns so the cube keeps turning the way it tumbled,
 * by at least `minTravel` degrees, then decelerates onto the face. The yaw takes the short way.
 */
export function continueTo(from: Angles, target: Angles, dir: Angles, minTravel = 60): Angles {
  const axis = (f: number, t: number, d: number): number => {
    const sign = d < 0 ? -1 : 1;
    let travel = mod360((t - f) * sign);
    if (travel < minTravel) travel += 360;
    return f + sign * travel;
  };
  let dz = mod360(target.z - from.z);
  if (dz > 180) dz -= 360;
  return { x: axis(from.x, target.x, dir.x), y: axis(from.y, target.y, dir.y), z: from.z + dz };
}

/** The settle's landing bounce (K3.1): first contact to rest takes at most this long. */
export const BOUNCE_MS = 110;

/**
 * Body keyframes for a settle of `duration` ms: drop from the hover height, touch down
 * `BOUNCE_MS` before the end, one small hop (−3 px), rest at (tx, ty).
 */
export function settleBodyKeyframes(
  pose: { tx: number; ty: number },
  duration: number,
  hover = -10,
): Keyframe[] {
  const at = (ms: number) => Math.min(1, Math.max(0, ms / duration));
  const tr = (x: number, y: number) => `translate(${x}px,${y}px)`;
  const { tx, ty } = pose;
  return [
    { transform: tr(tx, ty + hover), easing: "ease-in" },
    { transform: tr(tx, ty), offset: at(duration - BOUNCE_MS), easing: "ease-out" },
    { transform: tr(tx, ty - 3), offset: at(duration - BOUNCE_MS / 2), easing: "ease-in" },
    { transform: tr(tx, ty) },
  ];
}
