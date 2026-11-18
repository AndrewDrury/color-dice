/** Screen Wake Lock (H10): held while `active`, re-acquired when the tab becomes visible. */
import { useEffect } from "preact/hooks";

interface Sentinel {
  release(): Promise<void>;
}

/** Request the lock; returns a release function. Silent when unsupported or refused. */
export function holdWakeLock(): () => void {
  let sentinel: Sentinel | null = null;
  let stopped = false;

  const acquire = async () => {
    try {
      const wl = (
        navigator as Navigator & { wakeLock?: { request(t: "screen"): Promise<Sentinel> } }
      ).wakeLock;
      if (!wl || typeof wl.request !== "function") return;
      const s = await wl.request("screen");
      if (stopped) {
        await s.release().catch(() => {});
        return;
      }
      sentinel = s;
    } catch {
      // Denied (low battery, hidden tab): the game works without it.
    }
  };

  const onVisible = () => {
    if (document.visibilityState === "visible" && !stopped) void acquire();
  };
  document.addEventListener("visibilitychange", onVisible);
  void acquire();

  return () => {
    stopped = true;
    document.removeEventListener("visibilitychange", onVisible);
    const s = sentinel;
    sentinel = null;
    s?.release().catch(() => {});
  };
}

export function useWakeLock(active: boolean): void {
  useEffect(() => (active ? holdWakeLock() : undefined), [active]);
}
