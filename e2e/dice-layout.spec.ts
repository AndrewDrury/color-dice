import type { Page } from "@playwright/test";
import { createGame, expect, joinGame, queueDice, startGame, test } from "./fixtures";
import { closeAll, newPlayer, rollFaces, settle, uid, waitForRoller } from "./helpers";

const OUT = new URL("./screenshots/", import.meta.url).pathname;
const SIZES = [
  [360, 640],
  [375, 667],
  [430, 932],
  [1280, 800],
] as const;

// Full motion: the staggered landing is what this spec measures.
test.use({ reducedMotion: "no-preference" });
test.skip(({ isMobile }) => isMobile, "desktop project; sizes are set explicitly");

/** Smallest gap (px) between a text run and the box that holds it, on the tightest side. */
async function clearance(page: Page, selector: string): Promise<number[]> {
  return page.evaluate((sel) => {
    const out: number[] = [];
    for (const el of document.querySelectorAll<HTMLElement>(sel)) {
      const box = el.getBoundingClientRect();
      if (box.width === 0) continue;
      let left = Number.POSITIVE_INFINITY;
      let right = Number.NEGATIVE_INFINITY;
      const take = (rc: DOMRect) => {
        if (rc.width === 0) return;
        left = Math.min(left, rc.left);
        right = Math.max(right, rc.right);
      };
      for (const n of el.childNodes) {
        if (n.nodeType === Node.TEXT_NODE) {
          const r = document.createRange();
          r.selectNodeContents(n);
          if (n.textContent?.trim()) take(r.getBoundingClientRect());
        } else if (n instanceof HTMLElement && getComputedStyle(n).position !== "absolute") {
          take(n.getBoundingClientRect());
        }
      }
      out.push(Math.min(left - box.left, box.right - right));
    }
    return out;
  }, selector);
}

test("dice land left to right and outlines keep clear of their text", async ({ browser }) => {
  test.setTimeout(120_000);
  const a = await newPlayer(browser, "Alma");
  const b = await newPlayer(browser, "Boris");
  try {
    const code = await createGame(a, {
      roomName: `Layout ${uid()}`,
      password: "pw-layout",
      max: 2,
    });
    await queueDice(code, [6, 1, ...rollFaces(7)]);
    await joinGame(b, code, "pw-layout");
    await startGame(a);
    expect(await waitForRoller([a, b])).toBe(a);
    const page = a.page;

    // No invite code and no server address anywhere in the game screen.
    await expect(page.locator(".g-top")).not.toContainText(code);
    await expect(page.locator("body")).not.toContainText(/workers\.dev|localhost:\d+/);

    const start = Date.now();
    await page.locator(".g-primary", { hasText: "Roll" }).click();
    await expect(page.locator("[data-die][data-face]").first()).toBeVisible();
    await expect
      .poll(() => page.locator("[data-die]:not(.is-removed):not([data-face])").count())
      .toBe(0);
    // Tumble (>= 550 ms) + one-at-a-time landing, 400 ms apart (D-L9, < 2.5 s) + round trip.
    expect(Date.now() - start).toBeLessThan(5000);

    for (const [w, h] of SIZES) {
      await page.setViewportSize({ width: w, height: h });
      await settle(page);

      const dice = page.locator("[data-die]:not(.is-removed)");
      expect(await dice.count()).toBe(6);
      const orders = await dice.evaluateAll((els) =>
        els.map((e) => ({
          order: Number((e as HTMLElement).dataset.order),
          x: e.getBoundingClientRect().left,
        })),
      );
      expect(orders.map((d) => d.order)).toEqual([0, 1, 2, 3, 4, 5]);
      for (let i = 1; i < orders.length; i++) {
        expect((orders[i] as { x: number }).x).toBeGreaterThan((orders[i - 1] as { x: number }).x);
      }

      for (const sel of [".g-eq .g-score:not(.g-penscore)", ".g-foot .g-pbox"]) {
        const gaps = await clearance(page, sel);
        expect(gaps.length, `${sel} @${w}`).toBeGreaterThan(0);
        for (const g of gaps) expect(g, `${sel} @${w}x${h}`).toBeGreaterThanOrEqual(3);
      }
      // The total pill: its outline sits clear of the number on every side.
      const pad = await page.evaluate(() => {
        const pill = document.querySelector<HTMLElement>(".g-total--xl");
        const main = document.querySelector<HTMLElement>(".g-total--xl .g-total-main");
        if (!pill || !main) return -1;
        const p = pill.getBoundingClientRect();
        const m = main.getBoundingClientRect();
        return Math.min(m.left - p.left, p.right - m.right, m.top - p.top);
      });
      expect(pad, `total pill @${w}`).toBeGreaterThanOrEqual(4);

      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        `no h-scroll @${w}`,
      ).toBe(true);
      await page.screenshot({ path: `${OUT}dice-layout-${w}x${h}.png` });
    }
  } finally {
    await closeAll([a, b]);
  }
});
