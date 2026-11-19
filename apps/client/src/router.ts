import { GameCodeSchema } from "@cd/protocol";
import { useEffect, useState } from "preact/hooks";
import { isInviteHash, parseInviteHash } from "./invite";
import { getSession } from "./session";

export type Screen = "home" | "create" | "join" | "invite" | "reclaim" | "waiting" | "game";

export interface Route {
  screen: Screen;
  /** Game code for join / reclaim / waiting / game. */
  code: string | null;
}

const GAME_PARAM = "game";
const NEEDS_CODE: ReadonlySet<Screen> = new Set(["join", "invite", "reclaim", "waiting", "game"]);

/** Read and validate `?game=CODE` (case-insensitive input, canonical upper case). */
export function readGameCode(search: string): string | null {
  const raw = new URLSearchParams(search).get(GAME_PARAM);
  if (raw === null) return null;
  const code = raw.trim().toUpperCase();
  return GameCodeSchema.safeParse(code).success ? code : null;
}

/**
 * The invite key from `#/join/<CODE>/<key>`, held in memory only until the tab leaves the
 * invite screen. Never stored, logged or put back in the URL (K2.1).
 */
let pendingInvite: { code: string; key: string } | null = null;

export function getPendingInvite(code: string): string | null {
  return pendingInvite?.code === code ? pendingInvite.key : null;
}

/** The first screen for a URL: an invite link, a saved seat resumes, a bare code goes to Join. */
export function initialRoute(search: string, hash = ""): Route {
  const inv = parseInviteHash(hash);
  if (inv) return { screen: getSession(inv.code) ? "waiting" : "invite", code: inv.code };
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
    url.searchParams.delete("v"); // auto-update cache-bust param (T-UX-18)
    if (url.href !== globalThis.location.href) globalThis.history.replaceState(null, "", url);
  } catch {
    // No location/history (tests, sandboxed frames): the in-memory route still works.
  }
}

/** Drop the fragment (the invite key) from the address bar and history at once. */
function stripFragment(): void {
  try {
    const url = new URL(globalThis.location.href);
    if (url.hash === "") return;
    url.hash = "";
    globalThis.history.replaceState(null, "", url);
  } catch {
    // No location/history (tests, sandboxed frames).
  }
}

/** Re-apply `?game=` for the current route (after history moved under us). */
export function resyncUrl(): void {
  syncUrl(route.code);
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
  if (route.screen !== "invite") pendingInvite = null;
  syncUrl(route.code);
  for (const cb of listeners) cb(route);
}

/** Take an invite link out of the fragment: keep the key in memory, strip the URL, pick a screen. */
function consumeFragment(hash: string): Route | null {
  if (!isInviteHash(hash)) return null;
  const inv = parseInviteHash(hash);
  stripFragment();
  if (!inv) return { screen: "home", code: null };
  const r = initialRoute("", hash);
  pendingInvite = r.screen === "invite" ? inv : null;
  return r;
}

let hashListening = false;

export function startRouter(): Route {
  const loc = globalThis.location;
  const fromHash = consumeFragment(loc?.hash ?? "");
  route = fromHash ?? initialRoute(loc?.search ?? "");
  syncUrl(route.code);
  if (!hashListening && typeof globalThis.addEventListener === "function") {
    hashListening = true;
    // An invite link opened in a tab that is already running the app.
    globalThis.addEventListener("hashchange", () => {
      const r = consumeFragment(globalThis.location.hash);
      if (r) navigate(r.screen, r.code);
    });
  }
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
