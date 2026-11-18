/**
 * Test-only hooks (E-testing): scripted dice and an injectable clock.
 * Everything here is inert unless `env.ALLOW_TEST_HOOKS === "1"`, which is set
 * only in the git-ignored `.dev.vars` / test config, never in wrangler.jsonc.
 */
import { CryptoDice, type DiceSource, type Face, isFace } from "@cd/engine";

export const DICE_KEY = "testDice";
export const CLOCK_KEY = "testClockMs";
/** Caps for hook payloads so a test hook can't bloat storage. */
export const MAX_TEST_FACES = 500;
export const MAX_ADVANCE_MS = 30 * 24 * 60 * 60_000;

export function hooksEnabled(env: { ALLOW_TEST_HOOKS?: string }): boolean {
  return env.ALLOW_TEST_HOOKS === "1";
}

/** Rolls queued faces first, then falls back to crypto dice. */
export class QueuedDice implements DiceSource {
  private fallback: CryptoDice | null = null;

  constructor(readonly faces: Face[]) {}

  rollDie(): Face {
    const f = this.faces.shift();
    if (f !== undefined) return f;
    this.fallback ??= new CryptoDice();
    return this.fallback.rollDie();
  }
}

export interface RoomDice {
  dice: DiceSource;
  /** Persists the faces still queued (no-op without hooks). */
  save(): Promise<void>;
}

/** Dice for one operation: scripted faces from storage when hooks are on. */
export async function loadDice(
  env: { ALLOW_TEST_HOOKS?: string },
  storage: DurableObjectStorage,
): Promise<RoomDice> {
  if (!hooksEnabled(env)) return { dice: new CryptoDice(), save: async () => {} };
  const stored = (await storage.get<number[]>(DICE_KEY)) ?? [];
  const q = new QueuedDice(stored.filter(isFace));
  return {
    dice: q,
    save: async () => {
      if (q.faces.length > 0) await storage.put(DICE_KEY, q.faces);
      else await storage.delete(DICE_KEY);
    },
  };
}

/** Dice for `start`: an explicit scripted override (hooks only), else `loadDice`. */
export async function startDice(
  env: { ALLOW_TEST_HOOKS?: string },
  storage: DurableObjectStorage,
  override?: number[],
): Promise<RoomDice> {
  if (hooksEnabled(env) && override?.every(isFace)) {
    return { dice: new QueuedDice([...override]), save: async () => {} };
  }
  return loadDice(env, storage);
}

/** Stores a hook's effect; returns the new clock offset. Callers check `hooksEnabled` first. */
export async function applyTestHook(
  storage: DurableObjectStorage,
  input: TestHookInput,
  clockOffsetMs: number,
): Promise<number> {
  if (input.kind === "dice") {
    const queued = (await storage.get<number[]>(DICE_KEY)) ?? [];
    await storage.put(DICE_KEY, [...queued, ...input.faces].slice(-MAX_TEST_FACES));
    return clockOffsetMs;
  }
  const next = clockOffsetMs + input.advanceMs;
  await storage.put(CLOCK_KEY, next);
  return next;
}

/** Body of `POST /api/games/:code/__test/dice` and `/__test/clock`. */
export type TestHookInput = { kind: "dice"; faces: Face[] } | { kind: "clock"; advanceMs: number };

/** Hand-written validation (the server has no direct zod dependency). */
export function parseTestHook(kind: string, body: unknown): TestHookInput | null {
  if (body === null || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (kind === "dice" && Object.keys(b).length === 1 && Array.isArray(b.faces)) {
    const faces = b.faces;
    if (faces.length > MAX_TEST_FACES || !faces.every(isFace)) return null;
    return { kind: "dice", faces: faces as Face[] };
  }
  if (kind === "clock" && Object.keys(b).length === 1) {
    const ms = b.advanceMs;
    if (typeof ms !== "number" || !Number.isInteger(ms) || ms < 0 || ms > MAX_ADVANCE_MS)
      return null;
    return { kind: "clock", advanceMs: ms };
  }
  return null;
}

/** Matches `POST /api/games/:code/__test/(dice|clock)`; returns the raw code and kind. */
export function matchTestHook(
  method: string,
  pathname: string,
): { code: string; kind: "dice" | "clock" } | null {
  const m = /^\/api\/games\/([^/]+)\/__test\/(dice|clock)$/.exec(pathname);
  if (method !== "POST" || !m) return null;
  return { code: m[1] as string, kind: m[2] as "dice" | "clock" };
}
