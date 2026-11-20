import type { Page } from "@playwright/test";
import { createGame, expect, joinGame, queueDice, startGame, test } from "./fixtures";
import { closeAll, newPlayer, roll, rollFaces, settle, uid, waitForRoller } from "./helpers";

const SHOTS = new URL("./screenshots/", import.meta.url).pathname;

test.describe("browser in French", () => {
  test.use({ locale: "fr-FR" });

  test("auto-detects French on Home, then Español in Settings persists across reload", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Créer une partie" }).first()).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", "fr");

    await page.getByRole("button", { name: "Réglages" }).click();
    const dialog = page.getByRole("dialog", { name: "Réglages" });
    await dialog.getByRole("button", { name: "Español" }).click();
    await expect(page.getByRole("dialog", { name: "Ajustes" })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", "es");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: "Crear partida" }).first()).toBeVisible();

    await page.reload();
    await expect(page.getByRole("button", { name: "Crear partida" }).first()).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", "es");

    // "Auto" goes back to the browser language.
    await page.getByRole("button", { name: "Ajustes" }).click();
    await page
      .getByRole("dialog", { name: "Ajustes" })
      .getByRole("button", { name: "Auto" })
      .click();
    await expect(page.getByRole("dialog", { name: "Réglages" })).toBeVisible();
  });
});

/** No horizontal page scroll; no button text clipped or wrapped to 3+ lines; rail letters fit. */
async function expectFits(page: Page, what: string) {
  const problems = await page.evaluate(() => {
    const out: string[] = [];
    if (document.documentElement.scrollWidth > window.innerWidth) out.push("page scrolls sideways");
    for (const el of document.querySelectorAll<HTMLElement>("button, .btn, .g-rail, .g-status")) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const label = (el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 30);
      if (el.scrollWidth > el.clientWidth + 1) out.push(`overflow: ${label}`);
      const lh = Number.parseFloat(getComputedStyle(el).lineHeight) || 20;
      if (el.matches(".btn, button") && r.height > lh * 2 + 28) out.push(`3 lines: ${label}`);
    }
    return out;
  });
  expect(problems, what).toEqual([]);
}

test("375 px game screen in English, French and Spanish: nothing overflows", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const a = await newPlayer(browser, "Alma");
  const b = await newPlayer(browser, "Boris");
  try {
    await a.page.setViewportSize({ width: 375, height: 667 });
    const code = await createGame(a, {
      roomName: `I18n ${uid()}`,
      password: "pw-i18n",
      max: 2,
    });
    await queueDice(code, [6, 1, ...rollFaces(7)]);
    await joinGame(b, code, "pw-i18n");
    await startGame(a);
    expect(await waitForRoller([a, b])).toBe(a);
    await roll(a.page);
    const langs = [
      ["en", "Submit"],
      ["fr", "Valider"],
      ["es", "Enviar"],
    ] as const;
    for (const [lang, primary] of langs) {
      // Tapping outside the sheet cancels a staged box, so switch language through the pref and
      // reload (the seat resumes), then stage Yellow 7: the primary button is then Submit.
      await a.page.evaluate((l) => {
        const key = "colorDice:prefs";
        const cur = JSON.parse(localStorage.getItem(key) ?? "{}");
        localStorage.setItem(key, JSON.stringify({ ...cur, language: l }));
      }, lang);
      await a.page.reload();
      await expect(a.page.locator("html")).toHaveAttribute("lang", lang);
      await a.page
        .locator(".g-row.c-yellow button.g-box", {
          has: a.page.locator(".g-num", { hasText: /^7$/ }),
        })
        .click();
      await expect(a.page.locator(".g-primary")).toHaveText(primary);
      await settle(a.page);
      await expectFits(a.page, `${lang} @375`);
      await a.page.screenshot({ path: `${SHOTS}i18n-game-375-${lang}.png` });
    }
    // The rail letters come from the catalog (ES: Am / Az).
    await expect(a.page.locator(".g-rail")).toHaveText(["R", "Am", "V", "Az"]);
  } finally {
    await closeAll([a, b]);
  }
});
