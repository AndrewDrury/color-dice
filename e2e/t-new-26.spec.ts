import { boxLocator, createGame, joinGame, pass, queueDice, startGame, test } from "./fixtures";
import { closeAll, newPlayer, roll, rollFaces, uid, waitForRoller } from "./helpers";

// Opt-in: `T26=1 npm run e2e -- t-new-26`. Screenshots (highlight, move log, footer) in three themes at
// phone/desktop widths, plus the penalty-caption centring probe (number centre vs caption centre, 1 px).
declare const process: { env: Record<string, string | undefined> };
const OUT = new URL("./screenshots/t-new-26/", import.meta.url).pathname;
const THEMES: [string, string][] = [
  ["classic", "light"],
  ["midnight", "dark"],
  ["sunset", "light"],
];
const CAPTIONS: Record<string, string> = { en: "penalties", fr: "pénalités", es: "penalizaciones" };

test.describe("t-new-26 @shots", () => {
  test.skip(!process.env.T26, "set T26=1 to run");
  test.use({ reducedMotion: "reduce" });

  test("highlight, log and penalty caption", async ({ browser }) => {
    test.setTimeout(180_000);
    const a = await newPlayer(browser, "Alma");
    const b = await newPlayer(browser, "Boris-with-a-very-long-name-indeed");
    const setTheme = (p: typeof a, id: string, scheme: string) =>
      p.page.evaluate(
        ([t, s]) => {
          const r = document.documentElement;
          r.dataset.theme = t;
          r.dataset.scheme = s;
        },
        [id, scheme],
      );
    try {
      await a.page.setViewportSize({ width: 1280, height: 800 });
      await b.page.setViewportSize({ width: 360, height: 640 });
      const code = await createGame(a, { roomName: `T26 ${uid()}`, password: "pw-t26", max: 2 });
      await queueDice(code, [6, 1, ...rollFaces(7), ...rollFaces(2)]);
      await joinGame(b, code, "pw-t26");
      await startGame(a);
      await waitForRoller([a, b]);
      await roll(a.page);
      await a.page.locator(".g-box.is-cw").first().waitFor();
      for (const [id, scheme] of THEMES) {
        for (const [p, tag] of [
          [a, "1280"],
          [b, "360"],
        ] as const) {
          await setTheme(p, id, scheme);
          await p.page.locator(".g-sheet").screenshot({ path: `${OUT}hl-${tag}-${id}.png` });
        }
      }
      await boxLocator(a.page, "RED", 7).click();
      await boxLocator(a.page, "YELLOW", 7).click();
      await a.page.getByRole("button", { name: "Submit" }).click();
      await boxLocator(b.page, "RED", 7).click();
      await b.page.getByRole("button", { name: "Submit" }).click();
      await waitForRoller([a, b]);
      await roll(b.page);
      await pass(b.page);
      await a.page.getByText("took a penalty").first().waitFor({ state: "attached" });
      // A locked-row line for the picture only (the same markup the log renders).
      await a.page.evaluate(() => {
        for (const e of document.querySelectorAll(".ts-card"))
          (e as HTMLElement).style.display = "none";
        const ol = document.querySelector(".g-log ol") as HTMLElement;
        const li = document.createElement("li");
        li.className = "lg k-lock";
        li.innerHTML =
          '<span class="lg-lock c-red"><svg width="16" height="16" viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="2" fill="currentColor"/></svg></span><span class="lg-name">Red row locked</span>';
        ol.append(li);
      });
      for (const [id, scheme] of THEMES) {
        await setTheme(a, id, scheme);
        await a.page.setViewportSize({ width: 1280, height: 800 });
        await a.page.locator(".g-log-scroll").evaluate((e) => {
          e.scrollTop = 0;
        });
        await a.page.locator(".g-log").screenshot({ path: `${OUT}log-1280-${id}.png` });
        await a.page.locator(".g-log-scroll").evaluate((e) => {
          e.scrollTop = e.scrollHeight;
        });
        await a.page.locator(".g-log").screenshot({ path: `${OUT}log-1280-end-${id}.png` });
        await a.page.locator(".g-log-scroll").evaluate((e) => {
          e.scrollTop = 0;
        });
        await a.page.setViewportSize({ width: 768, height: 900 });
        await a.page.locator(".g-log").screenshot({ path: `${OUT}log-768-${id}.png` });
      }

      // Penalty caption centring: every theme, width, count and language.
      const problems: string[] = [];
      for (const [id, scheme] of THEMES) {
        for (const [p, widths] of [
          [b, [360, 390]],
          [a, [1280]],
        ] as const) {
          for (const w of widths) {
            await p.page.setViewportSize({ width: w, height: w < 600 ? 700 : 800 });
            await setTheme(p, id, scheme);
            for (const n of ["0", "3", "20"]) {
              for (const [lang, cap] of Object.entries(CAPTIONS)) {
                const m = await p.page.evaluate(
                  ([num, text]) => {
                    const t = document.querySelector(".g-foot .g-penscore") as HTMLElement;
                    (t.querySelector(".num") as HTMLElement).textContent = num ?? "";
                    (t.querySelector(".g-pencap") as HTMLElement).textContent = text ?? "";
                    const c = (e: Element) => {
                      const r = e.getBoundingClientRect();
                      return r.left + r.width / 2;
                    };
                    return [
                      c(t.querySelector(".num") as Element),
                      c(t.querySelector(".g-pencap") as Element),
                    ];
                  },
                  [n, cap],
                );
                const d = Math.abs((m[0] as number) - (m[1] as number));
                if (d > 1) problems.push(`${id} ${w} ${n} ${lang}: off by ${d.toFixed(2)}`);
                if (n === "20" || (n === "0" && lang === "en") || lang === "fr")
                  await p.page
                    .locator(".g-foot")
                    .screenshot({ path: `${OUT}foot-${w}-${id}-${n}-${lang}.png` });
              }
            }
          }
        }
      }
      console.log("centre probe problems:", problems.length ? problems.join("; ") : "none");
      if (problems.length) throw new Error(problems.join("\n"));
    } finally {
      await closeAll([a, b]);
    }
  });
});
