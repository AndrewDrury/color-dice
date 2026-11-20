/** T-FIX-16 probes (opt-in: TFIX16=1): game-over celebration dismissal + screenshots of the fixed screens. */
import type { Page } from "@playwright/test";
import { createGame, expect, joinGame, type Player, queueDice, startGame, test } from "./fixtures";
import { closeAll, expectGameOver, newPlayer, roll, uid, waitForRoller } from "./helpers";

test.skip(!process.env.TFIX16, "opt-in probe");
// biome-ignore lint/suspicious/noExplicitAny: Node global without @types/node
declare const process: any;
const OUT = process.env.TFIX16_OUT ?? "/tmp";

async function passUntil(players: Player[], done: () => Promise<void>) {
  await expect(async () => {
    for (const { page } of players) {
      const btn = page.locator(".g-submit");
      if ((await btn.isVisible()) && (await btn.isEnabled())) await btn.click({ timeout: 2000 });
    }
    await done();
  }).toPass({ timeout: 25_000, intervals: [100] });
}

const SIZES = [
  { w: 1280, h: 800 },
  { w: 360, h: 640 },
] as const;

for (const size of SIZES) {
  for (const motion of ["reduce", "no-preference"] as const) {
    test(`celebration dismissal ${size.w}x${size.h} ${motion}`, async ({ browser }) => {
      test.setTimeout(120_000);
      const a = await newPlayer(browser, "Alma");
      const b = await newPlayer(browser, "Boris");
      try {
        for (const p of [a, b]) {
          await p.page.setViewportSize({ width: size.w, height: size.h });
          await p.page.emulateMedia({ reducedMotion: motion });
        }
        const code = await createGame(a, { roomName: `Cel ${uid()}`, password: "pw-cel1", max: 2 });
        await queueDice(code, [6, 1]);
        await joinGame(b, code, "pw-cel1");
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
        const cel = (p: Page) => p.getByTestId("celebration");
        await expect(cel(a.page)).toHaveCount(1);
        const t0 = Date.now();
        // Alma: one Skip tap. Boris: do nothing, it must clear by itself.
        await a.page.getByRole("button", { name: "Skip" }).click();
        await expect(cel(a.page)).toHaveCount(0, { timeout: 2000 });
        await expect(cel(b.page)).toHaveCount(0, { timeout: 60_000 });
        console.log(
          `CEL ${size.w}x${size.h} ${motion}: skip ok; auto-dismiss after ${Date.now() - t0} ms`,
        );
        await a.page.screenshot({ path: `${OUT}/${size.w}x${size.h}-${motion}-results.png` });
      } finally {
        await closeAll([a, b]);
      }
    });
  }
}

for (const size of [...SIZES, { w: 375, h: 667 }]) {
  test(`rolloff winner 5 players ${size.w}x${size.h}`, async ({ browser }) => {
    test.setTimeout(90_000);
    const names = ["Pia", "Quinn", "Rae", "Sol", "Tess"];
    const ps = await Promise.all(names.map((n) => newPlayer(browser, n)));
    try {
      // Re-register nothing: auto "Let's go" handler would hide the state, so remove via fresh page logic below.
      const code = await createGame(ps[0]!, {
        roomName: `Ro ${uid()}`,
        password: "pw-ro-5",
        max: 5,
      });
      await queueDice(code, [6, 5, 4, 3, 2]);
      for (const p of ps.slice(1)) await joinGame(p, code, "pw-ro-5");
      await startGame(ps[0]!);
      const page = ps[4]!.page;
      await page.setViewportSize({ width: size.w, height: size.h });
      await page.removeLocatorHandler(page.getByTestId("rolloff-go"));
      await expect(page.getByTestId("rolloff-go")).toBeVisible({ timeout: 30_000 });
      await page.waitForTimeout(800);
      const m = await page.evaluate(() => {
        const r = document.querySelector('[data-testid="rolloff-go"]')!.getBoundingClientRect();
        return { bottom: r.bottom, vh: innerHeight };
      });
      console.log(`RO ${size.w}x${size.h}: go bottom=${m.bottom} vh=${m.vh}`);
      await page.screenshot({ path: `${OUT}/${size.w}x${size.h}-rolloff-win.png` });
      expect(m.bottom).toBeLessThanOrEqual(m.vh);
    } finally {
      await closeAll(ps);
    }
  });
}

for (const size of [...SIZES, { w: 375, h: 667 }]) {
  test(`banner, footer, join ${size.w}x${size.h}`, async ({ browser }) => {
    test.setTimeout(90_000);
    const a = await newPlayer(browser, "Alma");
    const b = await newPlayer(browser, "Boris");
    try {
      for (const p of [a, b]) await p.page.setViewportSize({ width: size.w, height: size.h });
      const code = await createGame(a, { roomName: `Bn ${uid()}`, password: "pw-bn-12", max: 2 });
      await queueDice(code, [6, 1]);
      // Join dialog first (a third context), before b joins.
      const c = await newPlayer(browser, "Cy");
      await c.page.setViewportSize({ width: size.w, height: size.h });
      await c.page.goto("/");
      await c.page.getByLabel("Have an invite code?").fill(code);
      await c.page.getByRole("button", { name: "Join", exact: true }).first().click();
      await c.page.waitForTimeout(600);
      const jb = c.page.getByRole("dialog").getByRole("button", { name: "Join", exact: true });
      {
        const r = await jb.boundingBox();
        console.log(`JOIN ${size.w}x${size.h}: bottom=${r ? r.y + r.height : "?"} vh=${size.h}`);
        await c.page.screenshot({ path: `${OUT}/${size.w}x${size.h}-join.png` });
      }
      await c.context.close();
      await joinGame(b, code, "pw-bn-12");
      await startGame(a);
      await expect(async () => {
        await a.page
          .getByTestId("rolloff-go")
          .click({ timeout: 500 })
          .catch(() => {});
        await expect(a.page.getByTestId("turn-banner")).toBeVisible({ timeout: 500 });
      }).toPass({ timeout: 30_000 });
      await a.page
        .getByRole("button", { name: /^Roll/ })
        .first()
        .click()
        .catch(() => {});
      await expect(a.page.getByTestId("turn-banner")).toContainText(/Pick|Roll/);
      for (const theme of ["classic-dark", "forest", "hearts"]) {
        await a.page.evaluate(
          (th) => document.documentElement.setAttribute("data-theme", th),
          theme,
        );
        await a.page.waitForTimeout(300);
        await a.page.screenshot({ path: `${OUT}/${size.w}x${size.h}-banner-${theme}.png` });
      }
      const sc = await a.page.evaluate(() => ({
        sw: document.documentElement.scrollWidth,
        sh: document.documentElement.scrollHeight,
      }));
      console.log(`SCROLL ${size.w}x${size.h}: ${JSON.stringify(sc)}`);
    } finally {
      await closeAll([a, b]);
    }
  });
}
