import { createGame, expect, joinGame, playRollOff, startGame, test } from "./fixtures";
import { closeAll, newPlayer, uid } from "./helpers";

// T-NEW-13: colour + cat avatar are chosen on create/join, shown to everyone, remembered.
test("two players pick different profiles; both show on each screen and are remembered", async ({
  browser,
}) => {
  test.setTimeout(90_000);
  const a = await newPlayer(browser, "Alma");
  const b = await newPlayer(browser, "Boris");
  try {
    const room = `Cats ${uid()}`;
    await a.page.goto("/");
    await a.page.getByRole("button", { name: "Create game" }).first().click();
    await a.page.getByLabel("Room name").fill(room);
    await a.page.getByLabel("Your name").fill("Alma");
    await a.page.getByLabel("Password", { exact: true }).fill("pw-cats");
    await a.page.locator('label:has(input[name="maxPlayers"][value="3"])').click();
    await a.page.getByRole("radio", { name: "Indigo", exact: true }).click();
    await expect(a.page.getByRole("radio", { name: "Indigo", exact: true })).toBeChecked();
    await a.page.getByRole("radio", { name: "dance cat", exact: true }).click();
    await expect(a.page.getByRole("radio", { name: "dance cat", exact: true })).toBeChecked();
    await a.page.getByRole("button", { name: "Create game" }).last().click();
    await expect(a.page.getByRole("button", { name: "Leave" })).toBeVisible();
    const code = new URL(a.page.url()).searchParams.get("game") ?? "";

    await b.page.goto("/");
    await b.page.getByLabel("Have an invite code?").fill(code);
    await b.page.getByRole("button", { name: "Join", exact: true }).first().click();
    const dialog = b.page.getByRole("dialog");
    await dialog.getByLabel("Your name").fill("Boris");
    await dialog.getByLabel("Password", { exact: true }).fill("pw-cats");
    await dialog.getByRole("radio", { name: "Pink", exact: true }).click();
    await dialog.getByRole("button", { name: "Join", exact: true }).click();
    await expect(b.page.getByRole("button", { name: "Leave" })).toBeVisible();

    for (const p of [a, b]) {
      const list = p.page.getByRole("list", { name: "Players" });
      await expect(list.locator(".av.pc-indigo")).toHaveCount(1);
      await expect(list.locator(".av.pc-pink")).toHaveCount(1);
      await expect(list.locator('img[src*="Dance%20Cat"]')).toHaveCount(1);
    }

    // Changing in the waiting room reaches the other screen.
    await b.page.getByRole("radio", { name: "Violet", exact: true }).click();
    await expect(
      a.page.getByRole("list", { name: "Players" }).locator(".av.pc-violet"),
    ).toHaveCount(1);

    // Reload keeps the choice, and the next create form is pre-filled with the last selection.
    await a.page.reload();
    await expect(
      a.page.getByRole("list", { name: "Players" }).locator(".av.pc-indigo"),
    ).toHaveCount(1);
    await a.page.goto("/");
    await a.page.getByRole("button", { name: "Create game" }).first().click();
    await expect(a.page.getByRole("radio", { name: "Indigo", exact: true })).toBeChecked();
  } finally {
    await closeAll([a, b]);
  }
});

// T-NEW-15: the widest legal name (30 × "W") never makes the page scroll sideways.
test("max-length names fit at 360 px and 1280 px", async ({ browser }) => {
  test.setTimeout(90_000);
  const a = await newPlayer(browser, "W".repeat(30));
  const b = await newPlayer(browser, `${"W".repeat(29)}M`);
  const fits = async (page: (typeof a)["page"]) => {
    for (const width of [360, 1280]) {
      await page.setViewportSize({ width, height: 800 });
      const { sw, iw } = await page.evaluate(() => ({
        sw: document.documentElement.scrollWidth,
        iw: window.innerWidth,
      }));
      expect(sw).toBeLessThanOrEqual(iw);
    }
  };
  try {
    await a.page.setViewportSize({ width: 360, height: 800 });
    await a.page.goto("/");
    await a.page.getByRole("button", { name: "Create game" }).first().click();
    await a.page.getByLabel("Your name").fill(a.name);
    await expect(a.page.getByRole("group", { name: "Choose avatar" })).toBeVisible();
    await fits(a.page);
    const code = await createGame(a, {
      roomName: `Long ${uid()}`,
      password: "pw-long",
    });
    await joinGame(b, code, "pw-long");
    await fits(a.page);
    await startGame(a);
    await playRollOff([a, b]);
    for (const p of [a, b]) await fits(p.page);
  } finally {
    await closeAll([a, b]);
  }
});
