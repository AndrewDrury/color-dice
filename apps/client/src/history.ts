/**
 * Device-local game history (J5): which games this browser won or lost. Never sent anywhere.
 * Stored in localStorage with an in-memory fallback; storage content is untrusted, so every
 * read is sanitized (shape, bounds, dedupe) and the list is capped at `HISTORY_CAP`.
 */
import { GameCodeSchema } from "@cd/protocol";
import { useEffect, useState } from "preact/hooks";

export interface HistoryEntry {
  code: string;
  /** Game number in the room (your wins + losses after this game); with `code` it is the dedupe key. */
  game: number;
  won: boolean;
  /** Epoch ms. */
  at: number;
}

export const HISTORY_KEY = "colorDice:history";
export const HISTORY_CAP = 200;

type Listener = () => void;

let memory: HistoryEntry[] | null = null;
const listeners = new Set<Listener>();

function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

const keyOf = (e: HistoryEntry): string => `${e.code}:${e.game}`;

/** Keep only well-formed, unique entries (first wins), newest-last, at most `HISTORY_CAP`. */
export function sanitizeHistory(data: unknown): HistoryEntry[] {
  if (!Array.isArray(data)) return [];
  const seen = new Set<string>();
  const out: HistoryEntry[] = [];
  for (const raw of data) {
    if (typeof raw !== "object" || raw === null) continue;
    const r = raw as Record<string, unknown>;
    if (!GameCodeSchema.safeParse(r.code).success) continue;
    if (!Number.isSafeInteger(r.game) || (r.game as number) < 1 || (r.game as number) > 1_000_000) {
      continue;
    }
    if (typeof r.won !== "boolean") continue;
    if (!Number.isSafeInteger(r.at) || (r.at as number) < 0) continue;
    const e: HistoryEntry = {
      code: r.code as string,
      game: r.game as number,
      won: r.won,
      at: r.at as number,
    };
    if (seen.has(keyOf(e))) continue;
    seen.add(keyOf(e));
    out.push(e);
  }
  return out.slice(-HISTORY_CAP);
}

export function getHistory(): HistoryEntry[] {
  if (memory) return [...memory];
  let h: HistoryEntry[] = [];
  const ls = storage();
  if (ls) {
    try {
      const raw = ls.getItem(HISTORY_KEY);
      if (raw !== null) h = sanitizeHistory(JSON.parse(raw));
    } catch {
      // Blocked or corrupt storage: empty for this tab.
    }
  }
  memory = h;
  return [...h];
}

function write(next: HistoryEntry[]): void {
  memory = next;
  const ls = storage();
  if (ls) {
    try {
      if (next.length === 0) ls.removeItem(HISTORY_KEY);
      else ls.setItem(HISTORY_KEY, JSON.stringify(next));
    } catch {
      // Quota exceeded or storage blocked: the in-memory copy still works for this tab.
    }
  }
  for (const cb of listeners) cb();
}

/** Appends a finished game; a repeat of the same code + game number is ignored. */
export function recordGame(entry: HistoryEntry): void {
  const [clean] = sanitizeHistory([entry]);
  if (!clean) return;
  const cur = getHistory();
  if (cur.some((e) => keyOf(e) === keyOf(clean))) return;
  const next = sanitizeHistory([...cur, clean]);
  write(next);
}

const TRANSFER_PREFIX = "CD1.";
/** 200 entries are ~14 KB of JSON; anything far beyond that is not one of our codes. */
const TRANSFER_MAX_CHARS = 40_000;

/** Compact, versioned text code for moving the record to another device. No names. */
export function exportTransferCode(): string {
  const rows = getHistory().map((e) => [e.code, e.game, e.won ? 1 : 0, e.at]);
  const b64 = btoa(JSON.stringify(rows));
  return TRANSFER_PREFIX + b64.replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

export type ImportResult = { ok: true; added: number } | { ok: false; reason: string };

/** Strictly parses a transfer code and merges it into the history (dedupe by code + game). Never throws. */
export function importTransferCode(text: string): ImportResult {
  try {
    const t = String(text).trim();
    if (!t.startsWith(TRANSFER_PREFIX) || t.length > TRANSFER_MAX_CHARS) {
      return { ok: false, reason: "That is not a valid transfer code." };
    }
    const b64 = t.slice(TRANSFER_PREFIX.length).replaceAll("-", "+").replaceAll("_", "/");
    const rows: unknown = JSON.parse(atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4)));
    if (!Array.isArray(rows)) return { ok: false, reason: "That is not a valid transfer code." };
    const incoming = sanitizeHistory(
      rows.slice(0, HISTORY_CAP * 2).map((r) =>
        Array.isArray(r) && r.length === 4
          ? {
              code: r[0],
              game: r[1],
              won: r[2] === 1 ? true : r[2] === 0 ? false : r[2],
              at: r[3],
            }
          : null,
      ),
    );
    if (incoming.length === 0) return { ok: false, reason: "That code has no games in it." };
    const cur = getHistory();
    const have = new Set(cur.map(keyOf));
    const fresh = incoming.filter((e) => !have.has(keyOf(e)));
    if (fresh.length > 0) {
      write(sanitizeHistory([...cur, ...fresh].sort((a, b) => a.at - b.at)));
    }
    return { ok: true, added: fresh.length };
  } catch {
    return { ok: false, reason: "That is not a valid transfer code." };
  }
}

export function clearHistory(): void {
  write([]);
}

export function historyTotals(h: readonly HistoryEntry[] = getHistory()): {
  wins: number;
  losses: number;
} {
  const wins = h.filter((e) => e.won).length;
  return { wins, losses: h.length - wins };
}

export function onHistory(cb: Listener): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** Test helper: drop the in-memory copy and listeners. */
export function _resetHistoryForTests(): void {
  memory = null;
  listeners.clear();
}

/** Live wins/losses for this device. */
export function useHistoryTotals(): { wins: number; losses: number } {
  const [t, setT] = useState(() => historyTotals());
  useEffect(() => {
    setT(historyTotals());
    return onHistory(() => setT(historyTotals()));
  }, []);
  return t;
}
