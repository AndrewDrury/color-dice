import { createGame, expect, joinGame, playRollOff, startGame, test } from "./fixtures";
import { closeAll, newPlayer, uid, waitForRoller } from "./helpers";

// T-NEW-22: after 10 s without interaction on your move a loud card appears; a tap hides it.
// Uses page.clock, so there is no real waiting. Set SHOTS=1 to also save screenshots.
declare const process: { env: Record<string, string | undefined> };
const OUT = new URL("./screenshots/", import.meta.url).pathname;

test("idle nudge shows after 10 s on your move and a tap dismisses it", async ({ browser }) => {
  test.setTimeout(90_000);
  const a = await newPlayer(browser, "Nina");
  const b = await newPlayer(browser, "Nick");
  try {
    const code = await createGame(a, { roomName: `Nudge ${uid()}`, password: "pw-nudge", max: 2 });
    await joinGame(b, code, "pw-nudge");
    await startGame(a);
    await playRollOff([a, b]);
    const roller = await waitForRoller([a, b]);
    await roller.page.setViewportSize({ width: 360, height: 640 });
    await roller.page.clock.install();
    await roller.page.reload();
    await expect(roller.page.locator(".g-game")).toHaveAttribute("data-idle-nudge-ready", "true");
    await expect(roller.page.getByTestId("turn-banner")).toHaveClass(/is-mine/);
    await expect(roller.page.getByTestId("idle-nudge")).toHaveCount(0);
    await roller.page.clock.runFor(9_999);
    await expect(roller.page.getByTestId("idle-nudge")).toHaveCount(0);
    await roller.page.clock.runFor(1);
    await expect(roller.page.getByTestId("idle-nudge")).toBeVisible();
    if (process.env.SHOTS) await roller.page.screenshot({ path: `${OUT}idle-nudge-360.png` });
    await roller.page.mouse.click(5, 5);
    await expect(roller.page.getByTestId("idle-nudge")).toHaveCount(0);
    if (process.env.SHOTS) {
      const other = roller === a ? b : a;
      await other.page.setViewportSize({ width: 390, height: 844 });
      await roller.page.setViewportSize({ width: 390, height: 844 });
      for (const [id, scheme] of [
        ["midnight", "dark"],
        ["sunset", "light"],
        ["forest", "dark"],
      ]) {
        for (const [who, p] of [
          ["mine", roller],
          ["other", other],
        ] as const) {
          await p.page.evaluate(
            ([t, d]) => {
              document.documentElement.dataset.theme = t;
              document.documentElement.dataset.scheme = d;
            },
            [id, scheme],
          );
          await p.page.screenshot({ path: `${OUT}turn-${id}-${who}-390.png` });
        }
      }
    }
  } finally {
    await closeAll([a, b]);
  }
});
