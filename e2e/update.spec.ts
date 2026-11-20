import type { Browser, Page } from "@playwright/test";
import { codeOf, createGame, expect, joinGame, queueDice, startGame, test } from "./fixtures";
import { closeAll, newPlayer, roll, rollFaces, uid, waitForRoller } from "./helpers";

const NEW_BUILD = "e2e-new-build";

/**
 * Intercepts version.json (never production): answers a new build until the page reloads itself
 * onto `?v=<build>`, then passes the real file through so the loop guard is not exercised.
 */
async function fakeDeploy(page: Page) {
  let live = false;
  await page.route("**/version.json*", (route) =>
    live
      ? route.fulfill({ json: { build: NEW_BUILD }, headers: { "cache-control": "no-store" } })
      : route.continue(),
  );
  page.on("request", (r) => {
    if (r.isNavigationRequest() && r.url().includes(`v=${NEW_BUILD}`)) live = false;
  });
  await page.evaluate(() => {
    (window as unknown as { __alive: boolean }).__alive = true;
  });
  return {
    publish: async () => {
      live = true;
      await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    },
    // A navigation destroys the execution context mid-evaluate: that also means "reloaded".
    survived: () =>
      page
        .evaluate(() => (window as unknown as { __alive?: boolean }).__alive === true)
        .catch(() => false),
  };
}

async function setup(browser: Browser, fakeClock = false) {
  const a = await newPlayer(browser, "Alma");
  if (fakeClock) await a.page.clock.install(); // lets a test fast-forward the idle ticks
  const b = await newPlayer(browser, "Boris");
  const code = await createGame(a, {
    roomName: `Upd ${uid()}`,
    password: "pw-upd",
    max: 2,
  });
  await queueDice(code, [6, 1, ...rollFaces(7)]);
  await joinGame(b, code, "pw-upd");
  await startGame(a);
  return { a, b, code };
}

test("an open tab reloads itself onto a new deploy and lands in the same seat", async ({
  browser,
}) => {
  test.setTimeout(90_000);
  const { a, b, code } = await setup(browser);
  try {
    await expect(a.page.locator(".g-main")).toBeVisible();
    const deploy = await fakeDeploy(a.page);
    await deploy.publish();
    await expect.poll(deploy.survived, { timeout: 15_000 }).toBe(false);
    await expect(a.page.locator(".g-main")).toBeVisible();
    expect(codeOf(a.page)).toBe(code);
    expect(new URL(a.page.url()).searchParams.has("v")).toBe(false); // router strips it
    await expect(a.page.getByText("Updated to the latest version")).toBeVisible();
  } finally {
    await closeAll([a, b]);
  }
});

test("staged marks hold the reload until Confirm", async ({ browser }) => {
  test.setTimeout(90_000);
  const { a, b, code } = await setup(browser, true);
  try {
    expect(await waitForRoller([a, b])).toBe(a);
    await roll(a.page);
    await a.page.getByRole("button", { name: /^Red 7,/ }).click();
    const deploy = await fakeDeploy(a.page);
    await deploy.publish();
    await a.page.clock.runFor(3500); // several 1 s idle ticks: busy, so it must not reload
    expect(await deploy.survived()).toBe(true);
    await a.page.getByRole("button", { name: /^Yellow 7,/ }).click();
    await a.page.getByRole("button", { name: "Submit" }).click();
    await expect.poll(deploy.survived, { timeout: 15_000 }).toBe(false);
    await expect(a.page.locator(".g-main")).toBeVisible();
    expect(codeOf(a.page)).toBe(code);
  } finally {
    await closeAll([a, b]);
  }
});
