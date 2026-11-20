import { createGame, expect, joinGame, playRollOff, startGame, test } from "./fixtures";
import { closeAll, newPlayer, settle } from "./helpers";

const PAYLOAD = "<img src=x onerror=alert(1)>";

test("room and player names render as text and never run script", async ({ browser }) => {
  const a = await newPlayer(browser, PAYLOAD);
  const b = await newPlayer(browser, "Bystander");
  const dialogs: string[] = [];
  for (const p of [a, b]) p.page.on("dialog", (d) => dialogs.push(d.message()));
  try {
    const code = await createGame(a, { roomName: PAYLOAD, password: "pw-xss1", max: 2 });
    // Host's waiting room: room name and own name are text.
    await expect(a.page.getByText(PAYLOAD).first()).toBeVisible();
    expect(await a.page.locator("img[src='x']").count()).toBe(0);

    // The public list on a third page shows the name as text.
    await b.page.goto("/");
    await expect(b.page.getByText(PAYLOAD).first()).toBeVisible();
    expect(await b.page.locator("img[src='x']").count()).toBe(0);

    await joinGame(b, code, "pw-xss1", PAYLOAD);
    await expect(b.page.getByText(PAYLOAD).first()).toBeVisible();
    await startGame(a);
    await playRollOff([a, b]);
    for (const p of [a, b]) {
      await expect(p.page.locator(".g-main")).toBeVisible();
      expect(await p.page.locator("img[src='x']").count()).toBe(0);
    }
    // In game, a player sees the opponents' names: Bystander sees the payload name as text.
    await expect(b.page.getByText(PAYLOAD).first()).toBeVisible();
    await expect(a.page.getByText("Bystander").first()).toBeVisible();
    await settle(a.page);
    expect(dialogs).toEqual([]);
  } finally {
    await closeAll([a, b]);
  }
});
