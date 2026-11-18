import { RECONNECT } from "@cd/protocol";

/**
 * Delay before reconnect attempt `attempt` (0-based): 0.5 s, 1 s, 2 s, 4 s, 8 s, 8 s, …
 * with ±20 % jitter so many clients don't reconnect in lockstep.
 */
export function backoffDelay(attempt: number, random: () => number = Math.random): number {
  const base = Math.min(RECONNECT.initialMs * RECONNECT.factor ** attempt, RECONNECT.maxMs);
  const jitter = 1 + RECONNECT.jitter * (2 * random() - 1);
  return Math.round(base * jitter);
}
