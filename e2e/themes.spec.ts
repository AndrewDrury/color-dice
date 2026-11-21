import { createGame, expect, joinGame, playRollOff, startGame, test } from "./fixtures";
import { closeAll, newPlayer, settle, uid } from "./helpers";

// Opt-in: `SHOTS=1 npm run e2e -- themes`. Captures every theme on the profile screen (picked
// through the ThemePicker, so it also checks the live apply) and on the game screen.
declare const process: { env: Record<string, string | undefined> };
const OUT = new URL("./screenshots/themes/", import.meta.url).pathname;
const THEMES: [string, string][] = [
  ["classic-light", "Classic light"],
  ["classic-dark", "Classic dark"],
  ["hearts", "Hearts"],
  ["midnight", "Midnight"],
  ["ocean", "Ocean"],
  ["forest", "Forest"],
  ["lavender", "Lavender"],
  ["sunset", "Sunset"],
  ["sakura", "Sakura"],
  ["candy", "Candy"],
  ["synthwave", "Synthwave"],
  ["aurora", "Aurora"],
  ["desert", "Desert"],
  ["coffee", "Coffee"],
  ["mint", "Mint"],
  ["space", "Space"],
  ["autumn", "Autumn"],
  ["ice", "Ice"],
  ["graphite", "Graphite"],
];
const DARK = [
  "classic-dark",
  "midnight",
  "ocean",
  "forest",
  "synthwave",
  "aurora",
  "coffee",
  "space",
  "graphite",
];

test.describe("themes @shots", () => {
  test.skip(!process.env.SHOTS, "set SHOTS=1 to capture screenshots");

  for (const scheme of ["light", "dark"] as const) {
    test(`themes on profile + game, system ${scheme}`, async ({ browser }) => {
      test.setTimeout(180_000);
      const a = await newPlayer(browser, "Alma");
      const b = await newPlayer(browser, "Boris");
      try {
        for (const p of [a, b]) {
          await p.page.setViewportSize({ width: 390, height: 844 });
          await p.page.emulateMedia({ colorScheme: scheme });
        }
        await a.page.goto("/");
        await a.page.getByRole("button", { name: "Create game" }).first().click();
        for (const [id, name] of THEMES) {
          await a.page.getByRole("radio", { name }).check({ force: true });
          await expect(a.page.locator("html")).toHaveAttribute("data-theme", id);
          await settle(a.page);
          await a.page.screenshot({ path: `${OUT}${scheme}-${id}-profile.png` });
        }
        const code = await createGame(a, {
          roomName: `Th ${uid()}`,
          password: "pw-themes",
          max: 2,
        });
        await joinGame(b, code, "pw-themes");
        await startGame(a);
        await playRollOff([a, b]);
        for (const [id] of THEMES) {
          for (const p of [a]) {
            await p.page.evaluate(
              ([t, d]) => {
                const r = document.documentElement;
                r.dataset.theme = t;
                r.dataset.scheme = d;
              },
              [id, DARK.includes(id) ? "dark" : "light"] as [string, string],
            );
            await settle(p.page);
            await p.page.screenshot({ path: `${OUT}${scheme}-${id}-game.png` });
          }
        }
      } finally {
        await closeAll([a, b]);
      }
    });
  }
});
