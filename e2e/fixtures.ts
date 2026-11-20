import {
  type Browser,
  type BrowserContext,
  test as base,
  expect,
  type Page,
  request,
} from "@playwright/test";

export { expect };
export const test = base;

// Minimal typing for the Node global (no @types/node dependency).
declare const process: { env: Record<string, string | undefined> };
export const CLIENT = `http://localhost:${process.env.E2E_CLIENT_PORT ?? "5173"}`;
export const SERVER = `http://localhost:${process.env.E2E_SERVER_PORT ?? "8787"}`;

export interface Player {
  context: BrowserContext;
  page: Page;
  name: string;
}

export interface CreateOpts {
  roomName: string;
  password: string;
  max?: number;
  listed?: boolean;
  cpu?: number;
}

/** A separate browser context per player = a separate "computer" (own storage). */
export async function newPlayer(browser: Browser, name: string): Promise<Player> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await autoDismissRollOff(page);
  return { context, page, name };
}

/**
 * T-NEW-17 (D-L2): the roll-off result stays until "Let's go" is pressed. Specs that are not
 * about the roll-off get it pressed for them whenever it blocks an action or assertion.
 */
export async function autoDismissRollOff(page: Page) {
  await page.addLocatorHandler(page.getByTestId("rolloff-go"), async (go) => {
    await go.click();
  });
}

export function codeOf(page: Page): string {
  const code = new URL(page.url()).searchParams.get("game");
  if (!code) throw new Error(`no ?game= in ${page.url()}`);
  return code;
}

/** Host creates a room; resolves with its code once the waiting room shows. */
export async function createGame(player: Player, o: CreateOpts): Promise<string> {
  const { page } = player;
  await page.goto("/");
  await page.getByRole("button", { name: "Create game" }).first().click();
  await page.getByLabel("Room name").fill(o.roomName);
  await page.getByLabel("Your name").fill(player.name);
  await page.getByLabel("Password", { exact: true }).fill(o.password);
  if (o.max !== undefined)
    await page.locator(`label:has(input[name="maxPlayers"][value="${o.max}"])`).click();
  if (o.listed === false) await page.getByLabel("Show in public list").uncheck();
  await page.getByRole("button", { name: "Create game" }).last().click();
  // Generous: the first rooms of a run hit a cold server while every worker starts at once.
  await expect(page.getByRole("button", { name: "Leave" })).toBeVisible({ timeout: 30_000 });
  if (o.cpu !== undefined) {
    for (let i = 0; i < o.cpu; i++) {
      await page.getByRole("button", { name: "Add CPU" }).click();
      await expect(
        page.getByText(`${i + 1} CPU${i === 0 ? "" : "s"}`, { exact: true }),
      ).toBeVisible();
    }
  }
  return codeOf(page);
}

/** Join through the public list (the room must be listed). */
export async function joinGame(player: Player, code: string, password: string, roomName?: string) {
  const { page } = player;
  await page.goto("/");
  if (roomName) {
    await page.getByRole("button", { name: `Join ${roomName}` }).click();
  } else {
    await page.getByLabel("Have an invite code?").fill(code);
    await page.getByRole("button", { name: "Join", exact: true }).first().click();
  }
  await fillJoin(player, password);
}

async function fillJoin(player: Player, password: string) {
  const { page } = player;
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Your name").fill(player.name);
  await dialog.getByLabel("Password", { exact: true }).fill(password);
  await dialog.getByRole("button", { name: "Join", exact: true }).click();
  // Joining the last free seat starts the game, so the guest may land on the game screen.
  // (or the opening roll-off, T-NEW-2, for an unscripted game).
  await expect(
    page
      .getByRole("button", { name: "Leave" })
      .or(page.locator(".g-main"))
      .or(page.getByTestId("rolloff-roll"))
      .first(),
  ).toBeVisible({ timeout: 30_000 });
}

/**
 * Starts the game from the host's waiting room. A room that is full starts by itself
 * (T-UX-17), so this only clicks Start for a part-full room; queue scripted dice BEFORE
 * the join that fills the room, because that join rolls the opening dice.
 */
