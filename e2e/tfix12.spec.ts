/** T-FIX-12 probes: desktop action bar fit, reveal focus trap, results at 360 (EN/FR/ES). Screenshots: TFIX12=1. */
import type { Page } from "@playwright/test";
import {
  boxLocator,
  createGame,
  expect,
  joinGame,
  type Player,
  queueDice,
  startGame,
  test,
} from "./fixtures";
import { closeAll, expectGameOver, newPlayer, roll, uid, waitForRoller } from "./helpers";

// biome-ignore lint/suspicious/noExplicitAny: Node global without @types/node
declare const process: any;
const SHOTS = process.env.TFIX12_OUT ?? "/tmp";
const SHOW = !!process.env.TFIX12;

async function passUntil(players: Player[], done: () => Promise<void>) {
  await expect(async () => {
    for (const { page } of players) {
      const btn = page.locator(".g-submit");
      if ((await btn.isVisible()) && (await btn.isEnabled())) await btn.click({ timeout: 2000 });
    }
    await done();
  }).toPass({ timeout: 25_000, intervals: [100] });
}

async function setPrefs(page: Page, patch: Record<string, unknown>) {
  await page.evaluate((p) => {
    const k = "colorDice:prefs";
    const cur = JSON.parse(localStorage.getItem(k) ?? "{}");
    localStorage.setItem(k, JSON.stringify({ ...cur, ...p }));
  }, patch);
}

const SIZES = [
  { w: 1280, h: 800 },
  { w: 1366, h: 768 },
  { w: 1280, h: 720 },
  { w: 1024, h: 768 },
] as const;

test.describe("T-FIX-12 desktop action bar", () => {
  for (const hintsOff of [false, true]) {
    test(`primary action stays in view (hints ${hintsOff ? "off" : "on"})`, async ({ browser }) => {
      test.setTimeout(120_000);
      const a = await newPlayer(browser, "Alma");
      const b = await newPlayer(browser, "Boris");
      try {
        const code = await createGame(a, { roomName: `Ab ${uid()}`, password: "pw-ab-12", max: 2 });
        await queueDice(code, [6, 1, 3, 4, 2, 5, 1, 2, 3, 4, 5, 6]);
        await joinGame(b, code, "pw-ab-12");
        await setPrefs(a.page, { hintsOff, seenHints: [] });
        await startGame(a);
        await waitForRoller([a, b]);
        await a.page.reload();
        await waitForRoller([a, b]);
        const rollBtn = a.page.locator(".g-primary", { hasText: "Roll" });
        for (const size of SIZES) {
          await a.page.setViewportSize({ width: size.w, height: size.h });
          if (await rollBtn.isVisible()) {
            // Roll button (an inline bar before the roll) is in view too.
            if (SHOW)
              await a.page.screenshot({
                path: `${SHOTS}/roll-${size.w}x${size.h}-${hintsOff ? "off" : "on"}.png`,
              });
            const rb = await rollBtn.boundingBox();
            expect(rb ? rb.y + rb.height : 9999, `roll ${size.w}x${size.h}`).toBeLessThanOrEqual(
              size.h,
            );
          }
        }
        await roll(a.page);
        for (const size of SIZES) {
          await a.page.setViewportSize({ width: size.w, height: size.h });
          await a.page.waitForTimeout(150);
          if (SHOW)
            await a.page.screenshot({
              path: `${SHOTS}/bar-${size.w}x${size.h}-${hintsOff ? "off" : "on"}.png`,
            });
          const btn = a.page.locator(".g-submit");
          await expect(btn).toBeVisible();
          const r = await btn.boundingBox();
          expect(r ? r.y + r.height : 9999, `submit ${size.w}x${size.h}`).toBeLessThanOrEqual(
            size.h,
          );
          // And without any page scroll: the bar is pinned.
          expect(await a.page.evaluate(() => window.scrollY)).toBe(0);
        }
      } finally {
        await closeAll([a, b]);
      }
    });
  }
});

/** Plays a two-player game to GAME_OVER (everyone passes). */
async function toGameOver(a: Player, b: Player) {
  const code = await createGame(a, { roomName: `Fx ${uid()}`, password: "pw-fx-12", max: 2 });
  await queueDice(code, [6, 1]);
  await joinGame(b, code, "pw-fx-12");
  await startGame(a);
  for (let turn = 1; turn <= 7; turn++) {
    const active = turn % 2 === 1 ? a : b;
    const other = active === a ? b : a;
    expect(await waitForRoller([a, b])).toBe(active);
    await roll(active.page);
    const next = turn < 7 ? other.page.locator(".g-primary", { hasText: "Roll" }) : null;
    const done = next ?? active.page.getByRole("dialog", { name: "Results" });
    await passUntil([other, active], () => expect(done).toBeVisible({ timeout: 3000 }));
  }
  for (const p of [a, b]) await expectGameOver(p.page);
}

