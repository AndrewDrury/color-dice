import { createGame, expect, test } from "./fixtures";
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
