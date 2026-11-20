import type { Page } from "@playwright/test";
import { createGame, expect, joinGame, mark, pass, queueDice, startGame, test } from "./fixtures";
import {
  closeAll,
  expectGameOver,
  newPlayer,
  roll,
  rollFaces,
  uid,
  waitForRoller,
} from "./helpers";

// T-NEW-25: the end-of-game reveal. Default e2e runs with reduced motion, so this spec opts in to motion.
// Opt-in screenshots: REVEAL_OUT=<dir> (frames across the sequence, themes, sizes, five players).
declare const process: { env: Record<string, string | undefined> };
const OUT = process.env.REVEAL_OUT;
test.use({ reducedMotion: "no-preference" });

const overlay = (p: Page) => p.getByTestId("celebration");

/** Two players, four penalties for Alma (turn 7): game over, scores -20 / -15. */
async function playTwo(browser: Parameters<typeof newPlayer>[0]) {
  const a = await newPlayer(browser, "Alma");
  const b = await newPlayer(browser, "Boris");
  const code = await createGame(a, { roomName: `Rv ${uid()}`, password: "pw-reveal", max: 2 });
  await queueDice(code, [6, 1]);
  await joinGame(b, code, "pw-reveal");
  await startGame(a);
  for (let turn = 1; turn <= 7; turn++) {
    const active = turn % 2 === 1 ? a : b;
    const other = active === a ? b : a;
    expect(await waitForRoller([a, b])).toBe(active);
    await roll(active.page);
    await pass(other.page);
    await pass(active.page);
  }
  await expectGameOver(a.page);
  await expectGameOver(b.page);
  return { a, b };
}

test("reveal: skip, full cards, Rematch reachable at every stage @smoke", async ({ browser }) => {
  test.setTimeout(120_000);
  const { a, b } = await playTwo(browser);
  try {
    await a.page.setViewportSize({ width: 360, height: 640 });
    await expect(overlay(a.page)).toBeVisible();
    // Rematch is clickable (not covered) while the sequence runs: the top element at its centre is it.
    const rematch = a.page.getByRole("button", { name: "Rematch" });
    await expect(rematch).toBeVisible();
    const hit = await rematch.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return !!top && el.contains(top);
    });
    expect(hit).toBe(true);
    await expect(a.page.getByTestId("rv-card").first()).toBeVisible();
    await a.page.getByTestId("rv-skip").click();
    await expect(a.page.getByTestId("rv-title")).toContainText("Boris");
    await expect(a.page.getByTestId("rv-card")).toHaveCount(2);
    await a.page.getByRole("button", { name: "Show full score cards" }).click();
    await expect(overlay(a.page)).toHaveCount(0);
    await expect(a.page.locator(".g-final-card")).toHaveCount(2);
    await expect(a.page.getByRole("button", { name: "Rematch" })).toBeVisible();
    // Boris never touches anything: the reveal completes by itself and waits for him.
    await expect(b.page.getByRole("button", { name: "Show full score cards" })).toBeVisible({
      timeout: 15_000,
    });
  } finally {
    await closeAll([a, b]);
  }
});

test("reveal with reduced motion is instant", async ({ browser }) => {
  test.setTimeout(120_000);
  const { a, b } = await playTwo(browser);
  try {
    await a.page.emulateMedia({ reducedMotion: "reduce" });
    await a.page.evaluate(() => sessionStorage.clear());
    await a.page.reload();
    await expect(a.page.getByRole("button", { name: "Show full score cards" })).toBeVisible();
    await expect(a.page.getByTestId("rv-card")).toHaveCount(2);
    await expect(a.page.locator("canvas")).toHaveCount(0);
  } finally {
    await closeAll([a, b]);
  }
});

const THEMES = ["classic-dark", "forest", "hearts"];
const SIZES = [
  { w: 360, h: 640 },
  { w: 1280, h: 800 },
];
const FRAMES = [1000, 1900, 3300, 4500, 5300, 7200];

const FRAMES_5P = [1000, 2600, 4400, 6400, 7600, 8300, 9600, 11500];

