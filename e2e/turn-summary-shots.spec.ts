import { boxLocator, createGame, joinGame, queueDice, startGame, test } from "./fixtures";
import { closeAll, newPlayer, roll, rollFaces, uid, waitForRoller } from "./helpers";

// Opt-in: `SHOTS=1 npm run e2e -- turn-summary-shots`. Captures the turn summary within its 4 s window:
// desktop (over the moves card) for Alma, phone widths (centre sheet) for Boris, in three themes.
declare const process: { env: Record<string, string | undefined> };
const OUT = new URL("./screenshots/turn-summary/", import.meta.url).pathname;
const THEMES: [string, string][] = [
  ["classic", "light"],
  ["midnight", "dark"],
  ["sunset", "light"],
];

test.describe("turn summary @shots", () => {
  test.skip(!process.env.SHOTS, "set SHOTS=1 to capture screenshots");
  test.use({ reducedMotion: "reduce" });

  test("summary in three themes, desktop and phone", async ({ browser }) => {
    test.setTimeout(120_000);
    const a = await newPlayer(browser, "Alma");
    const b = await newPlayer(browser, "Boris-with-a-very-long-name");
    try {
      await a.page.setViewportSize({ width: 1280, height: 800 });
      await b.page.setViewportSize({ width: 390, height: 844 });
      const code = await createGame(a, { roomName: `Ts ${uid()}`, password: "pw-ts", max: 2 });
      await queueDice(code, [6, 1, ...rollFaces(7)]);
      await joinGame(b, code, "pw-ts");
      await startGame(a);
      await waitForRoller([a, b]);
      await roll(a.page);
      await boxLocator(a.page, "RED", 7).click();
      await boxLocator(a.page, "YELLOW", 7).click();
      await a.page.getByRole("button", { name: "Submit" }).click();
      await boxLocator(b.page, "RED", 7).click();
      await b.page.getByRole("button", { name: "Submit" }).click();
      await a.page.getByTestId("turn-summary").waitFor();
      await b.page.getByTestId("turn-summary").waitFor();
      for (const [id, scheme] of THEMES) {
        for (const p of [a, b]) {
          await p.page.evaluate(
            ([t, s]) => {
              const r = document.documentElement;
              r.dataset.theme = t;
              r.dataset.scheme = s;
            },
            [id, scheme],
          );
        }
        await a.page.screenshot({ path: `${OUT}desktop-${id}.png` });
        await b.page.screenshot({ path: `${OUT}390-${id}.png` });
        await b.page.setViewportSize({ width: 360, height: 640 });
        await b.page.screenshot({ path: `${OUT}360-${id}.png` });
        console.log(
          id,
          await b.page.evaluate(() => {
            const c = document.querySelector(".g-chips") as HTMLElement | null;
            const k = document.querySelector(".g-chip") as HTMLElement | null;
            return `chips ${c?.clientHeight}/${c?.scrollHeight} chip ${k?.offsetHeight} page ${document.documentElement.scrollHeight}/${innerHeight}`;
          }),
        );
        await b.page.setViewportSize({ width: 390, height: 844 });
      }
    } finally {
      await closeAll([a, b]);
    }
  });
});
