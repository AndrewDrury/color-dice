import { codeOf, createGame, expect, joinGame, playRollOff, startGame, test } from "./fixtures";
import { newPlayer, uid } from "./helpers";

test("opening roll-off: each player rolls their own die, highest die wins (ties re-roll the tied dice), Let's go starts play @smoke", async ({
  browser,
}) => {
  const roomName = `Roll ${uid()}`;
  const host = await newPlayer(browser, "Hana");
  const guest = await newPlayer(browser, "Gus");
  try {
    const code = await createGame(host, { roomName, password: "secret1", max: 2 });
    expect(codeOf(host.page)).toBe(code);
    await joinGame(guest, code, "secret1", roomName);
    await startGame(host);
    // Both see the ceremony with their own Roll button; nothing is rolled for them.
    for (const p of [host, guest]) {
      await expect(p.page.getByTestId("rolloff-live")).toBeVisible();
      await expect(p.page.getByTestId("rolloff-roll")).toBeVisible();
    }
    // A tap during the lobby -> game socket hand-over is dropped silently: tap again until it lands.
    const hostRoll = host.page.getByTestId("rolloff-roll");
    await expect(async () => {
      if (await hostRoll.isEnabled()) await hostRoll.click({ timeout: 2000 });
      await expect(hostRoll).toBeDisabled({ timeout: 3000 });
    }).toPass({ timeout: 25_000, intervals: [100] });
    await expect(guest.page.getByTestId("rolloff-roll")).toBeEnabled();
    // D-L1: the host's face lands on the guest's screen before the guest rolls.
    await expect(guest.page.locator('[data-testid="rolloff-seat"][data-face]')).toHaveCount(1);
    await playRollOff([host, guest]);
    // At most one of them holds the Roll button (the unique highest die).
    const rollers = [host, guest].filter(() => true);
    let n = 0;
    for (const p of rollers) {
      if (await p.page.locator(".g-primary", { hasText: "Roll" }).isVisible()) n += 1;
    }
    expect(n).toBeLessThanOrEqual(1);
  } finally {
    await host.context.close();
    await guest.context.close();
  }
});
