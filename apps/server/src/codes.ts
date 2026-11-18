import { CODE_ALPHABET, CODE_LENGTH } from "@cd/protocol";

const CODE_RE = new RegExp(`^[${CODE_ALPHABET}]{${CODE_LENGTH}}$`);
/** Largest multiple of the alphabet size that fits in a byte; bytes at or above it are rejected. */
const BYTE_LIMIT = 256 - (256 % CODE_ALPHABET.length);

/** 5 chars from CODE_ALPHABET, unbiased (rejection sampling on random bytes). */
export function newGameCode(): string {
  let out = "";
  while (out.length < CODE_LENGTH) {
    for (const b of crypto.getRandomValues(new Uint8Array(CODE_LENGTH * 2))) {
      if (b >= BYTE_LIMIT) continue;
      out += CODE_ALPHABET[b % CODE_ALPHABET.length];
      if (out.length === CODE_LENGTH) break;
    }
  }
  return out;
}

/** Strict check: exact length, upper-case alphabet only (no normalization). */
export function isValidCode(s: string): boolean {
  return CODE_RE.test(s);
}
