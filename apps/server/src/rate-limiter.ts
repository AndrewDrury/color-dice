import { DurableObject } from "cloudflare:workers";
import { RATE_LIMITS, type RateLimitAction } from "@cd/protocol";
import type { Env } from "./env";
import { LIMIT_BUCKET, type LimitedAction, type LimitResult } from "./router-lobby";

interface Window {
  start: number;
  count: number;
}

const STORAGE_KEY = "windows";

/**
 * Per-IP fixed-window counters (C3), one instance per `idFromName(ip)`.
 * State lives in memory and in storage; an alarm deletes expired windows.
 */
export class RateLimiter extends DurableObject<Env> {
  private windows = new Map<RateLimitAction, Window>();
  private alarmAt: number | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    void ctx.blockConcurrencyWhile(async () => {
      const saved = await ctx.storage.get<[RateLimitAction, Window][]>(STORAGE_KEY);
      this.windows = new Map(saved ?? []);
      this.alarmAt = await ctx.storage.getAlarm();
    });
  }

  /** Test seam: the clock. */
  protected now(): number {
    return Date.now();
  }

  async limit(action: LimitedAction): Promise<LimitResult> {
    if (!Object.hasOwn(LIMIT_BUCKET, action)) throw new Error("unknown rate-limit action");
    const bucket = LIMIT_BUCKET[action];
    const { limit, windowMs } = RATE_LIMITS[bucket];
    const now = this.now();

    let w = this.windows.get(bucket);
    let started = false;
    if (!w || now >= w.start + windowMs) {
      w = { start: now, count: 0 };
      this.windows.set(bucket, w);
      started = true;
    }
    const end = w.start + windowMs;
    if (w.count >= limit) {
      return { ok: false, retryAfterSec: Math.max(1, Math.ceil((end - now) / 1000)) };
    }
    w.count++;
    // Counters stay in memory; storage is touched only when a window starts.
    if (started) {
      await this.ctx.storage.put(STORAGE_KEY, [...this.windows]);
      if (this.alarmAt === null || this.alarmAt > end) {
        this.alarmAt = end;
        await this.ctx.storage.setAlarm(end);
      }
    }
    return { ok: true, retryAfterSec: 0 };
  }

  override async alarm(): Promise<void> {
    const now = this.now();
    let next: number | null = null;
    for (const [bucket, w] of this.windows) {
      const end = w.start + RATE_LIMITS[bucket].windowMs;
      if (now >= end) this.windows.delete(bucket);
      else next = next === null ? end : Math.min(next, end);
    }
    this.alarmAt = next;
    if (next === null) {
      await this.ctx.storage.deleteAll();
      return;
    }
    await this.ctx.storage.put(STORAGE_KEY, [...this.windows]);
    await this.ctx.storage.setAlarm(next);
  }
}
