import { GameCodeSchema } from "@cd/protocol";
import { useEffect, useState } from "preact/hooks";
import { getSession } from "./session";

export type Screen = "home" | "create" | "join" | "reclaim" | "waiting" | "game";

export interface Route {
  screen: Screen;
  /** Game code for join / reclaim / waiting / game. */
  code: string | null;
}

const GAME_PARAM = "game";
const NEEDS_CODE: ReadonlySet<Screen> = new Set(["join", "reclaim", "waiting", "game"]);

/** Read and validate `?game=CODE` (case-insensitive input, canonical upper case). */
export function readGameCode(search: string): string | null {
  const raw = new URLSearchParams(search).get(GAME_PARAM);
  if (raw === null) return null;
  const code = raw.trim().toUpperCase();
  return GameCodeSchema.safeParse(code).success ? code : null;
}

/** The first screen for a URL: a saved seat resumes, a bare code goes to Join. */
export function initialRoute(search: string): Route {
  const code = readGameCode(search);
  if (code === null) return { screen: "home", code: null };
  return { screen: getSession(code) ? "waiting" : "join", code };
}

let route: Route = { screen: "home", code: null };
const listeners = new Set<(r: Route) => void>();

export function getRoute(): Route {
  return route;
}

/** Keep `?game=` in sync with the route, preserving the base path and other params. */
function syncUrl(code: string | null): void {
  try {
    const url = new URL(globalThis.location.href);
    if (code) url.searchParams.set(GAME_PARAM, code);
    else url.searchParams.delete(GAME_PARAM);
    if (url.href !== globalThis.location.href) globalThis.history.replaceState(null, "", url);
  } catch {
    // No location/history (tests, sandboxed frames): the in-memory route still works.
  }
}

export function navigate(screen: Screen, code: string | null = null): void {
  const nextCode = NEEDS_CODE.has(screen) ? code : null;
  if (
    NEEDS_CODE.has(screen) &&
    (nextCode === null || !GameCodeSchema.safeParse(nextCode).success)
  ) {
    route = { screen: "home", code: null };
  } else {
    route = { screen, code: nextCode };
  }
  syncUrl(route.code);
  for (const cb of listeners) cb(route);
}

export function startRouter(): Route {
  route = initialRoute(globalThis.location?.search ?? "");
  syncUrl(route.code);
  return route;
}

export function onRoute(cb: (r: Route) => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useRoute(): Route {
  const [r, setR] = useState(route);
  useEffect(() => {
    setR(route);
    return onRoute(setR);
  }, []);
  return r;
}
