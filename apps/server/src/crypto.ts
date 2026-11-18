/**
 * Password hashing, session tokens and seat ids (C-protocol §C4, G-security).
 * Web Crypto only — no dependencies.
 */

/** Production PBKDF2 iteration count (defaults.md). Mirrors `PBKDF2_ITERATIONS` in @cd/protocol limits. */
export const DEFAULT_PBKDF2_ITERATIONS = 100_000;
const SALT_BYTES = 16;
const HASH_BITS = 256;
const TOKEN_BYTES = 32;
const SEAT_ID_LENGTH = 8;
const BASE32 = "abcdefghijklmnopqrstuvwxyz234567";

export interface StoredPassword {
  saltB64: string;
  hashB64: string;
  iterations: number;
}

const encoder = new TextEncoder();

function toBase64(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function fromBase64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function toBase64Url(bytes: Uint8Array): string {
  return toBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function randomBytes(n: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(n));
}

async function pbkdf2(pw: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(pw), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    key,
    HASH_BITS,
  );
  return new Uint8Array(bits);
}

/** Equal-length check first, then a constant-time compare. */
function safeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) return false;
  return crypto.subtle.timingSafeEqual(a, b);
}

/** PBKDF2-SHA256, 16-byte random salt, 32-byte output. */
export async function hashPassword(pw: string, iterations: number): Promise<StoredPassword> {
  if (!Number.isInteger(iterations) || iterations < 1) throw new Error("bad iterations");
  const salt = randomBytes(SALT_BYTES);
  const hash = await pbkdf2(pw, salt, iterations);
  return { saltB64: toBase64(salt), hashB64: toBase64(hash), iterations };
}

/** Re-derives with the **stored** salt and iteration count; constant-time compare. */
export async function verifyPassword(pw: string, stored: StoredPassword): Promise<boolean> {
  let salt: Uint8Array;
  let expected: Uint8Array;
  try {
    salt = fromBase64(stored.saltB64);
    expected = fromBase64(stored.hashB64);
  } catch {
    return false;
  }
  if (!Number.isInteger(stored.iterations) || stored.iterations < 1) return false;
  const actual = await pbkdf2(pw, salt, stored.iterations);
  return safeEqual(actual, expected);
}

/** Session token: 32 random bytes, base64url, no padding (43 chars). */
export function newToken(): string {
  return toBase64Url(randomBytes(TOKEN_BYTES));
}

/** SHA-256 of the token as lower-case hex. Only this is stored. */
export async function hashToken(token: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(token)));
  let hex = "";
  for (const b of digest) hex += b.toString(16).padStart(2, "0");
  return hex;
}

/** Constant-time comparison of two token hashes (hex strings). */
export function tokenHashEquals(a: string, b: string): boolean {
  return safeEqual(encoder.encode(a), encoder.encode(b));
}

/** Seat id: 8 chars of lower-case RFC 4648 base32 (exactly 40 random bits, unbiased). */
export function newSeatId(): string {
  const bytes = randomBytes(5);
  let bits = 0n;
  for (const b of bytes) bits = (bits << 8n) | BigInt(b);
  let out = "";
  for (let i = SEAT_ID_LENGTH - 1; i >= 0; i--) {
    out += BASE32[Number((bits >> BigInt(i * 5)) & 31n)];
  }
  return out;
}

/** `PBKDF2_ITERATIONS` from env (tests/dev only); production leaves it unset → 100,000. */
export function iterationsFromEnv(env: { PBKDF2_ITERATIONS?: string }): number {
  const n = Number(env.PBKDF2_ITERATIONS);
  return Number.isInteger(n) && n > 0 ? n : DEFAULT_PBKDF2_ITERATIONS;
}
