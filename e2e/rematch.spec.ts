import type { Page } from "@playwright/test";
import { createGame, expect, joinGame, pass, queueDice, startGame, test } from "./fixtures";
import { closeAll, expectGameOver, newPlayer, roll, waitForRoller } from "./helpers";

async function expectRecord(page: Page, name: string, tally: string): Promise<void> {
  const row = page.getByRole("dialog", { name: "Results" }).locator("tbody tr", { hasText: name });
  await expect(row.locator("td[data-record]")).toHaveText(tally);
}

test("rematch keeps names, restarts at turn 1 with zero scores", async ({ browser }) => {
  test.setTimeout(120_000);
  const a = await newPlayer(browser, "Alma");
  const b = await newPlayer(browser, "Boris");
  try {
    const code = await createGame(a, {
      roomName: `Rematch ${Date.now() % 10000}`,
      password: "pw-rema",
      max: 2,
    });
    await joinGame(b, code, "pw-rema");
    await queueDice(code, [6]);
    await startGame(a);
    for (let turn = 1; turn <= 7; turn++) {
      const active = turn % 2 === 1 ? a : b;
      const other = active === a ? b : a;
      expect(await waitForRoller([a, b])).toBe(active);
      await roll(active.page);
      await pass(other.page);
      await pass(active.page);
      await pass(active.page);
    }
    await expectGameOver(a.page);
    await expectGameOver(b.page);
    // Record (J5): Alma lost game 1, Boris won it. Same table on both screens.
    for (const p of [a, b]) {
      await expectRecord(p.page, "Alma", "0–1");
      await expectRecord(p.page, "Boris", "1–0");
    }
    await expect(b.page.getByRole("button", { name: "Rematch" })).toHaveCount(0);

    await queueDice(code, [6]); // Alma first again in game 2
    await a.page.getByRole("button", { name: "Rematch" }).click();
    await a.page
      .getByRole("dialog", { name: "Start a rematch?" })
      .getByRole("button", { name: "Rematch" })
      .click();

    for (const p of [a, b]) {
      await expect(p.page.getByRole("dialog", { name: "Results" })).toHaveCount(0);
      await expect(p.page.locator(".g-code")).toContainText("Turn 1");
      // Scores are back to 0 (the opponent chip / sheet total).
      await expect(
        p.page.locator(".g-chip .num[data-total], [data-total]").first(),
      ).toHaveAttribute("data-total", "0");
      await expect(p.page.getByText("Alma").first()).toBeVisible();
      await expect(p.page.getByText("Boris").first()).toBeVisible();
    }

    // Second game (same scripted outcome): the record accumulates to 0–2 / 2-0.
    for (let turn = 1; turn <= 7; turn++) {
      const active = turn % 2 === 1 ? a : b;
      const other = active === a ? b : a;
      expect(await waitForRoller([a, b])).toBe(active);
      await roll(active.page);
      await pass(other.page);
      await pass(active.page);
      await pass(active.page);
    }
    for (const p of [a, b]) {
      await expectGameOver(p.page);
      await expectRecord(p.page, "Alma", "0–2");
      await expectRecord(p.page, "Boris", "2–0");
    }
  } finally {
    await closeAll([a, b]);
  }
});