async function sequence(
  page: Page,
  tag: string,
  fx: string,
  theme: string,
  frames: number[] = FRAMES,
) {
  if (!OUT) return;
  await page.evaluate(() => sessionStorage.clear());
  const url = new URL(page.url());
  url.searchParams.set("fx", fx);
  await page.goto(url.toString());
  await page.evaluate((th) => document.documentElement.setAttribute("data-theme", th), theme);
  await expect(overlay(page)).toBeVisible();
  const t0 = Date.now();
  for (const ms of frames) {
    await page.waitForTimeout(Math.max(0, ms - (Date.now() - t0)));
    await page.screenshot({ path: `${OUT}/${tag}-${theme}-${fx}-${ms}.png` });
  }
}

test.describe("reveal screenshots @shots", () => {
  test.skip(!OUT, "set REVEAL_OUT=<dir> to capture");

  test("two players: sizes x themes x celebrations", async ({ browser }) => {
    test.setTimeout(300_000);
    const { a, b } = await playTwo(browser);
    try {
      const kinds = ["confetti", "lasers", "hearts", "fireworks", "aurora", "starfield", "disco"];
      let i = 0;
      for (const size of SIZES) {
        await a.page.setViewportSize({ width: size.w, height: size.h });
        for (const theme of THEMES) {
          await sequence(a.page, `2p-${size.w}`, kinds[i++ % kinds.length] as string, theme);
        }
      }
      // Every celebration once at 360, final frame only.
      await a.page.setViewportSize({ width: 360, height: 640 });
      for (const k of kinds) await sequence(a.page, "kinds-360", k, "classic-dark");
    } finally {
      await closeAll([a, b]);
    }
  });
});

// Five players (double lock) for 5-card layouts; same script as five-player.spec.
type Move = [color: string, n: number] | null;
const SUMS = [2, 12, 3, 11, 4, 10, 5, 9, 6, 8, 2, 12];
const MOVES: Record<number, Move[]> = {
  1: [["RED", 2], ["YELLOW", 2], null, null, null],
  2: [null, null, ["GREEN", 12], null, null],
  3: [["RED", 3], ["YELLOW", 3], null, null, null],
  4: [null, null, ["GREEN", 11], null, null],
  5: [["RED", 4], ["YELLOW", 4], null, null, null],
  6: [null, null, ["GREEN", 10], null, null],
  7: [["RED", 5], ["YELLOW", 5], null, null, null],
  8: [null, null, ["GREEN", 9], null, null],
  9: [["RED", 6], ["YELLOW", 6], null, null, null],
  10: [null, null, ["GREEN", 8], null, null],
  11: [null, null, ["GREEN", 2], null, null],
  12: [["RED", 12], ["YELLOW", 12], null, null, null],
};

test.describe("reveal five players @shots", () => {
  test.skip(!OUT, "set REVEAL_OUT=<dir> to capture");

  test("five players", async ({ browser }) => {
    test.setTimeout(240_000);
    const names = ["Pia", "Quinn-with-a-very-long-name-indeed", "Rae", "Sol", "Tess"];
    const ps = await Promise.all(names.map((n) => newPlayer(browser, n)));
    try {
      const code = await createGame(ps[0] as (typeof ps)[0], {
        roomName: `Five ${uid()}`,
        password: "pw-five",
        max: 5,
      });
      const dice = [6, 1, 1, 1, 1];
      for (const [i, s] of SUMS.entries()) dice.push(...rollFaces(s, i < 11 ? 4 : 3));
      await queueDice(code, dice);
      for (const p of ps.slice(1)) await joinGame(p, code, "pw-five");
      await startGame(ps[0] as (typeof ps)[0]);
      for (let turn = 1; turn <= SUMS.length; turn++) {
        const active = ps[(turn - 1) % 5] as (typeof ps)[0];
        expect(await waitForRoller(ps)).toBe(active);
        await roll(active.page);
        const moves = MOVES[turn] as Move[];
        await Promise.all(
          ps.map((p, i) => {
            const m = moves[i];
            return m ? mark(p.page, m[0], m[1]) : pass(p.page);
          }),
        );
      }
      const page = (ps[0] as (typeof ps)[0]).page;
      await expectGameOver(page);
      for (const size of [...SIZES, { w: 375, h: 667 }]) {
        await page.setViewportSize({ width: size.w, height: size.h });
        await sequence(page, `5p-${size.w}`, "confetti", "classic-dark", FRAMES_5P);
      }
      await page.setViewportSize({ width: 360, height: 640 });
      await sequence(page, "5p-360", "hearts", "forest", FRAMES_5P);
    } finally {
      await closeAll(ps);
    }
  });
});
