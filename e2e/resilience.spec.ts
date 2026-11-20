import { codeOf, createGame, expect, joinGame, pass, queueDice, startGame, test } from "./fixtures";
import {
  closeAll,
  controlNetwork,
  newPlayer,
  roll,
  rollFaces,
  tapUntil,
  uid,
  waitForRoller,
} from "./helpers";

async function startTwo(browser: Parameters<typeof newPlayer>[0], tag: string, fakeClock = false) {
  const a = await newPlayer(browser, "Rhea");
  const b = await newPlayer(browser, "Rory");
  // Page timers (the reconnect backoff) can be fast-forwarded instead of slept through.
  if (fakeClock) await b.page.clock.install();
  const net = await controlNetwork(b);
  const code = await createGame(a, {
    roomName: `${tag} ${uid()}`,
    password: "pw-resil",
    max: 2,
  });
  await queueDice(code, [6, 1, ...rollFaces(7)]); // Rhea starts; white sum 7
  await joinGame(b, code, "pw-resil");
  await startGame(a);
  expect(await waitForRoller([a, b])).toBe(a);
  await roll(a.page);
  return { a, b, code, net };
}

test("reload mid-ACTION_1 restores the same seat and phase", async ({ browser }) => {
  const { a, b } = await startTwo(browser, "Reload");
  try {
    await expect(b.page.locator(".g-submit")).toBeVisible();
    const code = codeOf(b.page);
    await b.page.reload();
    expect(codeOf(b.page)).toBe(code);
    await expect(b.page.locator(".g-main")).toBeVisible();
    await expect(b.page.locator("[data-die][data-face]").first()).toBeVisible();
    await expect(b.page.locator(".g-submit")).toBeVisible();
    await expect(b.page.locator(".g-code")).toContainText("Turn 1");
    // Still Rory's seat: his pass is accepted.
    await tapUntil(b.page.locator(".g-submit"), b.page.getByText(/Waiting/).first());
  } finally {
    await closeAll([a, b]);
  }
});

test("offline for 20 s: banner shows, then the game resumes", async ({ browser }) => {
  test.setTimeout(120_000);
  const { a, b, net } = await startTwo(browser, "Offline", true);
  try {
    await net.goOffline();
    await expect(b.page.getByTestId("conn-banner")).toHaveText("Reconnecting…", {
      timeout: 15_000,
    });
    await b.page.clock.runFor(20_000); // 20 s of client time (backoff attempts) at once
    await net.goOnline();
    await expect(b.page.getByTestId("conn-banner")).toHaveText("Back online", { timeout: 40_000 });
    await expect(b.page.locator(".g-conn.is-online")).toBeVisible();
    // The game resumes: Rory can still act, and the turn completes.
    await pass(b.page);
    await pass(a.page); // Rhea's one Submit -> turn 2: Rory rolls
    expect(await waitForRoller([a, b])).toBe(b);
  } finally {
    await closeAll([a, b]);
  }
});

test("reclaim in a new context ends the old session", async ({ browser }) => {
  test.setTimeout(120_000);
  const { a, b, code } = await startTwo(browser, "Reclaim");
  const b2 = await newPlayer(browser, "Rory");
  try {
    // The old device goes dark (the page unloads, its socket closes). A seat must be offline
    // to be reclaimed. Chromium's setOffline cannot close the server's end of an open socket,
    // so the unload stands in for the lost connection.
    await b.page.goto("about:blank");
    await expect(a.page.getByTestId("paused-banner")).toContainText("Rory"); // seat is offline

    await b2.page.goto(`/?game=${code}`);
    await b2.page.getByRole("button", { name: "Reclaim my seat" }).click();
    await b2.page.getByLabel("Your name").fill("Rory");
    await b2.page.getByLabel("Password", { exact: true }).fill("pw-resil");
    await b2.page.getByRole("button", { name: "Reclaim seat" }).click();
    await expect(b2.page.locator(".g-main")).toBeVisible();

    // The old device comes back: its token is dead.
    await b.page.goto(`/?game=${code}`);
    await expect(b.page.getByText(/session ended/i)).toBeVisible({ timeout: 20_000 });
    await expect(b.page.getByRole("button", { name: "Create game" }).first()).toBeVisible();
  } finally {
    await closeAll([a, b, b2]);
  }
});