test.describe("T-FIX-12 reveal dialog", () => {
  test("Tab is trapped, the page is inert, shortcuts stand down, focus returns", async ({
    browser,
  }) => {
    test.setTimeout(120_000);
    const a = await newPlayer(browser, "Alma");
    const b = await newPlayer(browser, "Boris");
    try {
      await toGameOver(a, b);
      const page = a.page;
      const reveal = page.getByTestId("celebration");
      await expect(reveal).toBeVisible();
      for (let i = 0; i < 12; i++) {
        await page.keyboard.press("Tab");
        expect(
          await page.evaluate(() => !!document.activeElement?.closest("[data-testid=celebration]")),
          `tab ${i}`,
        ).toBe(true);
      }
      for (let i = 0; i < 6; i++) {
        await page.keyboard.press("Shift+Tab");
        expect(
          await page.evaluate(() => !!document.activeElement?.closest("[data-testid=celebration]")),
          `shift-tab ${i}`,
        ).toBe(true);
      }
      expect(
        await page.evaluate(
          () => document.querySelector(".g-results-card")?.closest("[inert]") !== null,
        ),
      ).toBe(true);
      // "?" and "c" must not open the shortcuts / chat while the reveal is up.
      await page.keyboard.press("?");
      await page.keyboard.press("c");
      await expect(page.getByRole("dialog", { name: "Keyboard shortcuts" })).toHaveCount(0);
      await expect(page.getByRole("dialog")).toHaveCount(2); // results card + reveal only
      await page
        .getByTestId("rv-show-cards")
        .waitFor({ timeout: 30_000 })
        .catch(async () => {
          await page.getByTestId("rv-skip").click();
        });
      await page.getByTestId("rv-show-cards").click();
      await expect(reveal).toHaveCount(0);
      await expect
        .poll(() => page.evaluate(() => !!document.activeElement?.closest(".g-over-actions")))
        .toBe(true);
      expect(await page.evaluate(() => document.querySelectorAll("[inert]").length)).toBe(0);
    } finally {
      await closeAll([a, b]);
    }
  });
});

const LANGS = ["en", "fr", "es"] as const;
test.describe("T-FIX-12 results at 360", () => {
  test("equation row never wraps; record cell is one line", async ({ browser }) => {
    test.setTimeout(150_000);
    const a = await newPlayer(browser, "Alma");
    const b = await newPlayer(browser, "Boris");
    try {
      await toGameOver(a, b);
      const page = a.page;
      await page
        .getByTestId("rv-skip")
        .click({ timeout: 1500 })
        .catch(() => {});
      await page.getByTestId("rv-show-cards").click({ timeout: 30_000 });
      for (const w of [360, 320]) {
        for (const lang of LANGS) {
          await setPrefs(page, {
            language: lang,
            theme: lang === "en" ? "classic-light" : lang === "fr" ? "midnight" : "sunset",
          });
          await page.setViewportSize({ width: w, height: 740 });
          await page.reload();
          await page
            .getByTestId("rv-skip")
            .click({ timeout: 1500 })
            .catch(() => {});
          await page
            .getByTestId("rv-show-cards")
            .click({ timeout: 1500 })
            .catch(() => {});
          await page.waitForTimeout(1500);
          const probe = await page.evaluate(() => {
            const out: string[] = [];
            for (const eq of document.querySelectorAll<HTMLElement>(".g-results .g-res-eq")) {
              const tops = Array.from(eq.children).map((c) => {
                const el = c.classList.contains("g-total")
                  ? (c.querySelector(".g-total-main") as HTMLElement)
                  : (c.querySelector(".eqn") ?? c);
                return Math.round(el.getBoundingClientRect().top);
              });
              if (Math.max(...tops) - Math.min(...tops) > 6) out.push(`eq wraps ${tops}`);
              const cap = eq.querySelector(".g-pencap")?.getBoundingClientRect();
              const tot = eq.querySelector(".g-total")?.getBoundingClientRect();
              if (
                cap &&
                tot &&
                cap.right > tot.left &&
                cap.bottom > tot.top &&
                cap.top < tot.bottom
              )
                out.push("caption overlaps total");
            }
            for (const td of document.querySelectorAll<HTMLElement>(".g-results [data-record]")) {
              const lh = Number.parseFloat(getComputedStyle(td).lineHeight) || 20;
              if (td.getBoundingClientRect().height > lh * 2.2)
                out.push(`record wraps ${td.textContent}`);
            }
            if (document.documentElement.scrollWidth > innerWidth)
              out.push("page scrolls sideways");
            return out;
          });
          if (SHOW) await page.screenshot({ path: `${SHOTS}/results-${w}-${lang}.png` });
          expect(probe, `${lang} ${w}`).toEqual([]);
        }
      }
    } finally {
      await closeAll([a, b]);
    }
  });
});
