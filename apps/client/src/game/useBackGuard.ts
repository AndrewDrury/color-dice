import { useEffect, useRef } from "preact/hooks";
import { resyncUrl } from "../router";

/** Push one history entry so Back / swipe-back asks before leaving (H10). */
export function useBackGuard(onBack: () => void) {
  const cb = useRef(onBack);
  cb.current = onBack;
  useEffect(() => {
    const push = () => {
      try {
        globalThis.history.pushState({ cdGuard: true }, "");
      } catch {
        // No history (tests, sandboxed frames).
      }
    };
    push();
    const on = () => {
      push();
      cb.current();
    };
    globalThis.addEventListener("popstate", on);
    return () => {
      globalThis.removeEventListener("popstate", on);
      // Pop our extra entry so Back works normally on Home, then restore the URL it exposes.
      try {
        if ((globalThis.history.state as { cdGuard?: boolean } | null)?.cdGuard) {
          globalThis.addEventListener("popstate", resyncUrl, { once: true });
          globalThis.history.back();
        }
      } catch {
        // No history (tests, sandboxed frames).
      }
    };
  }, []);
}
