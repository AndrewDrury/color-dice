/// <reference types="@cloudflare/vitest-plugin/types" />

import { runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import type { RateLimiter } from "../src/rate-limiter";
import { clientIp, rateLimit } from "../src/router-lobby";

const BASE = "https://worker.test";

function limiter(name: string) {
  return env.RATE_LIMITER.get(env.RATE_LIMITER.idFromName(name));
}

function setClock(rl: RateLimiter, t: { now: number }): void {
  (rl as unknown as { now: () => number }).now = () => t.now;
}

describe("RateLimiter DO", () => {
  it("6th join within 60 s is refused; after the window it is ok again", async () => {
    await runInDurableObject(limiter("1.1.1.1"), async (rl: RateLimiter) => {
      const t = { now: 5_000_000 };
      setClock(rl, t);
      for (let i = 0; i < 5; i++) expect((await rl.limit("join")).ok).toBe(true);
      t.now += 10_000;
      expect(await rl.limit("join")).toEqual({ ok: false, retryAfterSec: 50 });
      // reclaim shares the join bucket (defaults.md: "join+reclaim 5/min").
      expect((await rl.limit("reclaim")).ok).toBe(false);
      // Other actions have their own buckets.
      expect((await rl.limit("list")).ok).toBe(true);
      t.now += 50_000;
      expect(await rl.limit("join")).toEqual({ ok: true, retryAfterSec: 0 });
    });
  });

  it("create allows 5 per 10 min", async () => {
    await runInDurableObject(limiter("1.1.1.2"), async (rl: RateLimiter) => {
      const t = { now: 1_000 };
      setClock(rl, t);
      for (let i = 0; i < 5; i++) expect((await rl.limit("create")).ok).toBe(true);
      t.now += 9 * 60_000;
      expect((await rl.limit("create")).ok).toBe(false);
      t.now += 60_000;
      expect((await rl.limit("create")).ok).toBe(true);
    });
  });

  it("rejects unknown actions", async () => {
    await runInDurableObject(limiter("1.1.1.3"), async (rl: RateLimiter) => {
      await expect(rl.limit("nope" as "join")).rejects.toThrow();
    });
  });

  it("alarm clears expired windows from storage", async () => {
    const stub = limiter("1.1.1.4");
    await stub.limit("ws");
    await runInDurableObject(stub, async (rl: RateLimiter, state: DurableObjectState) => {
      expect(await state.storage.get("windows")).toHaveLength(1);
      expect(await state.storage.getAlarm()).not.toBeNull();
      setClock(rl, { now: Date.now() + 61_000 });
    });
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    await runInDurableObject(stub, async (_rl: RateLimiter, state: DurableObjectState) => {
      expect(await state.storage.get("windows")).toBeUndefined();
      expect(await state.storage.getAlarm()).toBeNull();
    });
  });
});

describe("Worker rate limiting", () => {
  it("uses only CF-Connecting-IP, else 'local'", () => {
    const req = (h: Record<string, string>) => new Request(BASE, { headers: h });
    expect(clientIp(req({ "cf-connecting-ip": " 2.2.2.2 " }))).toBe("2.2.2.2");
    expect(clientIp(req({ "x-forwarded-for": "3.3.3.3", "x-real-ip": "4.4.4.4" }))).toBe("local");
  });

  it("61st GET /api/games in a minute → 429 E_RATE_LIMITED with Retry-After", async () => {
    const get = (xff: string) =>
      exports.default.fetch(
        new Request(`${BASE}/api/games`, {
          // A spoofed X-Forwarded-For must not create a fresh bucket.
          headers: { "cf-connecting-ip": "5.5.5.5", "x-forwarded-for": xff },
        }),
      );
    for (let i = 0; i < 60; i++) {
      const res = await get(`9.9.9.${i}`);
      expect(res.status).toBe(200);
      await res.body?.cancel();
    }
    const res = await get("8.8.8.8");
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ code: "E_RATE_LIMITED" });
    const retry = Number(res.headers.get("retry-after"));
    expect(retry).toBeGreaterThanOrEqual(1);
    expect(retry).toBeLessThanOrEqual(60);

    // A different IP is unaffected.
    const other = await exports.default.fetch(
      new Request(`${BASE}/api/games`, { headers: { "cf-connecting-ip": "6.6.6.6" } }),
    );
    expect(other.status).toBe(200);
    await other.body?.cancel();
  });

  it("rateLimit helper returns null when allowed and 429 when limited", async () => {
    const req = new Request(BASE, { headers: { "cf-connecting-ip": "7.7.7.7" } });
    for (let i = 0; i < 5; i++) expect(await rateLimit(env, req, "join")).toBeNull();
    const res = await rateLimit(env, req, "join");
    expect(res?.status).toBe(429);
    expect(res?.headers.get("retry-after")).toMatch(/^\d+$/);
    await res?.body?.cancel();
  });
});
