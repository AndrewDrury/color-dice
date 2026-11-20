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
import {
  closeAll,
  frames,
  newPlayer,
  roll,
  rollFaces,
  settle,
  uid,
  waitForRoller,
} from "./helpers";

// Full motion: the tumble and settle timing is what these tests measure.
test.use({ reducedMotion: "no-preference" });
// The config also runs *.spec.ts in the desktop project; this spec needs touch.
test.skip(({ isMobile }) => !isMobile, "mobile-chromium project only");

const WIDTHS = [375, 390] as const;

async function expectNoHScroll(page: Page, what: string) {
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 800 });
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), {
        message: `${what} @${width}px`,
        timeout: 5000,
      })
      .toBe(true);
  }
}

/** Buttons / chips smaller than 44x44 (visible ones only). */
async function smallTargets(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    const sel = "button, [role=button], a[href], .g-chip, .btn, input, [role=radio], label.radio";
    for (const el of document.querySelectorAll<HTMLElement>(sel)) {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      if (r.width === 0 || r.height === 0 || cs.visibility === "hidden" || cs.display === "none")
        continue;
      if (el.closest(".sr-only, [hidden]")) continue;
      // Sheet cells are exempt from 44x44 (H-ui-ux H3: whole-cell target, >= 26x40); checked apart.
      if (el.classList.contains("g-box")) continue;
      if (r.width < 43.5 || r.height < 43.5) {
        const label = el.getAttribute("aria-label") ?? el.textContent?.trim().slice(0, 20) ?? "";
        out.push(
          `${el.tagName.toLowerCase()}.${el.className} "${label}" ${Math.round(r.width)}x${Math.round(r.height)}`,
        );
      }
    }
    return out;
  });
}

