import { describe, expect, it } from "vitest";
import {
  anglesAt,
  BOUNCE_MS,
  continueTo,
  FACE_NORMALS,
  type Face,
  faceRotation,
  hashSeed,
  mod360,
  seededRandom,
  settleBodyKeyframes,
  settleTransform,
  tumbleKeyframes,
} from "../src/fx/dice-math";
import { ROLL_TIMING } from "../src/fx/useRollAnimation";

const FACES: Face[] = [1, 2, 3, 4, 5, 6];
type V = [number, number, number];

const rad = (d: number) => (d * Math.PI) / 180;
// CSS rotation matrices (column vectors, y down, z toward the viewer).
const rotX = (a: number, [x, y, z]: V): V => [
  x,
  Math.cos(rad(a)) * y - Math.sin(rad(a)) * z,
  Math.sin(rad(a)) * y + Math.cos(rad(a)) * z,
];
const rotY = (a: number, [x, y, z]: V): V => [
  Math.cos(rad(a)) * x + Math.sin(rad(a)) * z,
  y,
  -Math.sin(rad(a)) * x + Math.cos(rad(a)) * z,
];
const rotZ = (a: number, [x, y, z]: V): V => [
  Math.cos(rad(a)) * x - Math.sin(rad(a)) * y,
  Math.sin(rad(a)) * x + Math.cos(rad(a)) * y,
  z,
];
/** `rotateZ(z) rotateX(x) rotateY(y)`: the rightmost function applies first. */
const apply = (r: { x: number; y: number; z?: number }, v: V): V =>
  rotZ(r.z ?? 0, rotX(r.x, rotY(r.y, v)));

function expectFront(v: V) {
  expect(v[0]).toBeCloseTo(0, 6);
  expect(v[1]).toBeCloseTo(0, 6);
  expect(v[2]).toBeCloseTo(1, 6);
}

describe("faceRotation", () => {
  it("turns every face's normal to the front (+Z)", () => {
    for (const f of FACES) expectFront(apply(faceRotation(f), [...FACE_NORMALS[f]] as V));
  });

  it("opposite faces sum to 7", () => {
    for (const f of FACES) {
      const n = FACE_NORMALS[f];
      const o = FACE_NORMALS[(7 - f) as Face];
      expect(n.map((c, i) => c + (o[i] ?? 0))).toEqual([0, 0, 0]);
    }
  });
});

describe("settleTransform", () => {
  it("is deterministic per seed and lands on the requested face", () => {
    for (let seed = 0; seed < 200; seed++) {
      for (const f of FACES) {
        const a = settleTransform(f, seed);
        expect(settleTransform(f, seed)).toEqual(a);
        const base = faceRotation(f);
        expect(mod360(a.x)).toBeCloseTo(mod360(base.x), 6);
        expect(mod360(a.y)).toBeCloseTo(mod360(base.y), 6);
        expect(Math.abs(a.x - base.x)).toBeGreaterThanOrEqual(360);
        expect(a.z).toBe(0);
        expect(a.tx).toBe(0);
        expect(a.ty).toBe(0);
        expectFront(apply(a, [...FACE_NORMALS[f]] as V));
      }
    }
  });

  it("differs between seeds", () => {
    expect(settleTransform(3, hashSeed("K7QF2:9", "RED"))).not.toEqual(
      settleTransform(3, hashSeed("K7QF2:9", "BLUE")),
    );
  });
});

describe("seededRandom / tumbleKeyframes", () => {
  it("repeats for the same seed and stays in [0, 1)", () => {
    const a = seededRandom(42);
    const b = seededRandom(42);
    for (let i = 0; i < 100; i++) {
      const v = a();
      expect(v).toBe(b());
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("loops seamlessly at 720–1080 °/s", () => {
    for (let seed = 1; seed < 50; seed++) {
      const p = tumbleKeyframes(seed);
      expect(tumbleKeyframes(seed)).toEqual(p);
      expect(mod360(p.delta.x)).toBe(0);
      expect(mod360(p.delta.y)).toBe(0);
      const rate = (Math.max(Math.abs(p.delta.x), Math.abs(p.delta.y)) / p.duration) * 1000;
      expect(rate).toBeGreaterThanOrEqual(715);
      expect(rate).toBeLessThanOrEqual(1085);
      expect(anglesAt(p, 0)).toEqual(p.from);
    }
  });

  it("continueTo keeps the spin direction and lands on the same pose", () => {
    const from = { x: 100, y: -40, z: 5 };
    const target = settleTransform(4, 7);
    const to = continueTo(from, target, { x: 720, y: -360, z: 0 });
    expect(to.x).toBeGreaterThanOrEqual(from.x + 60);
    expect(to.y).toBeLessThanOrEqual(from.y - 60);
    expect(mod360(to.x)).toBeCloseTo(mod360(target.x), 6);
    expect(mod360(to.y)).toBeCloseTo(mod360(target.y), 6);
    expect(mod360(to.z)).toBeCloseTo(mod360(target.z), 6);
  });
});

describe("settle bounce (K3.1)", () => {
  it("lands then bounces within 120 ms, ending at rest", () => {
    expect(BOUNCE_MS).toBeLessThanOrEqual(120);
    const kf = settleBodyKeyframes({ tx: 0, ty: 0 }, ROLL_TIMING.settle);
    const contact = kf[1]?.offset as number;
    expect((1 - contact) * ROLL_TIMING.settle).toBeLessThanOrEqual(120);
    expect(kf[1]?.transform).toBe("translate(0px,0px)");
    expect(kf.at(-1)?.transform).toBe("translate(0px,0px)");
    // The land sound and haptic fire at first contact.
    expect(ROLL_TIMING.landAt).toBe(Math.round(contact * ROLL_TIMING.settle));
  });
});
