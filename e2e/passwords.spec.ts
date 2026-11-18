import { request } from "@playwright/test";
import { createGame, expect, SERVER, test } from "./fixtures";
import { closeAll, newPlayer, uniqueIp } from "./helpers";

async function openJoinDialog(
  page: import("@playwright/test").Page,
  code: string,
  name: string,
  pw: string,
) {
  await page.goto("/");
  await page.getByLabel("Have an invite code?").fill(code);
  await page.getByRole("button", { name: "Join", exact: true }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Your name").fill(name);
  await dialog.getByLabel("Password", { exact: true }).fill(pw);
  await dialog.getByRole("button", { name: "Join", exact: true }).click();
  return dialog;
}

test("wrong password is refused with a clear message", async ({ browser }) => {
  const host = await newPlayer(browser, "Hedda");
  const guest = await newPlayer(browser, "Gus");
  try {
    const code = await createGame(host, {
      roomName: `Pw ${Date.now() % 10000}`,
      password: "right-pw",
    });
    const dialog = await openJoinDialog(guest.page, code, "Gus", "nope-nope");
    await expect(dialog.getByText("Wrong password.")).toBeVisible();
    await expect(host.page.getByText("Gus")).toHaveCount(0);
  } finally {
    await closeAll([host, guest]);
  }
});

const BANNER = "wrong passwords 10 times";

/** 10 wrong passwords, each from its own IP so the per-IP join limit (5/min) cannot fire first. */
async function lockRoom(code: string) {
  for (let i = 0; i < 10; i++) {
    const api = await request.newContext({
      baseURL: SERVER,
      extraHTTPHeaders: { "cf-connecting-ip": uniqueIp() },
    });
    const res = await api.post(`/api/games/${code}/join`, {
      data: { name: "Mallory", password: `wrong-${i}-pw` },
    });
    expect(res.status()).toBe(401);
    await api.dispose();
  }
}

test("10 wrong attempts lock the room: the right password is refused, the host sees the banner", async ({
  browser,
}) => {
  test.setTimeout(90_000);
  const host = await newPlayer(browser, "Hedda");
  const guest = await newPlayer(browser, "Gus");
  try {
    const code = await createGame(host, {
      roomName: `Lock ${Date.now() % 10000}`,
      password: "right-pw",
    });
    await lockRoom(code);

    // Even the right password is refused (lockout, or the rate limit; both are acceptable).
    const dialog = await openJoinDialog(guest.page, code, "Gus", "right-pw");
    await expect(dialog.getByText(/Wrong password\.|Too many attempts/)).toBeVisible();
    await expect(guest.page.getByRole("button", { name: "Leave" })).toHaveCount(0);

    // The host sees the lockout banner live (no reload needed).
    await host.page.reload();
    await expect(host.page.getByRole("alert").filter({ hasText: BANNER })).toBeVisible();
    await expect(host.page.getByText("Gus")).toHaveCount(0);
  } finally {
    await closeAll([host, guest]);
  }
});

test("host sees the lockout banner live, without reloading", async ({ browser }) => {
  const host = await newPlayer(browser, "Hedda");
  try {
    const code = await createGame(host, {
      roomName: `Live ${Date.now() % 10000}`,
      password: "right-pw",
    });
    await lockRoom(code);
    await expect(host.page.getByRole("alert").filter({ hasText: BANNER })).toBeVisible();
  } finally {
    await closeAll([host]);
  }
});
