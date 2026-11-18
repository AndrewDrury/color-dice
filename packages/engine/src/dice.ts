import type { DiceSource, Face } from "./types";

export type { DiceSource } from "./types";

/** True if `v` is an integer face 1..6. */
export function isFace(v: unknown): v is Face {
  return typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 6;
}

interface CryptoLike {
  getRandomValues<T extends Uint8Array>(array: T): T;
}

function getCrypto(): CryptoLike {
  const c = (globalThis as { crypto?: CryptoLike }).crypto;
  if (!c || typeof c.getRandomValues !== "function") {
    throw new Error("crypto.getRandomValues is not available");
  }
  return c;
}

/** Largest multiple of 6 that fits in a byte: bytes >= this are rejected (unbiased). */
const BYTE_LIMIT = 252;

/** Unbiased dice from `crypto.getRandomValues`, using rejection sampling. */
export class CryptoDice implements DiceSource {
  private readonly crypto = getCrypto();
  private buffer = new Uint8Array(32);
  private pos = this.buffer.length;

  rollDie(): Face {
    for (;;) {
      if (this.pos >= this.buffer.length) {
        this.crypto.getRandomValues(this.buffer);
        this.pos = 0;
      }
      const b = this.buffer[this.pos++] as number;
      if (b < BYTE_LIMIT) return ((b % 6) + 1) as Face;
    }
  }
}

/** Deterministic dice for tests and replays. Throws when it runs out. */
export class ScriptedDice implements DiceSource {
  private readonly faces: Face[];
  private pos = 0;

  constructor(faces: readonly number[]) {
    for (const f of faces) {
      if (!isFace(f)) throw new RangeError(`invalid die face: ${f}`);
    }
    this.faces = faces.slice() as Face[];
  }

  rollDie(): Face {
    const f = this.faces[this.pos];
    if (f === undefined) throw new Error("ScriptedDice exhausted");
    this.pos++;
    return f;
  }

  /** Faces not yet rolled. */
  get remaining(): number {
    return this.faces.length - this.pos;
  }
}
