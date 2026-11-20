import { expect, test } from "@playwright/test";

test("demo scenario panel navigates every scenario locally", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(async () => {
    const dynamicImport = new Function("path", "return import(path)") as <T>(
      path: string,
    ) => Promise<T>;
    const mod = await dynamicImport<{ startDemo: () => void }>("/src/demo.ts");
    mod.startDemo();
    const router = await dynamicImport<{ navigate: (screen: string) => void }>("/src/router.ts");
    router.navigate("demo");
  });
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
    await page.getByTestId(`demo-scenario-${id}`).getByRole("button").click();
    await expect(page.getByTestId("demo-view")).toHaveAttribute("data-scenario", id);
  }

  await page.getByRole("button", { name: "Previous scenario" }).click();
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "Reset" }).click();
  await expect(page.getByTestId("demo-view")).toHaveAttribute("data-scenario", "roll");
});

test("demo winner celebration opens immediately and does not mutate history", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.removeItem("colorDice:history"));
  await page.evaluate(async () => {
    const dynamicImport = new Function("path", "return import(path)") as <T>(
      path: string,
    ) => Promise<T>;
    const mod = await dynamicImport<{ startDemo: () => void }>("/src/demo.ts");
    mod.startDemo();
    const router = await dynamicImport<{ navigate: (screen: string) => void }>("/src/router.ts");
    router.navigate("demo");
  });
  await page.getByTestId("demo-scenario-winner-celebration").getByRole("button").click();
  await expect(page.getByTestId("celebration")).toBeVisible();
  await expect(page.getByTestId("celebration")).toHaveAttribute("data-phase", "intro");
  await expect(page.evaluate(() => localStorage.getItem("colorDice:history"))).resolves.toBeNull();
});
