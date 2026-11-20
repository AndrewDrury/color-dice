/**
 * Device-local game history (J5): which games this browser won, tied or lost. Never sent anywhere.
 * Stored in localStorage with an in-memory fallback; storage content is untrusted, so every
 * read is sanitized (shape, bounds, dedupe) and the list is capped at `HISTORY_CAP`.
 */
import {
  GameCodeSchema,
  PLAYER_NAME_MAX,
  PROFILE_CATS,
  PROFILE_COLORS,
  type ProfileCat,
  type ProfileColor,
} from "@cd/protocol";
import { useEffect, useState } from "preact/hooks";

export type GameResult = "W" | "T" | "L";

export interface HistoryOpponent {
  name: string;
  colour: ProfileColor;
  cat: ProfileCat;
  score: number;
}

export interface HistoryEntry {
  code: string;
  /** Game number in the room (your wins + ties + losses after this game); with `code` it is the dedupe key. */
  game: number;
  result: GameResult;
  /** Epoch ms. */
  at: number;
  /** Detailed shape; absent for legacy entries and result-only transfer codes. */
  opponents?: HistoryOpponent[];
  myScore?: number;
  players?: number;
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
    // Legacy entries stored a boolean `won`.
    const result: GameResult | null =
      r.result === "W" || r.result === "T" || r.result === "L"
        ? r.result
        : r.result === undefined && typeof r.won === "boolean"
          ? r.won
            ? "W"
            : "L"
          : null;
    if (result === null) continue;
    if (!Number.isSafeInteger(r.at) || (r.at as number) < 0) continue;
    const e: HistoryEntry = {
      code: r.code as string,
      game: r.game as number,
      result,
      at: r.at as number,
    };
    if (Array.isArray(r.opponents) && r.opponents.length <= 4) {
      const opponents: HistoryOpponent[] = [];
      for (const rawOpponent of r.opponents) {
        if (typeof rawOpponent !== "object" || rawOpponent === null) continue;
        const o = rawOpponent as Record<string, unknown>;
        if (
          typeof o.name !== "string" ||
          typeof o.colour !== "string" ||
          typeof o.cat !== "string" ||
          !PROFILE_COLORS.includes(o.colour as ProfileColor) ||
          !PROFILE_CATS.includes(o.cat as ProfileCat) ||
          !Number.isSafeInteger(o.score)
        )
          continue;
        const name = Array.from(o.name)
          .filter((ch) => ch.charCodeAt(0) >= 32 && ch.charCodeAt(0) !== 127)
          .join("")
          .slice(0, PLAYER_NAME_MAX);
        if (!name) continue;
        const score = Math.max(-1_000_000, Math.min(1_000_000, o.score as number));
        opponents.push({ name, colour: o.colour as ProfileColor, cat: o.cat as ProfileCat, score });
      }
      if (opponents.length === r.opponents.length) e.opponents = opponents;
    }
    if (Number.isSafeInteger(r.myScore)) {
      e.myScore = Math.max(-1_000_000, Math.min(1_000_000, r.myScore as number));
    }
    if (
      Number.isSafeInteger(r.players) &&
      (r.players as number) >= 2 &&
      (r.players as number) <= 5
    ) {
      e.players = r.players as number;
    }
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

const TRANSFER_PREFIX = "CD2.";
/** Legacy code version: carries won/lost (1/0) instead of W/T/L. Still accepted on import. */
const LEGACY_PREFIX = "CD1.";
/** 200 entries are ~14 KB of JSON; anything far beyond that is not one of our codes. */
const TRANSFER_MAX_CHARS = 40_000;

/** Compact, versioned text code for moving the record to another device. No names. */
export function exportTransferCode(): string {
  const detailed = getHistory().map((e) =>
    e.opponents && e.myScore !== undefined && e.players !== undefined
      ? [e.code, e.game, e.result, e.at, e.opponents, e.myScore, e.players]
      : [e.code, e.game, e.result, e.at],
  );
  let rows: unknown[] = detailed;
  const encode = (value: unknown[]) => btoa(JSON.stringify(value));
  let b64 = encode(rows);
  if (b64.length > TRANSFER_MAX_CHARS - TRANSFER_PREFIX.length) {
    rows = getHistory().map((e) => [e.code, e.game, e.result, e.at]);
    b64 = encode(rows);
  }
  return TRANSFER_PREFIX + b64.replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

export type ImportResult = { ok: true; added: number } | { ok: false; reason: "bad" | "empty" };

/** Strictly parses a transfer code and merges it into the history (dedupe by code + game). Never throws. */
export function importTransferCode(text: string): ImportResult {
  try {
    const t = String(text).trim();
    const legacy = t.startsWith(LEGACY_PREFIX);
    if ((!legacy && !t.startsWith(TRANSFER_PREFIX)) || t.length > TRANSFER_MAX_CHARS) {
      return { ok: false, reason: "bad" };
    }
    const b64 = t.slice(TRANSFER_PREFIX.length).replaceAll("-", "+").replaceAll("_", "/");
    const rows: unknown = JSON.parse(atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4)));
    if (!Array.isArray(rows)) return { ok: false, reason: "bad" };
    const incoming = sanitizeHistory(
      rows.slice(0, HISTORY_CAP * 2).map((r) =>
        Array.isArray(r) && (r.length === 4 || r.length === 7)
          ? {
              code: r[0],
              game: r[1],
              result: legacy ? (r[2] === 1 ? "W" : r[2] === 0 ? "L" : r[2]) : r[2],
              at: r[3],
              opponents: r.length === 7 ? r[4] : undefined,
              myScore: r.length === 7 ? r[5] : undefined,
              players: r.length === 7 ? r[6] : undefined,
            }
          : null,
      ),
    );
    if (incoming.length === 0) return { ok: false, reason: "empty" };
    // Clamp future timestamps so an imported code cannot pin entries at the top forever.
    // Note: room-code reuse can in rare cases collide on the `code:game` dedupe key (accepted).
    const maxAt = Date.now() + 86_400_000;
    for (const e of incoming) if (e.at > maxAt) e.at = maxAt;
    const cur = getHistory();
    const have = new Set(cur.map(keyOf));
    const fresh = incoming.filter((e) => !have.has(keyOf(e)));
    if (fresh.length > 0) {
      write(sanitizeHistory([...cur, ...fresh].sort((a, b) => a.at - b.at)));
    }
    return { ok: true, added: fresh.length };
  } catch {
    return { ok: false, reason: "bad" };
  }
}