export async function startGame(host: Player) {
  const { page } = host;
  const start = page.getByRole("button", { name: /^Start/ });
  const inLobby = page.getByRole("heading", { name: /^Players/ });
  await expect
    .poll(async () => (await start.isVisible()) || !(await inLobby.isVisible()), {
      timeout: 15_000,
    })
    .toBe(true);
  if (await start.isVisible()) await start.click();
}

/**
 * Plays the interactive opening roll-off (T-NEW-2) for unscripted games: every rolling player
 * taps Roll each round (after a tie only the tied pages have an enabled Roll), then "Let's go" on the result (T-NEW-17, D-L2), until every page
 * shows the game board with no roll-off screen over it.
 */
export async function playRollOff(players: Player[]) {
  await expect
    .poll(
      async () => {
        let boards = 0;
        for (const { page } of players) {
          const go = page.getByTestId("rolloff-go");
          if (await go.isVisible()) await go.click({ timeout: 2000 }).catch(() => {});
          const roll = page.getByTestId("rolloff-roll");
          if ((await roll.isVisible()) && (await roll.isEnabled())) {
            await roll.click({ timeout: 2000 }).catch(() => {});
          }
          const covered = await page.locator(".ro-screen").isVisible();
          if (!covered && (await page.locator(".g-main").isVisible())) boards += 1;
        }
        return boards === players.length;
      },
      { timeout: 45_000, intervals: [250] },
    )
    .toBe(true);
}

/** Queue scripted dice (server must run with ALLOW_TEST_HOOKS=1). */
export async function queueDice(code: string, faces: number[]) {
  const api = await request.newContext({ baseURL: SERVER });
  try {
    const res = await api.post(`/api/games/${code}/__test/dice`, { data: { faces } });
    expect(res.status()).toBe(204);
  } finally {
    await api.dispose();
  }
}

/** Collects every text frame received on every WebSocket of the page. */
export function collectWsFrames(page: Page): string[] {
  const frames: string[] = [];
  page.on("websocket", (ws) => {
    ws.on("framereceived", (f) => {
      frames.push(typeof f.payload === "string" ? f.payload : f.payload.toString("utf8"));
    });
  });
  return frames;
}

const COLOR_LABEL: Record<string, string> = {
  RED: "Red",
  YELLOW: "Yellow",
  GREEN: "Green",
  BLUE: "Blue",
};

export function boxLocator(page: Page, color: string, n: number) {
  const c = COLOR_LABEL[color.toUpperCase()] ?? color;
  return page.getByRole("button", { name: new RegExp(`^${c} ${n},`) });
}

/** Tap a box to stage it, then tap the primary button to confirm. */
export async function mark(page: Page, color: string, n: number) {
  await boxLocator(page, color, n).click();
  await page.locator(".g-submit").click();
}

/** One-click pass / skip (K4.4): it sends at once. */
export async function pass(page: Page) {
  await page.locator(".g-submit").click();
}

/** Tap Roll and wait until every die has landed (has data-face) and the tray has settled. */
export async function roll(page: Page) {
  // The waiting room hands over to the game screen with a fresh socket; a tap while it is still
  // (re)connecting is dropped silently. Tap again until the dice appear (a tap after the roll
  // landed is impossible: the Roll button is gone).
  const rollBtn = page.locator(".g-primary", { hasText: "Roll" });
  await expect(async () => {
    if ((await rollBtn.isVisible()) && (await rollBtn.isEnabled())) {
      await rollBtn.click({ timeout: 2000 });
    }
    await expect(page.locator("[data-die][data-face]").first()).toBeVisible({ timeout: 4000 });
  }).toPass({ timeout: 25_000, intervals: [100] });
  // A tap on the tray skips the landing animation (a product feature): the end state is the
  // same, so the helper does not sit through 6 x 400 ms of it. Specs that time the dice tap Roll themselves.
  await page.locator(".tray").dispatchEvent("click");
  const dice = page.locator("[data-die]");
  await expect
    .poll(
      async () =>
        (await dice.count()) > 0 &&
        (await page.locator("[data-die]:not([data-face])").count()) === 0,
    )
    .toBe(true);
  // D-L9: dice land one at a time, 400 ms apart; the tray is `data-settled` after the last.
  await expect(page.locator(".tray[data-settled]")).toBeVisible();
}
