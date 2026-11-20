import { createGame, expect, joinGame, queueDice, roll, test } from "./fixtures";
import { newPlayer, uid } from "./helpers";

test("undo removes a staged mark and stays in the current turn @smoke", async ({ browser }) => {
  const host = await newPlayer(browser, "UndoHost");
  const guest = await newPlayer(browser, "UndoGuest");
  try {
    const code = await createGame(host, {
      roomName: `Undo ${uid()}`,
      password: "undo-pass",
      max: 2,
      listed: false,
    });
    await queueDice(code, [6, 1, 3, 5, 2, 2, 2, 2]);
    await joinGame(guest, code, "undo-pass");
    await roll(host.page);
    await host.page.getByRole("button", { name: /Red 8, can mark/ }).click();
    await expect(host.page.getByRole("button", { name: "Undo", exact: true })).toBeVisible();
    await host.page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(host.page.getByRole("button", { name: "Undo", exact: true })).toBeHidden();
  } finally {
    await host.context.close();
    await guest.context.close();
  }
});