export function clearHistory(): void {
  write([]);
}

export function historyTotals(h: readonly HistoryEntry[] = getHistory()): {
  wins: number;
  ties: number;
  losses: number;
} {
  const count = (r: GameResult) => h.filter((e) => e.result === r).length;
  return { wins: count("W"), ties: count("T"), losses: count("L") };
}

export function historyStats(h: readonly HistoryEntry[] = getHistory()) {
  const totals = historyTotals(h);
  const gamesPlayed = h.length;
  let streak = 0;
  let streakResult: GameResult | null = null;
  for (let i = h.length - 1; i >= 0; i--) {
    const result = h[i]?.result;
    if (!result) break;
    if (streakResult === null) streakResult = result;
    if (result !== streakResult) break;
    streak++;
  }
  const bestScore = h.reduce(
    (best, entry) => (entry.myScore !== undefined ? Math.max(best, entry.myScore) : best),
    0,
  );
  return {
    ...totals,
    gamesPlayed,
    winPercent: gamesPlayed === 0 ? 0 : Math.round((totals.wins / gamesPlayed) * 100),
    streak,
    streakResult,
    bestScore,
  };
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

/** Live wins/ties/losses for this device. */
export function useHistoryTotals(): {
  wins: number;
  ties: number;
  losses: number;
} {
  const [t, setT] = useState(() => historyTotals());
  useEffect(() => {
    setT(historyTotals());
    return onHistory(() => setT(historyTotals()));
  }, []);
  return t;
}
