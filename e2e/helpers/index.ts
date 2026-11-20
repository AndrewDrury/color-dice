import type { Browser, Locator } from "@playwright/test";
import { autoDismissRollOff, expect, type Player, SERVER } from "../fixtures";

/**
 * Taps `tap` until `done` shows. A tap while the game socket is (re)connecting after a reload or
 * the lobby -> game hand-over is dropped by the client, so one click is not enough under load.
 */
export async function tapUntil(tap: Locator, done: Locator): Promise<void> {
  await expect(async () => {
    if (await tap.isVisible()) await tap.click({ timeout: 2000 });
    await expect(done).toBeVisible({ timeout: 4000 });
  }).toPass({ timeout: 25_000, intervals: [100] });
}

/** Resolves after `n` animation frames (a deterministic "let the page render" instead of a sleep). */
export function frames(page: Player["page"], n = 2): Promise<void> {
  return page.evaluate(async (count) => {
    for (let i = 0; i < count; i++) await new Promise((r) => requestAnimationFrame(r));
  }, n);
}

/** Layout/transitions done: two frames, then no finite CSS/Web animation is still running. */
export async function settle(page: Player["page"]): Promise<void> {
  await frames(page, 2);
  await page.waitForFunction(() =>
    document
      .getAnimations()
      .every(
        (a) =>
          a.playState !== "running" ||
          a.effect?.getComputedTiming().iterations === Number.POSITIVE_INFINITY,
      ),
  );
}

/** Short random suffix so every test's rooms have names no other test (or worker) uses. */
export function uid(): string {
  // Four digits keeps names as short as the old `Date.now() % 10000` (layout specs measure them).
  return String(Math.floor(Math.random() * 10_000)).padStart(4, "0");
}

/** A unique fake client IP (the server rate-limits per CF-Connecting-IP; "local" is shared). */
export function uniqueIp(): string {
  const r = () => Math.floor(Math.random() * 256);
  return `10.${r()}.${r()}.${r()}`;
}

/**
 * Like fixtures.newPlayer, but every HTTP request to the API carries its own
 * CF-Connecting-IP, so specs do not exhaust the shared per-IP create/join limits.
 */
export async function newPlayer(browser: Browser, name: string, ip = uniqueIp()): Promise<Player> {
  const context = await browser.newContext();
  await context.route(`${SERVER}/**`, (route) =>
    route.continue({ headers: { ...route.request().headers(), "cf-connecting-ip": ip } }),
  );
  // WebSocket upgrades bypass context.route; the extra header covers them (per-IP wsConnect
  // limit is 30/min, which a whole run on one shared IP would exhaust).
  await context.setExtraHTTPHeaders({ "cf-connecting-ip": ip });
  const page = await context.newPage();
  await autoDismissRollOff(page);
  return { context, page, name };
}

export async function closeAll(players: Player[]) {
  await Promise.all(players.map((p) => p.context.close().catch(() => {})));
}

/** Waits for the game-over results dialog. */
export async function expectGameOver(page: Player["page"]) {
  await expect(page.getByRole("dialog", { name: "Results" })).toBeVisible({ timeout: 20_000 });
}

/** name -> total score, read from the results table. */
export async function finalScores(page: Player["page"]): Promise<Record<string, number>> {
  // The totals count up; wait until they settle on their data-value.
  const rows = page.locator(".g-results tbody tr");
  const n = await rows.count();
  const out: Record<string, number> = {};
  for (let i = 0; i < n; i++) {
    const row = rows.nth(i);
    const name = (await row.locator(".g-name").innerText()).trim();
    const total = Number(await row.locator(".g-total-cell .num").getAttribute("data-value"));
    out[name] = total;
  }
  return out;
}

/** Reads the turn's active player: the page that shows the Roll button. */
export async function waitForRoller(players: Player[]): Promise<Player> {
  let found: Player | undefined;
  await expect
    .poll(
      async () => {
        for (const p of players) {
          if (await p.page.locator(".g-primary", { hasText: "Roll" }).isVisible()) {
            found = p;
            return true;
          }
        }
        return false;
      },
      { timeout: 15_000, intervals: [50, 100, 250] },
    )
    .toBe(true);
  return found as Player;
}

/** A white pair that sums to `s` (2..12). */
export function whitePair(s: number): [number, number] {
  const a = Math.min(6, s - 1);
  return [s - a, a];
}

