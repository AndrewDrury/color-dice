/**
 * Canonical cleaning for user-supplied display text (player names, room names).
 * Order matters:
 * 1. Drop format characters (zero-width space/joiners, BOM, bidi overrides, ...).
 * 2. Turn every whitespace run (tabs, newlines, NBSP, ...) into one space.
 * 3. Drop remaining control characters (e.g. NUL).
 * 4. Collapse spaces again, trim, NFC-normalize.
 */
export function cleanName(s: string): string {
  return s
    .replace(/\p{Cf}/gu, "")
    .replace(/\s+/gu, " ")
    .replace(/\p{Cc}/gu, "")
    .replace(/ {2,}/g, " ")
    .trim()
    .normalize("NFC");
}
