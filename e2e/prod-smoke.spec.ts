import { codeOf, expect, newPlayer, playRollOff, test } from "./fixtures";

// Runs against the real production site (see playwright.prod.config.ts). No test hooks,
// no scripted dice, no CF-Connecting-IP trick: only the public UI.
test("prod: create unlisted room, guest joins, start, roll, host leaves", async ({ browser }) => {
  const roomName = `smoke-${Date.now()}`;
  const password = `pw-${Date.now()}`;
  const host = await newPlayer(browser, "SmokeHost");
  const guest = await newPlayer(browser, "SmokeGuest");
  const frames: string[] = [];
  for (const p of [host, guest])
    p.page.on("websocket", (ws) => {
      ws.on("framesent", (f) => frames.push(`${p.name} > ${String(f.payload).slice(0, 120)}`));
      ws.on("framereceived", (f) => frames.push(`${p.name} < ${String(f.payload).slice(0, 120)}`));
    });
  try {
    // Host creates an unlisted room. "./" keeps the baseURL's /color-dice/ path.
    const h = host.page;
    await h.goto("./");
    await h.getByRole("button", { name: "Setup Game" }).first().click();
    await h.getByLabel("Room name").fill(roomName);
    await h.getByLabel("Your name").fill(host.name);
    await h.getByLabel("Password", { exact: true }).fill(password);
    await h.locator('label:has(input[name="maxPlayers"][value="4"])').click();
    await h.getByLabel("Show in public list").uncheck();
    await h.getByRole("button", { name: "Create game" }).last().click();
    await expect(h.getByRole("button", { name: "Leave" })).toBeVisible();
    const code = codeOf(h);

    // Guest joins by invite code + password.
    const g = guest.page;
    await g.goto("./");
    await g.getByLabel("Have an invite code?").fill(code);
    await g.getByRole("button", { name: "Join", exact: true }).first().click();
    const dialog = g.getByRole("dialog");
    await dialog.getByLabel("Your name").fill(guest.name);
    await dialog.getByLabel("Password", { exact: true }).fill(password);
    await dialog.getByRole("button", { name: "Join", exact: true }).click();
    await expect(g.getByRole("button", { name: "Leave" })).toBeVisible();
    await expect(h.getByText(guest.name).first()).toBeVisible();

    // 4-player room with 2 seated: the host starts it (a full room would start by itself).
    const start = h.getByRole("button", { name: "Start game" });
    if (await start.isVisible()) await start.click();
    // Opening roll-off: each player rolls their own server-generated die until one 6 wins,
    // then both see the game screen.
    await playRollOff([host, guest]);
    for (const p of [host, guest]) {
      await expect(p.page.locator(".g-main")).toBeVisible();
    }

    // The active player rolls; every die settles with a data-face (values unasserted).
    const roller = await (async () => {
      let found = host;
      await expect
        .poll(async () => {
          for (const p of [host, guest]) {
            if (await p.page.locator(".g-primary", { hasText: "Roll" }).isVisible()) {
              found = p;
              return true;
            }
          }
          return false;
        })
        .toBe(true);
      return found;
    })();
    // The game socket reconnects right after start, so an early click can be dropped:
    // keep tapping Roll until a die settles.
    const rollBtn = roller.page.locator(".g-primary", { hasText: "Roll" });
    await expect
      .poll(
        async () => {
          if (!(await rollBtn.isVisible())) return true;
          await rollBtn.click({ timeout: 2_000 }).catch(() => {});
          return false;
        },
        { timeout: 30_000, intervals: [1_000] },
      )
      .toBe(true);
    for (const p of [host, guest]) {
      await expect.poll(() => p.page.locator("[data-die][data-face]").count()).toBeGreaterThan(0);
      await expect
        .poll(() => p.page.locator("[data-die]:not(.is-removed):not([data-face])").count())
        .toBe(0);
    }

    // Host goes back to lobby from Settings; the unlisted room then expires by alarm.
    await h.getByRole("button", { name: "Settings" }).click();
    await h.getByRole("dialog").getByRole("button", { name: "Back to lobby" }).click();
    await expect(h.getByRole("button", { name: "Setup Game" }).first()).toBeVisible();
  } catch (e) {
    console.log(frames.slice(-25).join("\n"));
    throw e;
  } finally {
    await host.context.close();
    await guest.context.close();
  }
});
