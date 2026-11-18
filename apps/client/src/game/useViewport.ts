import { useEffect, useState } from "preact/hooks";

export type Viewport = "phone" | "tablet" | "desktop";

export function viewportFor(width: number): Viewport {
  if (width < 600) return "phone";
  return width < 1024 ? "tablet" : "desktop";
}

/** H3 breakpoints, from `innerWidth` (JS decides which opponent layout is rendered at all). */
export function useViewport(): Viewport {
  const [v, setV] = useState(() => viewportFor(globalThis.innerWidth ?? 390));
  useEffect(() => {
    const on = () => setV(viewportFor(globalThis.innerWidth));
    on();
    globalThis.addEventListener("resize", on);
    return () => globalThis.removeEventListener("resize", on);
  }, []);
  return v;
}
