/**
 * Auto-update (T-UX-18): poll `version.json`; when a newer build is live, reload this tab onto it
 * as soon as the player is idle. No service worker; the reload keeps path + hash and adds `?v=`
 * so a CDN-cached index.html cannot serve the old build again.
 */
import { t } from "./i18n";
import { showToast } from "./store";

export const BUILD_ID: string = typeof __BUILD_ID__ === "undefined" ? "dev" : __BUILD_ID__;

const POLL_MS = 60_000;
const IDLE_TICK_MS = 1000;
const WAIT_TOAST_MS = 5 * 60_000;
const CELEBRATION_HOLD_MS = 15_000;
const MAX_TRIES = 3;
const BACKOFF_MS = 5000;
const GUARD_KEY = "cd:upd";
const DONE_KEY = "cd:updated";
const BUILD_RE = /^[\w.-]{1,64}$/;

export interface UpdateEnv {
  build: string;
  fetchFn: typeof fetch;
  reload: (url: string) => void;
  now: () => number;
  /** True while a reload would lose input (staged marks, a focused text field). */
  busy: () => boolean;
  /** True while the winner celebration is on screen. */
  celebrating: () => boolean;
}

const defaultEnv = (): UpdateEnv => ({
  build: BUILD_ID,
  fetchFn: (...a) => fetch(...a),
  reload: (url) => globalThis.location.replace(url),
  now: () => Date.now(),
  busy: isBusy,
  celebrating: () => document.querySelector(".rv") !== null,
});

/** Staged marks (Box `is-staged`) or a focused text field/textarea. Read-only DOM probe. */
export function isBusy(): boolean {
  if (document.querySelector(".is-staged")) return true;
  const el = document.activeElement;
  if (!el) return false;
  if (el instanceof HTMLTextAreaElement) return true;
  if (el instanceof HTMLInputElement) {
    return !["button", "checkbox", "radio", "submit", "range"].includes(el.type);
  }
  return el instanceof HTMLElement && el.isContentEditable;
}

type Guard = { build: string; n: number };
function readGuard(): Guard | null {
  try {
    const g = JSON.parse(sessionStorage.getItem(GUARD_KEY) ?? "null") as Guard | null;
    return g && typeof g.build === "string" && typeof g.n === "number" ? g : null;
  } catch {
    return null;
  }
}
function store(key: string, value: string | null): void {
  try {
    if (value === null) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, value);
  } catch {
    // No storage: the loop guard then only holds within this page.
  }
}

/** Whether the "New version, updating..." toast is showing (waited too long for idle). */
let waitingToast = false;
const stateListeners = new Set<(v: boolean) => void>();
export function onUpdateWaiting(cb: (v: boolean) => void): () => void {
  stateListeners.add(cb);
  cb(waitingToast);
  return () => stateListeners.delete(cb);
}
function setWaiting(v: boolean): void {
  if (v === waitingToast) return;
  waitingToast = v;
  for (const cb of stateListeners) cb(v);
}

export function createUpdater(overrides: Partial<UpdateEnv> = {}) {
  const env = { ...defaultEnv(), ...overrides };
  let pending: string | null = null;
  let waitSince: number | null = null;
  let celebSince: number | null = null;
  let tick: ReturnType<typeof setInterval> | null = null;
  let applying = false;
  let inflight = false;

  const stopTick = () => {
    if (tick) clearInterval(tick);
    tick = null;
  };

  function apply(build: string): void {
    if (applying) return;
    const g = readGuard();
    const n = g?.build === build ? g.n : 0;
    if (n >= MAX_TRIES) {
      // CDN still serves the old build: stay quiet until the next fresh page load.
      pending = null;
      stopTick();
      setWaiting(false);
      return;
    }
    applying = true;
    store(GUARD_KEY, JSON.stringify({ build, n: n + 1 }));
    store(DONE_KEY, build);
    const url = new URL(globalThis.location.href);
    url.searchParams.set("v", build);
    setTimeout(() => env.reload(url.href), n * BACKOFF_MS);
  }

  function tryApply(): void {
    if (!pending || applying) return;
    const now = env.now();
    if (env.celebrating()) {
      celebSince ??= now;
      if (now - celebSince < CELEBRATION_HOLD_MS) {
        schedule();
        return;
      }
    } else celebSince = null;
    if (env.busy()) {
      waitSince ??= now;
      if (now - waitSince >= WAIT_TOAST_MS) setWaiting(true);
      schedule();
      return;
    }
    apply(pending);
  }

  function schedule(): void {
    tick ??= setInterval(tryApply, IDLE_TICK_MS);
  }

  /** Fetch version.json; resolves to the live build id or null (offline, bad body). */
  async function fetchBuild(): Promise<string | null> {
    try {
      const base = import.meta.env?.BASE_URL ?? "/";
      const res = await env.fetchFn(`${base}version.json?t=${env.now()}`, { cache: "no-store" });
      if (!res.ok) return null;
      const body: unknown = await res.json();
      const b = (body as { build?: unknown } | null)?.build;
      return typeof b === "string" && BUILD_RE.test(b) ? b : null;
    } catch {
      return null;
    }
  }

  async function check(): Promise<void> {
    if (inflight || applying) return;
    inflight = true;
    try {
      const live = await fetchBuild();
      if (live === null) return;
      if (live === env.build) {
        pending = null;
        stopTick();
        setWaiting(false);
        store(GUARD_KEY, null);
        // We just reloaded for an update and the live build confirms this page is current.
        if (readDone() !== null) showToast(t("update.done"));
        store(DONE_KEY, null);
        return;
      }
      pending = live;
      tryApply();
    } finally {
      inflight = false;
    }
  }

  /** A lazy chunk failed to load (stale index.html): reload onto the live build, same guard. */
  async function recover(): Promise<void> {
    if (pending) return;
    pending = (await fetchBuild()) ?? "recover"; // constant so the reload-loop guard applies
    tryApply();
  }

  return {
    check,
    recover,
    tryApply,
    get pending() {
      return pending;
    },
  };
}

let started = false;

/** Wire the checks to page lifecycle events. Call once after the app has rendered. */
export function startUpdates(overrides: Partial<UpdateEnv> = {}): ReturnType<typeof createUpdater> {
  const u = createUpdater(overrides);
  if (started) return u;
  started = true;
  const visible = () => document.visibilityState === "visible";
  const run = () => void u.check();
  run();
  document.addEventListener("visibilitychange", () => visible() && run());
  globalThis.addEventListener("focus", run);
  globalThis.addEventListener("online", run);
  setInterval(() => visible() && run(), POLL_MS);
  globalThis.addEventListener("vite:preloadError", (e) => {
    e.preventDefault();
    void u.recover();
  });
  globalThis.addEventListener("unhandledrejection", (e) => {
    const msg = String((e.reason as { message?: unknown } | null)?.message ?? e.reason);
    if (/dynamically imported module|Importing a module script failed/i.test(msg)) void u.recover();
  });
  /** Exposed so a socket "protocol mismatch" error can ask for an immediate check. */
  checkNowHook = run;
  return u;
}

let checkNowHook: (() => void) | null = null;
/** Ask for an immediate version check (server rejected us in a way a stale client would cause). */
export function checkForUpdateNow(): void {
  checkNowHook?.();
}

function readDone(): string | null {
  try {
    return sessionStorage.getItem(DONE_KEY);
  } catch {
    return null;
  }
}
