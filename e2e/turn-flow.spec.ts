import { createGame, expect, joinGame, mark, pass, queueDice, startGame, test } from "./fixtures";
import { closeAll, newPlayer, roll, rollFaces, uid, waitForRoller } from "./helpers";

const marked = (page: import("@playwright/test").Page, color: string, n: number) =>
  page.getByRole("button", { name: `${color} ${n}, marked` });
const status = (page: import("@playwright/test").Page) => page.locator(".g-status-text");

async function setup(browser: import("@playwright/test").Browser, dice: number[]) {
  const a = await newPlayer(browser, "Alma");
  const b = await newPlayer(browser, "Boris");
  const code = await createGame(a, {
    roomName: `Flow ${uid()}`,
    password: "pw-flow",
    max: 2,
  });
  await queueDice(code, [6, 1, ...dice]); // roll-off: Alma rolls the only 6
  await joinGame(b, code, "pw-flow");
  await startGame(a);
  return { a, b };
}

test("active confirms both steps together before the passive player decides", async ({
  browser,
}) => {
  test.setTimeout(90_000);
  const { a, b } = await setup(browser, rollFaces(7));
  try {
    expect(await waitForRoller([a, b])).toBe(a);
    await roll(a.page);
    await expect(status(a.page)).toContainText("Pick the white total 7");
    await expect(status(b.page)).toContainText("Mark the white total 7");
    // Nothing staged: the one button is a penalty pass, not Submit.
    await expect(a.page.locator(".g-submit")).toHaveText("Pass (−5)");
    await expect(b.page.locator(".g-submit")).toHaveText("Pass");

    await a.page.getByRole("button", { name: /^Red 7,/ }).click();
    await a.page.getByRole("button", { name: /^Yellow 7,/ }).click();
    await expect(a.page.locator(".g-submit")).toHaveText("Submit");
    await a.page.getByRole("button", { name: "Submit" }).click();

    // The turn waits for Boris; Alma needs no further click.
    await expect(status(a.page)).toContainText("Waiting for Boris");
    await expect(b.page.locator(".g-primary", { hasText: "Roll" })).toHaveCount(0);
    await mark(b.page, "RED", 7);

    expect(await waitForRoller([a, b])).toBe(b);
    await expect(marked(a.page, "Red", 7)).toBeVisible();
    await expect(marked(a.page, "Yellow", 7)).toBeVisible();
    await expect(marked(b.page, "Red", 7)).toBeVisible();
  } finally {
    await closeAll([a, b]);
  }
});

test("active can toggle a staged box off and on; one Submit sends both and the turn waits", async ({
  browser,
}) => {
  test.setTimeout(90_000);
  const { a, b } = await setup(browser, rollFaces(7));
  try {
    expect(await waitForRoller([a, b])).toBe(a);
    await roll(a.page);
    await a.page.getByRole("button", { name: /^Red 7,/ }).click();
    await a.page.getByRole("button", { name: /^Yellow 7,/ }).click();
    // Tapping a staged box unselects it; nothing is sent and there is no "Waiting for" yet.
    await a.page.getByRole("button", { name: /^Yellow 7,/ }).click();
    await expect(a.page.locator(".g-submit")).toHaveText("Submit");
    await expect(status(a.page)).not.toContainText("Waiting for");
    await a.page.getByRole("button", { name: /^Yellow 7,/ }).click();
    await a.page.getByRole("button", { name: "Submit" }).click();
    await expect(status(a.page)).toContainText("Waiting for Boris");
    await expect(b.page.locator(".g-primary", { hasText: "Roll" })).toHaveCount(0);
    await pass(b.page); // passive: no penalty
    expect(await waitForRoller([a, b])).toBe(b);
    await expect(marked(a.page, "Yellow", 7)).toBeVisible();
  } finally {
    await closeAll([a, b]);
  }
});

test("a lock shows a popup to both players", async ({ browser }) => {
  test.setTimeout(150_000);
  const sums = [2, 3, 4, 5, 6, 12];
  const { a, b } = await setup(
    browser,
    sums.flatMap((s) => rollFaces(s)),
  );
  try {
    for (const [i, s] of sums.entries()) {
      const active = i % 2 === 0 ? a : b;
      const other = active === a ? b : a;
      expect(await waitForRoller([a, b])).toBe(active);
      await roll(active.page);
      await mark(active.page, "RED", s);
      await mark(other.page, "RED", s);
    }
    for (const p of [a, b]) {
      await expect(p.page.getByText(/locked the Red row!/)).toBeVisible();
    }
  } finally {
    await closeAll([a, b]);
  }
});
