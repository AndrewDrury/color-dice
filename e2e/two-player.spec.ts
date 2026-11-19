import { createGame, expect, joinGame, pass, queueDice, startGame, test } from "./fixtures";
import { closeAll, expectGameOver, finalScores, newPlayer, roll, waitForRoller } from "./helpers";

// EC-13: the active player's 4th penalty ends the game at once.
test("two players: game ends on the 4th penalty, scores match on both pages", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const a = await newPlayer(browser, "Alma");
  const b = await newPlayer(browser, "Boris");
  try {
    const code = await createGame(a, {
      roomName: `Duel ${Date.now() % 10000}`,
      password: "pw-duel",
      max: 2,
    });
    await queueDice(code, [6, 1]); // roll-off: seat 0 (Alma) rolls a 6 and starts
    await joinGame(b, code, "pw-duel");
    await startGame(a);

    // Alma, Boris, Alma, Boris ... every player passes everything.
    // Alma is active on turns 1,3,5,7: her 4th penalty ends the game on turn 7.
    for (let turn = 1; turn <= 7; turn++) {
      const active = turn % 2 === 1 ? a : b;
      const other = active === a ? b : a;
      expect(await waitForRoller([a, b])).toBe(active);
      await roll(active.page);
      await pass(other.page);
      await pass(active.page); // Action 1
      await pass(active.page); // Action 2 (no mark -> penalty)
    }
    await expectGameOver(a.page);
    await expectGameOver(b.page);

    await expect.poll(() => finalScores(a.page)).toEqual({ Alma: -20, Boris: -15 });
    expect(await finalScores(b.page)).toEqual({ Alma: -20, Boris: -15 });
    await expect(a.page.locator(".g-winner")).toContainText("Boris");
    await expect(b.page.locator(".g-winner")).toContainText("Boris");
  } finally {
    await closeAll([a, b]);
  }
});
