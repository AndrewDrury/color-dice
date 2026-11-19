import { createGame, expect, joinGame, newPlayer, queueDice, test } from "./fixtures";
import { closeAll } from "./helpers";

test("a 2-player room starts the moment the guest joins, with no Start press", async ({
  browser,
}) => {
  const a = await newPlayer(browser, "Auto");
  const b = await newPlayer(browser, "Bea");
  try {
    const code = await createGame(a, {
      roomName: `Auto ${Date.now() % 10000}`,
      password: "pw-auto",
      max: 2,
    });
    await expect(a.page.getByRole("button", { name: /^Start|^Need/ })).toBeVisible();
    await queueDice(code, [6, 1]);
    await joinGame(b, code, "pw-auto");
    for (const p of [a, b]) await expect(p.page.locator(".g-main")).toBeVisible();
    // Started exactly once: still seat-0 first, one game screen, no Start button anywhere.
    await expect(a.page.getByRole("button", { name: /^Start/ })).toHaveCount(0);
    await expect(a.page.locator(".g-main")).toHaveCount(1);
  } finally {
    await closeAll([a, b]);
  }
});

test("a 3-player room with 2 joined waits for Start; the host can start it short-handed", async ({
  browser,
}) => {
  const a = await newPlayer(browser, "Host");
  const b = await newPlayer(browser, "Bo");
  try {
    const code = await createGame(a, {
      roomName: `Tri ${Date.now() % 10000}`,
      password: "pw-tri",
      max: 3,
    });
    await joinGame(b, code, "pw-tri");
    await expect(a.page.getByRole("button", { name: "Start game" })).toBeEnabled();
    await expect(a.page.getByText("Room full — starting…")).toHaveCount(0);
    await expect(a.page.locator(".g-main")).toHaveCount(0);
    await a.page.getByRole("button", { name: "Start game" }).click();
    for (const p of [a, b]) await expect(p.page.locator(".g-main")).toBeVisible();
  } finally {
    await closeAll([a, b]);
  }
});