/** Scripted faces for one roll: two whites (summing to `sum`) then `colors` colored dice (all 1). */
export function rollFaces(sum: number, colors = 4): number[] {
  return [...whitePair(sum), ...Array<number>(colors).fill(1)];
}

/**
 * fixtures.roll never resolves once a row is locked: removed dice have no data-face.
 * Same as roll(), but ignores `.is-removed` dice.
 */
export async function roll(page: Player["page"]) {
  // The waiting room hands over to the game screen with a fresh socket; a tap while it is still
  // (re)connecting is dropped silently. Tap again until the dice appear (a tap after the roll
  // landed is impossible: the Roll button is gone).
  const rollBtn = page.locator(".g-primary", { hasText: "Roll" });
  await expect(async () => {
    if ((await rollBtn.isVisible()) && (await rollBtn.isEnabled())) {
      await rollBtn.click({ timeout: 2000 });
    }
    await expect(page.locator("[data-die][data-face]").first()).toBeVisible({ timeout: 4000 });
  }).toPass({ timeout: 25_000, intervals: [100] });
  // A tap on the tray skips the landing animation (a product feature): the end state is the
  // same, so the helper does not sit through 6 x 400 ms of it. Specs that time the dice tap Roll themselves.
  await page.locator(".tray").dispatchEvent("click");
  await expect
    .poll(() => page.locator("[data-die]:not(.is-removed):not([data-face])").count())
    .toBe(0);
  // D-L9: dice land one at a time, 400 ms apart; the tray is `data-settled` after the last.
  await expect(page.locator(".tray[data-settled]")).toBeVisible();
}

export interface NetControl {
  /** Network down: `setOffline(true)` plus an explicit drop of the open game socket(s). */
  goOffline(): Promise<void>;
  goOnline(): Promise<void>;
}

/**
 * Chromium's `setOffline` does not tear down an already-open WebSocket, so the client
 * would never notice. This pairs `setOffline` with a routed game socket we can sever,
 * and refuses new game sockets while "offline". Call it before the first navigation.
 */
export async function controlNetwork(player: Player): Promise<NetControl> {
  let offline = false;
  // Every real server leg still open. The page closing its (mock) side does NOT close the
  // server leg, and the client reopens its socket on remounts, so a stale leg keeps the seat
  // "online" on the server: track the legs themselves and close them all.
  const open = new Set<{ ready: Promise<void>; close: () => Promise<void> }>();
  await player.page.routeWebSocket(/\/ws\/game\//, (ws) => {
    if (offline) {
      ws.close();
      return;
    }
    const server = ws.connectToServer();
    let serverClosed: () => void = () => {};
    const closed = new Promise<void>((resolve) => {
      serverClosed = resolve;
    });
    // The first server frame (the view) means the leg is authenticated: the server only knows
    // the seat is online from then on. The client also reconnects once when the game starts,
    // so a leg dropped before this point is not yet "a connected player going away".
    let authed: () => void = () => {};
    const ready = new Promise<void>((resolve) => {
      authed = resolve;
    });
    // A server onMessage handler replaces the automatic forwarding, so forward by hand.
    server.onMessage((m) => {
      authed();
      ws.send(m);
    });
    const leg = {
      ready,
      // Resolves once the server has acknowledged, i.e. the Durable Object really saw the
      // socket go away (bounded, never hangs the test).
      close: async () => {
        // No explicit code on the server leg: with `{ code: 1001 }` the close was never
        // acknowledged by the dev server (seat stayed online, nothing paused).
        server.close();
        ws.close({ code: 1001 });
        await Promise.race([closed, new Promise<void>((r) => setTimeout(r, 3_000))]);
      },
    };
    open.add(leg);
    server.onClose(() => {
      open.delete(leg);
      serverClosed();
    });
  });
  return {
    async goOffline() {
      offline = true;
      // Sever first, THEN cut the network: with the context already offline the close frame
      // would never leave the browser and the server would keep the seat online.
      const legs = [...open];
      await Promise.all(
        legs.map((l) => Promise.race([l.ready, new Promise<void>((r) => setTimeout(r, 5_000))])),
      );
      await Promise.all(legs.map((l) => l.close()));
      await player.context.setOffline(true);
    },
    async goOnline() {
      offline = false;
      await player.context.setOffline(false);
    },
  };
}
