import { createGame, expect, joinGame, queueDice, startGame, test } from "./fixtures";
import {
  closeAll,
  controlNetwork,
  newPlayer,
  roll,
  rollFaces,
  uid,
  waitForRoller,
} from "./helpers";

test("a dropped connection pauses the game for everyone; it resumes when the player is back", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const [a, b, c] = await Promise.all(["Hera", "Bram", "Cleo"].map((n) => newPlayer(browser, n)));
  const players = [a!, b!, c!];
  try {
    const net = await controlNetwork(c!);
    const code = await createGame(a!, {
      roomName: `Pause ${uid()}`,
      password: "pw-away",
      max: 3,
    });
    await joinGame(b!, code, "pw-away");
    await queueDice(code, [6, 1, 1, ...rollFaces(7)]);
    await joinGame(c!, code, "pw-away");
    await startGame(a!);
    expect(await waitForRoller(players)).toBe(a);

    // Cleo must be fully in (board shown, authenticated) before her link drops; dropping it
    // mid-handshake is a different scenario than "a player's connection dropped".
    await expect(c!.page.locator(".g-main")).toBeVisible();
    for (const p of [a!, b!]) await expect(p.page.getByTestId("paused-banner")).toHaveCount(0);
    await net.goOffline();
    for (const p of [a!, b!]) {
      await expect(p.page.getByTestId("paused-banner")).toContainText("Cleo");
    }
    // No manual away flow exists any more.
    await expect(a!.page.getByRole("button", { name: "Mark as away" })).toHaveCount(0);

    await net.goOnline();
    for (const p of [a!, b!]) await expect(p.page.getByTestId("paused-banner")).toHaveCount(0);
    await roll(a!.page);
    await expect(a!.page.locator("[data-die][data-face]").first()).toBeVisible();
  } finally {
    await closeAll(players);
  }
});
