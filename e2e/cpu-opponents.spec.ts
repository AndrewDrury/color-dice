import { createGame, expect, queueDice, test } from "./fixtures";
import { closeAll, newPlayer } from "./helpers";

test("CPU opponents: create a CPU game and expose CPU controls", async ({ browser }) => {
  test.setTimeout(120_000);
  const human = await newPlayer(browser, "CPU Human");
  try {
    await createGame(human, {
      roomName: `CPU Duel ${Date.now() % 10000}`,
      password: "pw-cpu",
      max: 2,
      cpu: 1,
    });
    await expect(human.page.getByRole("button", { name: "Start game" })).toBeVisible();
    await expect(human.page.getByText("1 CPU", { exact: true })).toBeVisible();
    await expect(human.page.locator('[aria-label="Offline"]')).toHaveCount(0);
  } finally {
    await closeAll([human]);
  }
});

test("CPU opponents: mixed-game smoke reaches live CPU play", async ({ browser }) => {
  test.setTimeout(120_000);
  const human = await newPlayer(browser, "Mixed CPU Human");
  try {
    const code = await createGame(human, {
      roomName: `Mixed CPU ${Date.now() % 10000}`,
      password: "pw-mixed",
      max: 2,
      cpu: 1,
    });
    await queueDice(code, [6, 1, 3, 4, 1, 1]);
    await human.page.getByRole("button", { name: "Start game" }).click();
    await expect(human.page.locator(".g-main")).toBeVisible({ timeout: 30_000 });
    await expect(human.page.getByText("CPU", { exact: true }).first()).toBeVisible();
  } finally {
    await closeAll([human]);
  }
});
