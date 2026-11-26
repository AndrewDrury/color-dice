import { createGame, expect, joinGame, mark, pass, queueDice, startGame, test } from "./fixtures";
import {
  closeAll,
  expectGameOver,
  newPlayer,
  roll,
  rollFaces,
  settle,
  uid,
  waitForRoller,
} from "./helpers";

// Opt-in (R4 uses the PNGs): `SHOTS=1 npm run e2e -- screenshots`. Tagged @shots.
// The config has no grepInvert for it, so the skip lives here.
declare const process: { env: Record<string, string | undefined> };

const OUT = new URL("./screenshots/", import.meta.url).pathname;
const SIZES = [
  [360, 640],
  [375, 667],
  [390, 844],
  [430, 932],
  [844, 390],
  [1280, 800],
  [1920, 1080],
] as const;
const THEMES = ["light", "dark"] as const;

test.describe("screenshots @shots", () => {
  test.skip(!process.env.SHOTS, "set SHOTS=1 to capture screenshots");

  for (const theme of THEMES) {
    for (const [w, h] of SIZES) {
      test(`${theme} ${w}x${h}`, async ({ browser }) => {
        test.setTimeout(180_000);
        const a = await newPlayer(browser, "Alma");
        const b = await newPlayer(browser, "Boris");
        const players = [a, b];
        for (const p of players) {
          await p.page.setViewportSize({ width: w, height: h });
          await p.page.emulateMedia({ colorScheme: theme });
        }
        const shot = async (p: typeof a, name: string) => {
          await settle(p.page); // let transitions settle
          await p.page.screenshot({ path: `${OUT}${theme}-${w}x${h}-${name}.png` });
        };
        try {
          await a.page.goto("/");
          await expect(a.page.getByRole("button", { name: "Setup Game" }).first()).toBeVisible();
          await shot(a, "home");

          const code = await createGame(a, {
            roomName: `Shots ${uid()}`,
            password: "pw-shots",
            max: 2,
          });
          await shot(a, "waiting");

          // Turn t: white sum S[t]; everyone marks Red S[t]. Turn 6 (sum 12) locks Red.
          const sums = [2, 3, 4, 5, 6, 12];
          await queueDice(code, [6, 1, ...sums.flatMap((s) => rollFaces(s))]);
          await joinGame(b, code, "pw-shots"); // fills the room: the game auto-starts
          await startGame(a);
          expect(await waitForRoller(players)).toBe(a);
          await shot(a, "await-roll");

          for (let t = 0; t < sums.length; t++) {
            const s = sums[t] as number;
            const active = t % 2 === 0 ? a : b;
            const other = active === a ? b : a;
            expect(await waitForRoller(players)).toBe(active);
            await roll(active.page);
            if (t === 0) {
              await active.page.getByRole("button", { name: /^Red 2,/ }).click();
              await shot(active, "action1-staged");
              await active.page.locator(".g-submit").click();
            } else {
              await mark(active.page, "RED", s);
            }
            // The active player's one Submit sent both actions: it now waits for the other.
            await expect(active.page.locator(".g-submit")).toHaveCount(0);
            if (t === 0) await shot(active, "action2");
            await mark(other.page, "RED", s);
            // Lock progress pips: Red at 3 marks, then at 5 (lock available).
            if (t === 2) await shot(a, "marks3");
            if (t === 4) await shot(a, "marks5");
          }
          // Red is locked: its die is removed and its row closed.
          await expect(a.page.locator("[data-die].is-removed")).toHaveCount(1);
          await shot(a, "locked-row");

          // Chat toast + reaction float, seen by Boris; then the open panel.
          await a.page.getByRole("button", { name: "Open chat" }).click();
          await a.page.getByRole("textbox", { name: "Message" }).fill("Good game!");
          await a.page.getByRole("textbox", { name: "Message" }).press("Enter");
          await a.page.keyboard.press("Escape");
          await a.page.getByRole("button", { name: "Send reaction" }).click();
          // On phones the picker is clipped by the screen edge (see chat.spec FOLLOW-UP), so a real
          // tap cannot reach 👍: dispatch the click instead.
          await a.page.getByRole("button", { name: "React 👍" }).dispatchEvent("click");
          await expect(b.page.locator(".chat-toast")).toBeVisible();
          await expect(b.page.locator(".rx-float").first()).toBeVisible();
          await shot(b, "chat-toast-reaction");
          await b.page.getByRole("button", { name: /^Open chat/ }).click();
          await expect(b.page.getByRole("log", { name: "Chat messages" })).toContainText(
            "Good game!",
          );
          await shot(b, "chat-panel");
          await b.page.keyboard.press("Escape");

          // Run the game out on penalties: both pass everything (turn 7 onward).
          for (let turn = 7; turn <= 40; turn++) {
            if (await a.page.getByRole("dialog", { name: "Results" }).isVisible()) break;
            const active = turn % 2 === 1 ? a : b;
            const other = active === a ? b : a;
            expect(await waitForRoller(players)).toBe(active);
            await roll(active.page);
            await pass(other.page);
            await pass(active.page); // one Submit sends both actions
            if (turn === 8) await shot(a, "penalties");
            if (turn >= 13) break;
          }
          await expectGameOver(a.page);
          await expectGameOver(b.page);
          // score count-up: every total shows its final data-value
          await expect
            .poll(() =>
              a.page
                .locator(".g-total-cell .num")
                .evaluateAll((els) =>
                  els.every((e) => e.textContent?.trim() === e.getAttribute("data-value")),
                ),
            )
            .toBe(true);
          await shot(a, "gameover");
        } finally {
          await closeAll(players);
        }
      });
    }
  }
});
