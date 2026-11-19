import { request } from "@playwright/test";
import type { Player } from "./fixtures";
import { createGame, expect, SERVER, startGame, test } from "./fixtures";
import { closeAll, newPlayer, uniqueIp } from "./helpers";

const ORIGIN = "http://localhost:5173";
const LINK = /#\/join\/([A-Z0-9]{5})\/([A-Za-z0-9_-]{43})$/;

/** Host clicks "Copy invite link" and the link is read back from the clipboard. */
async function copyInvite(host: Player): Promise<string> {
  await host.context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: ORIGIN });
  await host.page.getByRole("button", { name: "Copy invite link" }).click();
  await expect(host.page.getByRole("button", { name: /Copied!/ })).toBeVisible();
  return host.page.evaluate(() => navigator.clipboard.readText());
}

test("invite link: copy, open in another browser, type only a name, land in the room", async ({
  browser,
}) => {
  const host = await newPlayer(browser, "Hana");
  const guest = await newPlayer(browser, "Gus");
  try {
    const code = await createGame(host, {
      roomName: `Link ${Date.now() % 100000}`,
      password: "pw-link",
      max: 2,
    });
    const link = await copyInvite(host);
    const m = LINK.exec(link);
    expect(m?.[1]).toBe(code);
    const key = m?.[2] as string;

    await guest.page.goto(link);
    await expect(guest.page.getByRole("heading", { name: "Join game" })).toBeVisible();
    await expect(guest.page.getByLabel("Password")).toHaveCount(0);
    // The key is stripped from the address bar immediately.
    expect(guest.page.url()).not.toContain(key);
    await guest.page.getByLabel("Your name").fill("Gus");
    await guest.page.getByRole("button", { name: "Join", exact: true }).click();
    // The guest fills the room, so the game starts and they may land on the game screen.
    await expect(
      guest.page.getByRole("button", { name: "Leave" }).or(guest.page.locator(".g-main")).first(),
    ).toBeVisible();
    await expect(host.page.getByText("Gus").first()).toBeVisible();
    expect(guest.page.url()).not.toContain(key);
    const stored = await guest.page.evaluate(() => JSON.stringify({ ...localStorage }));
    expect(stored).not.toContain(key);
  } finally {
    await closeAll([host, guest]);
  }
});

test("a tampered invite key is refused with 'Link is invalid or expired.'", async ({ browser }) => {
  const host = await newPlayer(browser, "Hana");
  const guest = await newPlayer(browser, "Gus");
  try {
    await createGame(host, { roomName: `Bad ${Date.now() % 100000}`, password: "pw-bad", max: 2 });
    const link = await copyInvite(host);
    const tampered = `${link.slice(0, -1)}${link.endsWith("A") ? "B" : "A"}`;
    await guest.page.goto(tampered);
    await guest.page.getByLabel("Your name").fill("Gus");
    await guest.page.getByRole("button", { name: "Join", exact: true }).click();
    await expect(guest.page.getByText("Link is invalid or expired.")).toBeVisible();
    await expect(host.page.getByText("Gus")).toHaveCount(0);
  } finally {
    await closeAll([host, guest]);
  }
});

test("both players leave mid-game: the room is gone from the list and /me no longer works", async ({
  browser,
}) => {
  test.setTimeout(90_000);
  const host = await newPlayer(browser, "Hana");
  const guest = await newPlayer(browser, "Gus");
  const api = await request.newContext({
    baseURL: SERVER,
    extraHTTPHeaders: { "cf-connecting-ip": uniqueIp() },
  });
  try {
    const roomName = `Leave ${Date.now() % 100000}`;
    const code = await createGame(host, { roomName, password: "pw-leave", max: 2 });
    const link = await copyInvite(host);
    await guest.page.goto(link);
    await guest.page.getByLabel("Your name").fill("Gus");
    await guest.page.getByRole("button", { name: "Join", exact: true }).click();
    // The guest fills the room, so the game starts and they may land on the game screen.
    await expect(
      guest.page.getByRole("button", { name: "Leave" }).or(guest.page.locator(".g-main")).first(),
    ).toBeVisible();
    await startGame(host);
    for (const p of [host, guest]) await expect(p.page.locator(".g-main")).toBeVisible();

    const token = async (p: Player) =>
      p.page.evaluate((c) => {
        const all = JSON.parse(localStorage.getItem("colorDice:sessions") ?? "{}");
        return all[c]?.token as string;
      }, code);
    const tokens = [await token(host), await token(guest)];

    const leave = async (p: Player) => {
      await p.page.getByRole("button", { name: "Menu" }).click();
      const dialog = p.page.getByRole("dialog");
      await dialog.getByRole("button", { name: "Leave game" }).click();
      await dialog.getByRole("button", { name: "Leave game" }).click();
      await expect(p.page.getByRole("button", { name: "Create game" }).first()).toBeVisible();
    };

    await leave(host);
    await expect(guest.page.getByText("Hana left the game.")).toBeVisible();
    await leave(guest);

    const list = await api.get("/api/games");
    expect(JSON.stringify(await list.json())).not.toContain(code);
    for (const tk of tokens) {
      const me = await api.get(`/api/games/${code}/me`, {
        headers: { Authorization: `Bearer ${tk}` },
      });
      // A deleted room has no seats left to match: the server answers 401 (the client treats
      // 401 and 404 alike and drops the seat).
      expect([401, 404]).toContain(me.status());
    }
    // Both devices dropped the seat.
    for (const p of [host, guest]) {
      await expect(p.page.getByText(roomName)).toHaveCount(0);
    }
  } finally {
    await api.dispose();
    await closeAll([host, guest]);
  }
});
