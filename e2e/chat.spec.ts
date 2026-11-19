import type { Player } from "./fixtures";
import {
  boxLocator,
  createGame,
  expect,
  joinGame,
  playRollOff,
  queueDice,
  startGame,
  test,
} from "./fixtures";
import { closeAll, newPlayer, roll, rollFaces, waitForRoller } from "./helpers";

const PAYLOAD = "<img src=x onerror=alert(1)>";

async function sendText(p: Player, text: string) {
  const input = p.page.getByRole("textbox", { name: "Message" });
  await input.fill(text);
  await input.press("Enter");
}

async function openChat(p: Player) {
  await p.page.getByRole("button", { name: /^Open chat/ }).click();
  await expect(p.page.getByRole("log", { name: "Chat messages" })).toBeVisible();
}

/** Three players in ACTION_1 (Ada rolled, white sum 7). */
async function threeInAction1(
  browser: Parameters<typeof newPlayer>[0],
  names: string[],
  roomName?: string,
) {
  const [a, b, c] = await Promise.all(names.map((n) => newPlayer(browser, n)));
  const players = [a!, b!, c!];
  const code = await createGame(a!, {
    roomName: roomName ?? `Chat ${Date.now() % 10000}`,
    password: "pw-chat",
    max: 3,
  });
  await joinGame(b!, code, "pw-chat");
  await queueDice(code, [6, 1, 1, ...rollFaces(7)]);
  await joinGame(c!, code, "pw-chat");
  await startGame(a!);
  expect(await waitForRoller(players)).toBe(a);
  await roll(a!.page);
  return { a: a!, b: b!, c: c!, players, code };
}

test("chat: toast + reaction reach others without blocking input; history survives reload; text is inert", async ({
  browser,
}) => {
  test.setTimeout(90_000);
  const { a, b, c, players } = await threeInAction1(browser, ["Ada", "Bo", "Cy"]);
  const dialogs: string[] = [];
  for (const p of players) p.page.on("dialog", (d) => dialogs.push(d.message()));
  try {
    // A: text.
    await openChat(a);
    await sendText(a, "hello table");
    await expect(a.page.getByRole("log", { name: "Chat messages" })).toContainText("hello table");
    await a.page.keyboard.press("Escape");

    // B and C get the toast; B can still stage and confirm a mark while it shows.
    for (const p of [b, c]) {
      await expect(p.page.locator(".chat-toast", { hasText: "hello table" })).toBeVisible();
    }
    await boxLocator(b.page, "RED", 7).click();
    await expect(b.page.locator(".chat-toast", { hasText: "hello table" })).toBeVisible();
    await b.page.locator(".g-primary.g-mark").click();
    await expect(b.page.getByText(/Waiting|Everyone/).first()).toBeVisible();

    // A: reaction.
    await a.page.getByRole("banner").getByRole("button", { name: "Send reaction" }).click();
    await a.page.getByRole("button", { name: "React dance cat" }).click();
    for (const p of [b, c]) {
      const float = p.page.locator(".rx-float", { hasText: "dance cat" }).first();
      await expect(float).toBeVisible();
      // The GIF really loaded (not a broken image) and is shown large.
      const img = float.locator("img.cat-gif");
      await expect
        .poll(() => img.evaluate((el: HTMLImageElement) => el.naturalWidth))
        .toBeGreaterThan(0);
      expect((await img.boundingBox())?.width ?? 0).toBeGreaterThanOrEqual(120);
    }

    // XSS: markup in chat is text, in the toast and in the log.
    await openChat(a);
    await sendText(a, PAYLOAD);
    await expect(c.page.locator(".chat-toast", { hasText: PAYLOAD })).toBeVisible();
    await openChat(c);
    await expect(c.page.getByRole("log", { name: "Chat messages" })).toContainText(PAYLOAD);
    for (const p of players) expect(await p.page.locator("img[src='x']").count()).toBe(0);

    // Reload restores the history.
    await b.page.reload();
    await openChat(b);
    const log = b.page.getByRole("log", { name: "Chat messages" });
    await expect(log).toContainText("hello table");
    await expect(log).toContainText(PAYLOAD);

    await a.page.waitForTimeout(300);
    expect(dialogs).toEqual([]);
  } finally {
    await closeAll(players);
  }
});

