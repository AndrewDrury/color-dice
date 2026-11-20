import { expect, test } from "@playwright/test";

test("demo scenario panel navigates every scenario locally", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create game" }).first().click();
  await page.getByRole("button", { name: "Start demo / test mode" }).click();
  await expect(page.getByTestId("scenario-panel")).toBeVisible();
  await expect(page.getByTestId("demo-view")).toBeVisible();

  const ids = [
    "waiting",
    "rolloff-initial",
    "rolloff-tie",
    "rolloff-winner",
    "rolloff-lets-go",
    "roll",
    "action-1",
    "action-2",
    "turn-summary",
    "lock-first",
    "lock-second",
    "penalty",
    "winner",
    "tie",
    "all-tied",
    "winner-celebration",
    "dramatic-reveal",
    "full-score",
  ];
  for (const id of ids) {
    const scenarioButton = page.getByTestId(`demo-scenario-${id}`).getByRole("button");
    if (await page.getByTestId("celebration").isVisible()) {
      await scenarioButton.dispatchEvent("click");
    } else {
      await scenarioButton.click();
    }
    await expect(page.getByTestId("demo-view")).toHaveAttribute("data-scenario", id);
  }

  await page.getByRole("button", { name: "Previous scenario" }).click();
  const next = page.getByRole("button", { name: "Next" });
  if (await page.getByTestId("celebration").isVisible()) {
    await next.dispatchEvent("click");
  } else {
    await next.click();
  }
  await page.getByRole("button", { name: "Reset" }).click();
  await expect(page.getByTestId("demo-view")).toHaveAttribute("data-scenario", "roll");
});

test("demo winner celebration opens immediately and does not mutate history", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.removeItem("colorDice:history"));
  await page.getByRole("button", { name: "Create game" }).first().click();
  await page.getByRole("button", { name: "Start demo / test mode" }).click();
  await page.getByTestId("demo-scenario-winner-celebration").getByRole("button").click();
  await expect(page.getByTestId("celebration")).toBeVisible();
  await expect(page.getByTestId("celebration")).toHaveAttribute("data-phase", "done");
  await expect(page.evaluate(() => localStorage.getItem("colorDice:history"))).resolves.toBeNull();
});
