import { describe, expect, it } from "vitest";
import {
  hashPassword,
  hashToken,
  iterationsFromEnv,
  newSeatId,
  newToken,
  tokenHashEquals,
  verifyPassword,
} from "../src/crypto";

describe("password hashing", () => {
  it("hash then verify is true; wrong password is false", async () => {
    const stored = await hashPassword("hunter22", 1000);
    expect(stored.iterations).toBe(1000);
    expect(atob(stored.saltB64)).toHaveLength(16);
    expect(atob(stored.hashB64)).toHaveLength(32);
    expect(await verifyPassword("hunter22", stored)).toBe(true);
    expect(await verifyPassword("hunter23", stored)).toBe(false);
    expect(await verifyPassword("", stored)).toBe(false);
  });

  it("uses a different salt each call", async () => {
    const a = await hashPassword("same", 1000);
    const b = await hashPassword("same", 1000);
    expect(a.saltB64).not.toBe(b.saltB64);
    expect(a.hashB64).not.toBe(b.hashB64);
  });

  it("verifies with the stored iteration count, not the env one", async () => {
    const stored = await hashPassword("pw-1234", 1000);
    expect(iterationsFromEnv({ PBKDF2_ITERATIONS: "100000" })).toBe(100_000);
    expect(await verifyPassword("pw-1234", stored)).toBe(true);
    expect(await verifyPassword("pw-1234", { ...stored, iterations: 1001 })).toBe(false);
  });

  it("rejects malformed stored records without throwing", async () => {
    const stored = await hashPassword("pw-1234", 1000);
    expect(await verifyPassword("pw-1234", { ...stored, hashB64: "AAAA" })).toBe(false);
    expect(await verifyPassword("pw-1234", { ...stored, saltB64: "%%%" })).toBe(false);
    expect(await verifyPassword("pw-1234", { ...stored, iterations: 0 })).toBe(false);
  });

  it("iterationsFromEnv defaults to 100,000 when unset or invalid", () => {
    expect(iterationsFromEnv({})).toBe(100_000);
    expect(iterationsFromEnv({ PBKDF2_ITERATIONS: "" })).toBe(100_000);
    expect(iterationsFromEnv({ PBKDF2_ITERATIONS: "abc" })).toBe(100_000);
    expect(iterationsFromEnv({ PBKDF2_ITERATIONS: "-5" })).toBe(100_000);
    expect(iterationsFromEnv({ PBKDF2_ITERATIONS: "1000" })).toBe(1000);
  });

  it("CPU measurement: hashPassword at 100,000 iterations", async () => {
    // Note: workerd freezes Date.now() during synchronous work, but advances it across awaits.
    const runs = 3;
    const t0 = performance.now();
    for (let i = 0; i < runs; i++) await hashPassword("measure-me", 100_000);
    const avg = (performance.now() - t0) / runs;
    console.log(`[T08] PBKDF2-SHA256 100k iterations: avg ${avg.toFixed(1)} ms over ${runs} runs`);
    expect(avg).toBeGreaterThanOrEqual(0);
  });
});

describe("session tokens", () => {
  it("is 43 chars of base64url and unique across 1000 calls", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      const t = newToken();
      expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/);
      seen.add(t);
    }
    expect(seen.size).toBe(1000);
  });

  it("hashToken is SHA-256 hex and deterministic", async () => {
    expect(await hashToken("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    const t = newToken();
    expect(await hashToken(t)).toBe(await hashToken(t));
    expect(await hashToken(t)).not.toBe(await hashToken(newToken()));
  });

  it("tokenHashEquals compares in constant time and handles length mismatch", async () => {
    const h = await hashToken("x");
    expect(tokenHashEquals(h, h)).toBe(true);
    expect(tokenHashEquals(h, await hashToken("y"))).toBe(false);
    expect(tokenHashEquals(h, h.slice(1))).toBe(false);
  });
});

describe("seat ids", () => {
  it("is 8 chars of lower-case base32 and matches the protocol seat-id format", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 500; i++) {
      const id = newSeatId();
      expect(id).toMatch(/^[a-z2-7]{8}$/);
      expect(id).toMatch(/^[A-Za-z0-9_-]{8}$/);
      seen.add(id);
    }
    expect(seen.size).toBe(500);
  });
});