test("mobile: no horizontal scroll, reachable action bar, tap targets, dice, staging @smoke", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const a = await newPlayer(browser, "Mara");
  const b = await newPlayer(browser, "Milo");
  const players: Player[] = [a, b];
  // Frames B sends (to prove that a first tap sends nothing).
  const sentByB: string[] = [];
  b.page.on("websocket", (ws) => ws.on("framesent", (f) => sentByB.push(String(f.payload))));
  try {
    // Sanity: this is the mobile project with full motion.
    expect(
      await a.page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches),
    ).toBe(false);

    await a.page.goto("/");
    await expectNoHScroll(a.page, "home");
    expect(await smallTargets(a.page)).toEqual([]);

    const code = await createGame(a, {
      roomName: `Mobile ${uid()}`,
      password: "pw-mob",
      max: 2,
    });
    await expectNoHScroll(a.page, "waiting room");

    // Simultaneous roll-off (spec §17 A-1): Mara 6, Milo 1 → Mara starts; whites 6+1 = 7, colors 1.
    await queueDice(code, [6, 1, ...rollFaces(7)]);
    await joinGame(b, code, "pw-mob"); // fills the room: the game auto-starts
    await startGame(a);
    expect(await waitForRoller(players)).toBe(a);
    for (const p of players) {
      await expectNoHScroll(p.page, "game (before roll)");
      await p.page.setViewportSize({ width: 390, height: 844 });
    }

    // One Roll control only (the ActionBar's), and the play loop needs no page scroll at 375x667.
    await expect(a.page.getByRole("button", { name: /roll/i })).toHaveCount(1);
    // K4.3: the Roll button sits right under the dice tray.
    const trayBox = await a.page.locator(".tray").boundingBox();
    const rollBox = await a.page.getByRole("button", { name: /roll/i }).boundingBox();
    expect(Math.abs((rollBox?.y ?? 0) - ((trayBox?.y ?? 0) + (trayBox?.height ?? 0)))).toBeLessThan(
      24,
    );
    await a.page.setViewportSize({ width: 375, height: 667 });
    await expect
      .poll(() =>
        a.page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight),
      )
      .toBe(true);
    await a.page.setViewportSize({ width: 390, height: 844 });

    // Scripted dice: every die shows its scripted face within 1.5 s of tapping Roll.
    for (const p of players) await expect(p.page.getByTestId("rolloff")).toHaveCount(0);
    const t0 = Date.now();
    await a.page.locator(".g-primary", { hasText: "Roll" }).tap();
    const expected = [6, 1, 1, 1, 1, 1];
    for (const p of players) {
      await expect
        .poll(
          () =>
            p.page
              .locator("[data-die]")
              .evaluateAll((els) => els.map((e) => e.getAttribute("data-face"))),
          { timeout: 5000 }, // D-L9: dice land 400 ms apart (≈ 2.8 s for six)
        )
        .toHaveLength(6);
      await expect
        .poll(
          async () =>
            (
              await p.page
                .locator("[data-die]")
                .evaluateAll((els) => els.map((e) => Number(e.getAttribute("data-face"))))
            ).sort(),
          { timeout: 5000 },
        )
        .toEqual([...expected].sort());
    }
    expect(Date.now() - t0).toBeLessThan(6000); // generous bound: tumble + 400 ms-apart landings
    // The two whites show 6 and 1, the four colored dice 1 each.
    const faces = await b.page
      .locator("[data-die]")
      .evaluateAll((els) =>
        els.map((e) => [e.getAttribute("data-color"), e.getAttribute("data-face")]),
      );
    expect(
      faces
        .filter(([c]) => c === "WHITE")
        .map(([, f]) => f)
        .sort(),
    ).toEqual(["1", "6"]);
    expect(faces.filter(([c]) => c !== "WHITE").map(([, f]) => f)).toEqual(["1", "1", "1", "1"]);

    // The action bar is fully on screen (no scrolling) on both pages and both widths.
    for (const p of players) {
      for (const width of WIDTHS) {
        await p.page.setViewportSize({ width, height: 844 });
        const box = await p.page.locator(".g-actionbar").boundingBox();
        expect(box).not.toBeNull();
        const vp = p.page.viewportSize() as { width: number; height: number };
        expect(box?.x).toBeGreaterThanOrEqual(0);
        expect(box?.y).toBeGreaterThanOrEqual(0);
        expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(vp.width + 0.5);
        expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(vp.height + 0.5);
      }
      await expectNoHScroll(p.page, "game (after roll)");
    }
    await b.page.setViewportSize({ width: 390, height: 844 });

    // After a roll (coaching hint showing) the play loop still needs no page scroll on small phones,
    // and the hint's "Got it" button sits fully inside the viewport, clear of the action bar.
    for (const [w, h] of [
      [360, 640],
      [375, 667],
    ] as const) {
      for (const p of players) {
        await p.page.setViewportSize({ width: w, height: h });
        await settle(p.page);
        const m = await p.page.evaluate(() => ({
          over: document.documentElement.scrollHeight - window.innerHeight,
          hint:
            document.querySelector(".g-hintline .btn")?.getBoundingClientRect().toJSON() ?? null,
          bar: document.querySelector(".g-actionbar")?.getBoundingClientRect().toJSON() ?? null,
          cells: [...document.querySelectorAll<HTMLElement>(".g-box")].map((e) => e.offsetWidth),
        }));
        expect(m.over, `page scroll @${w}x${h}`).toBeLessThanOrEqual(0);
        expect(Math.min(...m.cells), `min cell @${w}x${h}`).toBeGreaterThanOrEqual(26);
        if (m.hint && m.bar) {
          expect(m.hint.bottom, "hint above action bar").toBeLessThanOrEqual(m.bar.top + 0.5);
          expect(m.hint.top).toBeGreaterThanOrEqual(0);
        }
      }
    }
    for (const p of players) await p.page.setViewportSize({ width: 390, height: 844 });

    // Every button and chip is at least 44x44 (sheet cells: H3, whole cell, 40 px tall).
    for (const p of players) {
      expect(await smallTargets(p.page)).toEqual([]);
      for (const width of WIDTHS) {
        await p.page.setViewportSize({ width, height: 844 });
        const cells = await p.page
          .locator(".g-box")
          .evaluateAll((els) =>
            els.map((e) => e.getBoundingClientRect()).map((r) => [r.width, r.height]),
          );
        expect(cells.length).toBeGreaterThan(0);
        for (const [w, h] of cells) {
          // H3: >= 26 px wide cells (measured by bounding rect).
          expect(w).toBeGreaterThanOrEqual(26);
          expect(h).toBeGreaterThanOrEqual(40);
        }
      }
    }

    // Staging: tapping a legal box sends nothing, Submit does.
    const before = sentByB.filter((f) => !f.includes('"ping"')).length;
    await boxLocator(b.page, "RED", 7).tap();
    await expect(b.page.locator(".g-submit")).toHaveText("Submit");
    await settle(b.page);
    expect(sentByB.filter((f) => !f.includes('"ping"')).length).toBe(before);
    await b.page.locator(".g-submit").tap();
    await expect
      .poll(() => sentByB.filter((f) => !f.includes('"ping"')).length)
      .toBeGreaterThan(before);
    expect(sentByB.at(-1)).toContain("RED");
    // Cross animation uses transform/opacity only: layout width never shrinks during it.
    for (let i = 0; i < 6; i++) {
      const w = await b.page
        .locator(".g-box")
        .evaluateAll((els) => Math.min(...els.map((e) => (e as HTMLElement).offsetWidth)));
      expect(w).toBeGreaterThanOrEqual(26);
      await frames(b.page, 1);
    }

    // Reload: the same faces at once, nothing tumbling.
    await a.page.reload();
    await a.page.locator("[data-die]").first().waitFor();
    const state = await a.page.evaluate(() => ({
      faces: [...document.querySelectorAll("[data-die]")].map((e) => e.getAttribute("data-face")),
      moving: document.querySelectorAll("[data-die].is-moving").length,
    }));
    expect(state.moving).toBe(0);
    expect(state.faces.map(Number).sort()).toEqual([...expected].sort());
  } finally {
    await closeAll(players);
  }
});
