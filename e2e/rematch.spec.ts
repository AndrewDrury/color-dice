import type { Browser, Page } from "@playwright/test";
import { createGame, expect, joinGame, type Player, queueDice, startGame, test } from "./fixtures";
import { closeAll, expectGameOver, newPlayer, roll, uid, waitForRoller } from "./helpers";

/** The score reveal covers the results until it is closed: Skip (if still running), then "Show full score cards". */
async function skipCelebration(page: Page): Promise<void> {
  const skip = page.getByTestId("rv-skip");
  if (await skip.isVisible()) await skip.click();
  await page.getByRole("button", { name: "Show full score cards" }).click();
  await expect(page.getByTestId("celebration")).toHaveCount(0);
}

async function expectRecord(page: Page, name: string, tally: string): Promise<void> {
  const row = page.getByRole("dialog", { name: "Results" }).locator("tbody tr", { hasText: name });
  await expect(row.locator("td[data-record]")).toHaveText(tally);
}

type Table = { a: Player; b: Player; code: string };

/** Two players with a scripted opening (Alma first). */
async function twoPlayers(browser: Browser): Promise<Table> {
  const a = await newPlayer(browser, "Alma");
  const b = await newPlayer(browser, "Boris");
  const code = await createGame(a, {
    roomName: `Rematch ${uid()}`,
    password: "pw-rema",
    max: 2,
  });
  await queueDice(code, [6, 1]);
  await joinGame(b, code, "pw-rema");
  await startGame(a);
  return { a, b, code };
}

/** Taps the one Submit (a pass: nothing staged) on each page that shows it until `done` holds. */
async function passUntil(players: Player[], done: () => Promise<void>): Promise<void> {
  await expect(async () => {
    for (const { page } of players) {
      const btn = page.locator(".g-submit");
      if ((await btn.isVisible()) && (await btn.isEnabled())) {
        await btn.click({ timeout: 2000 });
      }
    }
    await done();
  }).toPass({ timeout: 25_000, intervals: [100] });
}

/** Seven turns of passing: Alma takes the 4th penalty on turn 7 and loses; Boris wins. */
async function playToTheEnd({ a, b }: Table): Promise<void> {
  for (let turn = 1; turn <= 7; turn++) {
    const active = turn % 2 === 1 ? a : b;
    const other = active === a ? b : a;
    expect(await waitForRoller([a, b])).toBe(active);
    await roll(active.page);
    // A tap on a socket that is (re)connecting is dropped silently (see `roll`), so keep tapping
    // Pass on whichever page still shows it until the server has moved on.
    const next = turn < 7 ? other.page.locator(".g-primary", { hasText: "Roll" }) : null;
    const done = next ?? active.page.getByRole("dialog", { name: "Results" });
    await passUntil([other, active], () => expect(done).toBeVisible({ timeout: 3000 }));
  }
}

/** Game 1 played out, celebration skipped, Alma asks for the rematch (Alma first again). */
async function startRematch(t: Table): Promise<void> {
  const { a, b, code } = t;
  await playToTheEnd(t);
  for (const p of [a, b]) {
    await expectGameOver(p.page);
    await skipCelebration(p.page);
  }
  await queueDice(code, [6, 1]);
  await a.page.getByRole("button", { name: "Rematch" }).click();
  const popup = b.page.getByRole("dialog", { name: "Rematch" });
  await expect(popup).toContainText("Alma wants a rematch");
  await expect(popup.locator(".rematch-avatar img")).toBeVisible();
  await expect(b.page.locator(".rematch-highlight")).toBeVisible();
  await b.page.getByRole("button", { name: "Accept Rematch" }).click();
}

test("rematch: game over shows the same record and a Rematch button on both screens", async ({
  browser,
}) => {
  const t = await twoPlayers(browser);
  const { a, b } = t;
  try {
    await playToTheEnd(t);
    await expectGameOver(a.page);
    await expectGameOver(b.page);
    for (const p of [a, b]) await skipCelebration(p.page);
    // Record (J5): Alma lost game 1, Boris won it. Same table on both screens.
    for (const p of [a, b]) {
      await expectRecord(p.page, "Alma", "0–0–1");
      await expectRecord(p.page, "Boris", "1–0–0");
    }
  } finally {
    await closeAll([a, b]);
  }
});

test("rematch keeps names, restarts at turn 1 with zero scores", async ({ browser }) => {
  const t = await twoPlayers(browser);
  const { a, b } = t;
  try {
    await startRematch(t);
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
  } finally {
    await closeAll([a, b]);
  }
});

test("rematch: a second game (same scripted outcome) accumulates the record to 0–2 / 2–0", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const t = await twoPlayers(browser);
  const { a, b } = t;
  try {
    await startRematch(t);
    for (const p of [a, b]) await expect(p.page.locator(".g-code")).toContainText("Turn 1");
    await playToTheEnd(t);
    for (const p of [a, b]) {
      await expectGameOver(p.page);
      await skipCelebration(p.page);
      await expectRecord(p.page, "Alma", "0–0–2");
      await expectRecord(p.page, "Boris", "2–0–0");
    }
  } finally {
    await closeAll([a, b]);
  }
});
