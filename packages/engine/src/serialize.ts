import type { GameState } from "./types";

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

function canonical(value: unknown): Json {
  if (value === null || typeof value !== "object") {
    if (typeof value === "number" && !Number.isFinite(value)) {
      throw new TypeError("cannot serialize non-finite number");
    }
    return value as Json;
  }
  if (Array.isArray(value)) return value.map((v) => (v === undefined ? null : canonical(v)));
  const out: { [k: string]: Json } = {};
  for (const key of Object.keys(value).sort()) {
    const v = (value as Record<string, unknown>)[key];
    if (v === undefined) continue;
    Object.defineProperty(out, key, {
      value: canonical(v),
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
  return out;
}

/** Serialize a state with stable (sorted) key order. */
export function toJSON(state: GameState): string {
  return JSON.stringify(canonical(state));
}

/** Parse a state produced by `toJSON`. Throws on malformed input. */
export function fromJSON(text: string): GameState {
  const parsed: unknown = JSON.parse(text);
  if (
    parsed === null ||
    typeof parsed !== "object" ||
    !Array.isArray((parsed as GameState).players) ||
    !Array.isArray((parsed as GameState).lockedColors) ||
    !Array.isArray((parsed as GameState).log) ||
    typeof (parsed as GameState).phase !== "string"
  ) {
    throw new TypeError("invalid GameState JSON");
  }
  return parsed as GameState;
}