test("chat: the 6th text in quick succession is rate limited", async ({ browser }) => {
  const { a, players } = await threeInAction1(browser, ["Ana", "Bea", "Cai"]);
  try {
    await openChat(a);
    const input = a.page.getByRole("textbox", { name: "Message" });
    for (let i = 1; i <= 5; i++) {
      await sendText(a, `msg ${i}`);
      await expect(input).toHaveValue(""); // cleared by the server echo
    }
    await sendText(a, "msg 6");
    await expect(a.page.locator(".chat-status")).toHaveText("Slow down a little.");
    await expect(a.page.getByRole("log", { name: "Chat messages" })).not.toContainText("msg 6");
  } finally {
    await closeAll(players);
  }
});

const LONG_NAME = "W".repeat(30);
const LONG_ROOM = "R".repeat(50);

const noScroll = (p: Player) =>
  expect
    .poll(() => p.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);

async function longNamesGame(browser: Parameters<typeof newPlayer>[0]) {
  const a = await newPlayer(browser, LONG_NAME);
  const b = await newPlayer(browser, "Bo");
  for (const p of [a, b]) await p.page.setViewportSize({ width: 375, height: 667 });
  const code = await createGame(a, { roomName: LONG_ROOM, password: "pw-long", max: 2 });
  return { a, b, code };
}

test("chat: longest names do not cause horizontal scroll at 375 px (home, waiting, host board, chat)", async ({
  browser,
}) => {
  const { a, b, code } = await longNamesGame(browser);
  try {
    await noScroll(a); // waiting room
    await b.page.goto("/");
    await noScroll(b); // public list shows the long room and host names
    await queueDice(code, [6, 1]);
    await joinGame(b, code, "pw-long", LONG_ROOM); // fills the room: the game auto-starts
    await noScroll(b);
    await startGame(a);
    await expect(a.page.locator(".g-main")).toBeVisible();
    await noScroll(a);
    await openChat(a);
    await sendText(a, "x".repeat(200));
    await expect(a.page.getByRole("log", { name: "Chat messages" })).toContainText("xxxx");
    await noScroll(a);
  } finally {
    await closeAll([a, b]);
  }
});

// FOLLOW-UP (app bug): the other player's board overflows at 375 px when the host's name is
// 30 chars. Repro: host name "W"x30, room 50 chars, 2 players, start; on the guest's page at
// 375x667 `.g-status` / `.g-actionbar` (status text naming the host) has scrollWidth 475 and
// documentElement.scrollWidth is 491 > 375. The long unbroken name is not wrapped/ellipsized.
test("chat: guest's board has no horizontal scroll with a 30-char host name at 375 px", async ({
  browser,
}) => {
  const { a, b, code } = await longNamesGame(browser);
  try {
    await queueDice(code, [6, 1]);
    await joinGame(b, code, "pw-long", LONG_ROOM);
    await startGame(a);
    await expect(b.page.locator(".g-main")).toBeVisible();
    await noScroll(b);
  } finally {
    await closeAll([a, b]);
  }
});

// FOLLOW-UP (app bug): the reaction picker is clipped by the left screen edge on phones.
// Repro: 2 players in a started game, viewport 390x844, tap the 😊 "Send reaction" button.
// `.rx-picker` is at x=-68 (width 342), so "React 👍" (x=-64) is outside the viewport and
// cannot be tapped; its buttons are also 40 px wide (< 44). Fine at 1280 px.
test("chat: every reaction in the picker is on screen at 390 px", async ({ browser }) => {
  const a = await newPlayer(browser, "Ana");
  const b = await newPlayer(browser, "Bo");
  try {
    for (const p of [a, b]) await p.page.setViewportSize({ width: 390, height: 844 });
    const code = await createGame(a, {
      roomName: `Rx ${Date.now() % 10000}`,
      password: "pw-rx",
      max: 2,
    });
    await joinGame(b, code, "pw-rx");
    await startGame(a);
    await playRollOff([a, b]);
    await expect(a.page.locator(".g-main")).toBeVisible();
    await a.page.getByRole("button", { name: "Send reaction" }).click();
    for (const pick of await a.page.locator(".rx-pick").all()) {
      const box = await pick.boundingBox();
      expect(box?.x).toBeGreaterThanOrEqual(0);
      expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(390);
      expect(box?.width).toBeGreaterThanOrEqual(44);
    }
  } finally {
    await closeAll([a, b]);
  }
});
