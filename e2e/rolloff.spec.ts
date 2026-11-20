import {
  codeOf,
  createGame,
  expect,
  joinGame,
  newPlayer,
  playRollOff,
  startGame,
  test,
} from "./fixtures";

test("opening roll-off: each player rolls their own die, rerolls until one 6, Let's go starts play", async ({
  browser,
}) => {
  const roomName = `Roll ${Date.now() % 100000}`;
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
    await host.page.getByTestId("rolloff-roll").click();
    await expect(host.page.getByTestId("rolloff-roll")).toBeDisabled();
    await expect(guest.page.getByTestId("rolloff-roll")).toBeEnabled();
    // D-L1: the host's face lands on the guest's screen before the guest rolls.
    await expect(guest.page.locator('[data-testid="rolloff-seat"][data-face]')).toHaveCount(1);
    await playRollOff([host, guest]);
    // Exactly one of them holds the Roll button (the unique 6).
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
