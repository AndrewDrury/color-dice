import { devices } from "@playwright/test";
import type { Player } from "./fixtures";
import {
  autoDismissRollOff,
  boxLocator,
  createGame,
  expect,
  joinGame,
  playRollOff,
  queueDice,
  SERVER,
  startGame,
  test,
} from "./fixtures";
import {
  closeAll,
  newPlayer,
  roll,
  rollFaces,
  settle,
  uid,
  uniqueIp,
  waitForRoller,
} from "./helpers";

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
    roomName: roomName ?? `Chat ${uid()}`,
    password: "pw-chat",
    max: 3,
  });
  await joinGame(b!, code, "pw-chat");
  await queueDice(code, [6, 1, 1, ...rollFaces(7)]);
  await joinGame(c!, code, "pw-chat");
  await startGame(a!);
  expect(await waitForRoller(players)).toBe(a);
  // The game screen opens its own socket (the waiting room's is handed over); a chat sent
  // before a peer's new socket is online is never toasted there. Wait until all are live.
  for (const p of players) {
    await expect(p.page.getByRole("img", { name: "online", exact: true })).toBeVisible();
  }
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
    await b.page.locator(".g-submit").click();
    await expect(b.page.getByText(/Waiting|Everyone/).first()).toBeVisible();

    // A: reaction.
    await a.page.getByRole("banner").getByRole("button", { name: "Send reaction" }).click();
    await a.page.getByRole("button", { name: "React dancing cat" }).click();
    for (const p of [b, c]) {
      const float = p.page.locator(".rx-float", { hasText: "dancing cat" }).first();
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

    await settle(a.page);
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
/** 50 chars (the max) with a unique tail, so parallel tests never share a room name. */
const longRoom = () => "R".repeat(46) + uid();

const noScroll = (p: Player) =>
  expect
    .poll(() => p.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);

async function longNamesGame(browser: Parameters<typeof newPlayer>[0]) {
  const a = await newPlayer(browser, LONG_NAME);
  const b = await newPlayer(browser, "Bo");
  for (const p of [a, b]) await p.page.setViewportSize({ width: 375, height: 667 });
  const room = longRoom();
  const code = await createGame(a, { roomName: room, password: "pw-long", max: 2 });
  return { a, b, code, room };
}

test("chat: longest names do not cause horizontal scroll at 375 px (home, waiting, host board, chat)", async ({
  browser,
}) => {
  const { a, b, code, room } = await longNamesGame(browser);
  try {
    await noScroll(a); // waiting room
    await b.page.goto("/");
    await noScroll(b); // public list shows the long room and host names
    await queueDice(code, [6, 1]);
    await joinGame(b, code, "pw-long", room); // fills the room: the game auto-starts
    await noScroll(b);
    await startGame(a);
    await expect(a.page.locator(".g-main")).toBeVisible();
    await noScroll(a);
    await openChat(a);
    // A send during the lobby -> game socket hand-over is dropped silently: send again until echoed.
    const log = a.page.getByRole("log", { name: "Chat messages" });
    await expect(async () => {
      if (!(await log.innerText()).includes("xxxx")) await sendText(a, "x".repeat(500));
      await expect(log).toContainText("xxxx", { timeout: 3000 });
    }).toPass({ timeout: 25_000, intervals: [100] });
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
  const { a, b, code, room } = await longNamesGame(browser);
  try {
    await queueDice(code, [6, 1]);
    await joinGame(b, code, "pw-long", room);
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
      roomName: `Rx ${uid()}`,
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

const SHOTS = !!process.env.SHOTS;
declare const process: { env: Record<string, string | undefined> };
const SHOT_DIR = new URL("./screenshots/chat/", import.meta.url).pathname;

const { defaultBrowserType: _dbt, ...IPHONE } = devices["iPhone 13"];

/** A touch phone (iPhone 13 emulation on Chromium) at the given size. */
async function newPhone(
  browser: Parameters<typeof newPlayer>[0],
  name: string,
  width = 390,
  height = 844,
): Promise<Player> {
  const ip = uniqueIp();
  const context = await browser.newContext({ ...IPHONE, viewport: { width, height } });
  await context.route(`${SERVER}/**`, (route) =>
    route.continue({ headers: { ...route.request().headers(), "cf-connecting-ip": ip } }),
  );
  await context.setExtraHTTPHeaders({ "cf-connecting-ip": ip });
  const page = await context.newPage();
  await autoDismissRollOff(page);
  return { context, page, name };
}

async function twoStarted(browser: Parameters<typeof newPlayer>[0], phone?: [number, number]) {
  const a = phone ? await newPhone(browser, "Ana", ...phone) : await newPlayer(browser, "Ana");
  const b = phone ? await newPhone(browser, "Bo", ...phone) : await newPlayer(browser, "Bo");
  const code = await createGame(a, { roomName: `Msg ${uid()}`, password: "pw-msg", max: 2 });
  await joinGame(b, code, "pw-msg");
  await startGame(a);
  await playRollOff([a, b]);
  await expect(a.page.locator(".g-main")).toBeVisible();
  for (const p of [a, b]) {
    await expect(p.page.getByRole("img", { name: "online", exact: true })).toBeVisible();
  }
  return { a, b };
}

for (const phone of [undefined, [390, 844] as [number, number]]) {
  test(`chat: typing starts right after clicking Chat (no click in the input); bubbles are aligned; 500 chars round trip${phone ? " (phone)" : ""}`, async ({
    browser,
  }) => {
    test.setTimeout(90_000);
    await typingFlow(browser, phone);
  });
}

async function typingFlow(browser: Parameters<typeof newPlayer>[0], phone?: [number, number]) {
  const { a, b } = await twoStarted(browser, phone);
  try {
    await a.page.getByRole("button", { name: /^Open chat/ }).click();
    // No click into the field: it already has focus, so keystrokes land in it.
    await a.page.keyboard.type("typed at once");
    await expect(a.page.getByRole("textbox", { name: "Message" })).toBeFocused();
    await expect(a.page.getByRole("textbox", { name: "Message" })).toHaveValue("typed at once");
    await a.page.keyboard.press("Enter");
    const alog = a.page.getByRole("log", { name: "Chat messages" });
    await expect(alog).toContainText("typed at once");

    // The longest message: 500 characters, with a long unbroken run to prove wrapping.
    const long = `${"word ".repeat(80)}${"z".repeat(100)}`.slice(0, 500);
    expect(long).toHaveLength(500);
    await a.page.getByRole("textbox", { name: "Message" }).fill(long);
    await a.page.keyboard.press("Enter");
    await expect(alog.locator(".chat-text", { hasText: "zzzzzzzz" })).toBeVisible();

    // The textarea grows with its content and Shift+Enter makes a new line instead of sending.
    const box = a.page.getByRole("textbox", { name: "Message" });
    const h1 = (await box.boundingBox())?.height ?? 0;
    await box.fill("l1");
    await a.page.keyboard.press("Shift+Enter");
    await a.page.keyboard.type("l2");
    await a.page.keyboard.press("Shift+Enter");
    await a.page.keyboard.type("l3");
    expect((await box.boundingBox())?.height ?? 0).toBeGreaterThan(h1 + 20);
    await box.fill("");

    // B sees it on the left, A sees it on the right; no names anywhere in view.
    await b.page.getByRole("button", { name: /^Open chat/ }).click();
    const blog = b.page.getByRole("log", { name: "Chat messages" });
    await expect(blog.locator(".chat-text", { hasText: "zzzzzzzz" })).toBeVisible();
    const side = async (log: typeof blog, cls: string) => {
      const row = log.locator(`.chat-row.${cls} .chat-b`).first();
      const [r, l] = [await row.boundingBox(), await log.boundingBox()];
      return ((r?.x ?? 0) + (r?.width ?? 0) / 2 - (l?.x ?? 0)) / (l?.width ?? 1);
    };
    expect(await side(blog, "is-other")).toBeLessThan(0.5);
    expect(await side(alog, "is-mine")).toBeGreaterThan(0.5);
    const visible = await blog.evaluate((el) => {
      const c = el.cloneNode(true) as HTMLElement;
      for (const n of c.querySelectorAll(".sr-only")) n.remove();
      return c.textContent ?? "";
    });
    expect(visible).not.toContain("Ana");
    await expect(blog.locator(".sr-only").first()).toHaveText("Ana says:");
    await expect(blog.locator(".chat-av .av").first()).toBeVisible();
    await settle(a.page);
    expect(await a.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );

    // Esc closes and focus goes back to the Chat button.
    await a.page.keyboard.press("Escape");
    await expect(alog).toBeHidden();
    await expect(a.page.getByRole("button", { name: /^Open chat/ })).toBeFocused();
  } finally {
    await closeAll([a, b]);
  }
}

const VIEWS: [string, [number, number] | undefined][] = [
  ["desk", undefined],
  ["p360", [360, 740]],
  ["p390", [390, 844]],
];
for (const [tag, phone] of VIEWS) {
  test(`chat: screenshots in every theme ${tag} @shots`, async ({ browser }) => {
    test.skip(!SHOTS, "set SHOTS=1");
    test.setTimeout(180_000);
    const { a, b } = await twoStarted(browser, phone);
    try {
      await a.page.getByRole("button", { name: /^Open chat/ }).click();
      const say = async (p: Player, t: string) => {
        await p.page.getByRole("textbox", { name: "Message" }).fill(t);
        await p.page.keyboard.press("Enter");
        await expect(p.page.getByRole("log", { name: "Chat messages" })).toContainText(
          t.slice(0, 20),
        );
      };
      await b.page.getByRole("button", { name: /^Open chat/ }).click();
      await say(a, "Ready when you are");
      await say(a, "Second one in a row");
      await say(b, "Let's go! 🎲🎲");
      await say(b, `${"This one is the longest allowed message ".repeat(14)}`.slice(0, 500));
      await b.page.getByRole("button", { name: "Send reaction" }).last().click();
      await b.page.getByRole("button", { name: "React dancing cat" }).click();
      await say(a, "ok");
      for (const [id, scheme] of [
        ["classic-light", "light"],
        ["classic-dark", "dark"],
        ["hearts", "light"],
      ] as const) {
        for (const p of [a, b]) {
          await p.page.evaluate((t) => document.documentElement.setAttribute("data-theme", t), id);
          await p.page.emulateMedia({ colorScheme: scheme });
        }
        await settle(a.page);
        await a.page.screenshot({ path: `${SHOT_DIR}${tag}-${id}-a.png` });
        await b.page.screenshot({ path: `${SHOT_DIR}${tag}-${id}-b.png` });
      }
    } finally {
      await closeAll([a, b]);
    }
  });
}
