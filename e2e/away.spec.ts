import { request } from "@playwright/test";
import { createGame, expect, joinGame, pass, queueDice, SERVER, startGame, test } from "./fixtures";
import { closeAll, newPlayer, roll, rollFaces, waitForRoller } from "./helpers";

/** Server test hook: move the room's clock forward (E-testing injectable clock). */
async function advanceServerClock(code: string, advanceMs: number) {
  const api = await request.newContext({ baseURL: SERVER });
  try {
    const res = await api.post(`/api/games/${code}/__test/clock`, { data: { advanceMs } });
    expect(res.status()).toBe(204);
  } finally {
    await api.dispose();
  }
}

test("host marks an offline player away; the game goes on with their penalties", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const [a, b, c] = await Promise.all(["Hera", "Bram", "Cleo"].map((n) => newPlayer(browser, n)));
  const players = [a!, b!, c!];
  try {
    // The client counts the 2 minutes on its own clock: let the host page's clock be steerable.
    await a!.page.clock.install({ time: Date.now() });
    const code = await createGame(a!, {
      roomName: `Away ${Date.now() % 10000}`,
      password: "pw-away",
      max: 3,
    });
    await joinGame(b!, code, "pw-away");
    await joinGame(c!, code, "pw-away");
    await queueDice(code, [6, ...rollFaces(7)]);
    await startGame(a!);
    expect(await waitForRoller(players)).toBe(a);

    // Cleo's browser dies mid-turn.
    await c!.context.close();
    await a!.page.waitForTimeout(1000);
    await roll(a!.page); // a view bump: the host's client now knows Cleo is offline

    // Two minutes pass (server clock via the test hook, host page clock via Playwright).
    await advanceServerClock(code, 125_000);
    await a!.page.clock.fastForward(125_000);

    await pass(b!.page);
    await pass(a!.page); // Action 1: only Cleo is outstanding
    const markAway = a!.page.getByRole("button", { name: "Mark as away" });
    await expect(markAway).toBeVisible();
    await markAway.click();
    await a!.page
      .getByRole("dialog", { name: "Mark as away" })
      .getByRole("button", { name: "Mark as away" })
      .click();
    await expect(a!.page.getByRole("img", { name: "away" }).first()).toBeVisible();

    // Cleo auto-passed Action 1, so the turn continues: Hera passes Action 2 (penalty).
    await pass(a!.page);

    // Turn 2: Bram. Cleo auto-passes, Hera and Bram pass everything.
    expect(await waitForRoller([a!, b!])).toBe(b);
    await roll(b!.page);
    await pass(a!.page);
    await pass(b!.page);
    await pass(b!.page); // Bram's Action 2 (penalty)

    // Turn 3 is Cleo's: the host's policy rolls for her, we pass Action 1.
    await expect(a!.page.locator(".g-code")).toContainText("Turn 3");
    await expect(a!.page.locator("[data-die][data-face]").first()).toBeVisible();
    await pass(a!.page);
    await pass(b!.page);

    // Cleo's auto-pass of Action 2 costs her a penalty: -5, seen by Hera.
    const cleo = a!.page.locator('.g-chip[aria-label^="Cleo"] .num[data-total]');
    await expect(cleo).toHaveAttribute("data-total", "-5");
    await expect(a!.page.locator(".g-code")).toContainText("Turn 4");
  } finally {
    await closeAll(players);
  }
});
