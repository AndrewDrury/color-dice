import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createUpdater } from "../src/update";

const live = (build: string | null) =>
  vi.fn(async () =>
    build === null
      ? Promise.reject(new Error("offline"))
      : ({ ok: true, json: async () => ({ build }) } as Response),
  ) as unknown as typeof fetch;

function make(over: Parameters<typeof createUpdater>[0] = {}) {
  const reload = vi.fn();
  const u = createUpdater({
    build: "old",
    reload,
    busy: () => false,
    celebrating: () => false,
    ...over,
  });
  return { u, reload };
}

beforeEach(() => {
  vi.useFakeTimers();
  sessionStorage.clear();
  history.replaceState(null, "", "/color-dice/?game=ABCD#frag");
});
afterEach(() => vi.useRealTimers());

describe("auto update", () => {
  it("does nothing when the build is the same", async () => {
    const { u, reload } = make({ fetchFn: live("old") });
    await u.check();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(reload).not.toHaveBeenCalled();
  });

  it("reloads once with ?v= and keeps path, query and fragment", async () => {
    const { u, reload } = make({ fetchFn: live("new1") });
    await u.check();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(reload).toHaveBeenCalledTimes(1);
    const url = new URL(reload.mock.calls[0]?.[0] as string);
    expect(url.pathname).toBe("/color-dice/");
    expect(url.searchParams.get("v")).toBe("new1");
    expect(url.searchParams.get("game")).toBe("ABCD");
    expect(url.hash).toBe("#frag");
  });

  it("sends a cache-busting no-store request", async () => {
    const fetchFn = live("old");
    await make({ fetchFn }).u.check();
    const [url, init] = (fetchFn as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(url).toMatch(/version\.json\?t=\d+/);
    expect(init.cache).toBe("no-store");
  });

  it("waits while busy (staged marks) and reloads once idle", async () => {
    let busy = true;
    const { u, reload } = make({ fetchFn: live("new1"), busy: () => busy });
    await u.check();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(reload).not.toHaveBeenCalled();
    busy = false;
    await vi.advanceTimersByTimeAsync(2000);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("holds 15 s for the winner celebration", async () => {
    let cel = true;
    const { u, reload } = make({ fetchFn: live("new1"), celebrating: () => cel });
    await u.check();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(reload).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(6000);
    expect(reload).toHaveBeenCalledTimes(1);
    cel = false;
  });

  it("fails silently on network errors and bad bodies", async () => {
    const a = make({ fetchFn: live(null) });
    await expect(a.u.check()).resolves.toBeUndefined();
    const bad = vi.fn(async () => ({ ok: true, json: async () => ({ build: "<x>" }) }) as Response);
    const b = make({ fetchFn: bad as unknown as typeof fetch });
    await b.u.check();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(a.reload).not.toHaveBeenCalled();
    expect(b.reload).not.toHaveBeenCalled();
  });

  it("stops after 3 tries when the CDN keeps serving the old build", async () => {
    const reload = vi.fn();
    for (let i = 0; i < 5; i++) {
      const u = createUpdater({
        build: "old",
        reload,
        fetchFn: live("new1"),
        busy: () => false,
        celebrating: () => false,
      });
      await u.check();
      await vi.advanceTimersByTimeAsync(30_000);
    }
    expect(reload).toHaveBeenCalledTimes(3);
  });
});
