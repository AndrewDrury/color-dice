import { codeOf, createGame, expect, joinGame, newPlayer, startGame, test } from "./fixtures";

test("host creates, guest joins via the list, host starts", async ({ browser }) => {
  const roomName = `Smoke ${Date.now() % 100000}`;
  const host = await newPlayer(browser, "Hana");
  const guest = await newPlayer(browser, "Gus");
  try {
    const code = await createGame(host, { roomName, password: "secret1", max: 2 });
    expect(codeOf(host.page)).toBe(code);
    await joinGame(guest, code, "secret1", roomName);
    await expect(host.page.getByText("Gus").first()).toBeVisible();
    await startGame(host);
    for (const p of [host, guest]) {
      await expect(p.page.locator(".g-main")).toBeVisible();
      await expect(p.page.locator("[data-die]").first()).toBeVisible();
    }
  } finally {
    await host.context.close();
    await guest.context.close();
  }
});
