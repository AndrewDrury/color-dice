import {
  collectWsFrames,
  createGame,
  expect,
  joinGame,
  mark,
  pass,
  queueDice,
  startGame,
  test,
} from "./fixtures";
import { closeAll, expectGameOver, newPlayer, roll, rollFaces, waitForRoller } from "./helpers";

interface Frame {
  type?: string;
  game?: {
    phase: string;
    events: { type: string }[];
    players: {
      seat: number;
      action1Submitted: boolean;
      sheet: { rows: Record<string, { marked: boolean[] }> } | null;
      score: { rows: unknown; total: number };
    }[];
  };
  you?: { action1Decision: unknown; seat: number | null };
}

test("hidden info: A receives neither B's nor C's Action 1 choice before the reveal", async ({
  browser,
}) => {
  const [a, b, c] = await Promise.all(["Ada", "Bo", "Cy"].map((n) => newPlayer(browser, n)));
  const players = [a!, b!, c!];
  try {
    // Record everything A receives, from the very first socket.
    const frames = collectWsFrames(a!.page);
    const code = await createGame(a!, {
      roomName: `Hidden ${Date.now() % 10000}`,
      password: "pw-hide",
      max: 3,
    });
    await joinGame(b!, code, "pw-hide");
    await queueDice(code, [6, 1, 1, ...rollFaces(7)]); // Ada starts; white sum 7
    await joinGame(c!, code, "pw-hide");
    await startGame(a!);

    expect(await waitForRoller(players)).toBe(a);
    await roll(a!.page);
    const start = frames.length;

    // B marks red 7, C marks green 7; A has not decided yet.
    await mark(b!.page, "RED", 7);
    await mark(c!.page, "GREEN", 7);

    // Wait until A's view says both have submitted.
    await expect
      .poll(() => {
        const last = frames
          .slice(start)
          .map((f) => JSON.parse(f) as Frame)
          .filter((f) => f.type === "view" && f.game)
          .pop();
        return last?.game?.players.filter((p) => p.action1Submitted).length;
      })
      .toBe(2);
    await expect(a!.page.getByText(/Step 1 of 2/).first()).toBeVisible();

    const before = frames.slice(start).map((f) => JSON.parse(f) as Frame);
    for (const f of before) {
      if (f.type !== "view" || !f.game) continue;
      expect(f.game.phase).toBe("ACTION_1");
      expect(f.game.events.map((e) => e.type)).not.toContain("ACTION1_REVEALED");
      expect(f.game.events.map((e) => e.type)).not.toContain("MARKED");
      for (const p of f.game.players) {
        if (p.seat === f.you?.seat) {
          for (const row of Object.values(p.sheet?.rows ?? {})) {
            expect(row.marked.some(Boolean)).toBe(false);
          }
        } else {
          // Opponent cards are never sent before GAME_OVER (J1).
          expect(p.sheet).toBeNull();
          expect(p.score.rows).toBeNull();
        }
      }
      expect(f.you?.action1Decision).toBeNull();
    }
    // Raw text: no reveal event and no marked box at all.
    for (const raw of frames.slice(start)) {
      expect(raw).not.toContain("ACTION1_REVEALED");
      expect(raw).not.toContain('"type":"MARKED"');
    }

    // A decides -> reveal. Positive control: now the reveal does carry the choices.
    await pass(a!.page);
    await expect
      .poll(() => frames.slice(start).some((f) => f.includes("ACTION1_REVEALED")))
      .toBe(true);
    await expect
      .poll(() => frames.slice(start).some((f) => f.includes('"type":"MARKED"')))
      .toBe(true);
  } finally {
    await closeAll(players);
  }
});

test("hidden info: opponent cards are not rendered or sent before game over, all revealed after", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const a = await newPlayer(browser, "Alma");
  const b = await newPlayer(browser, "Boris");
  try {
    const framesA = collectWsFrames(a.page);
    const framesB = collectWsFrames(b.page);
    const code = await createGame(a, {
      roomName: `Cards ${Date.now() % 10000}`,
      password: "pw-card",
      max: 2,
    });
    await queueDice(code, [6, 1]);
    await joinGame(b, code, "pw-card");
    await startGame(a);
    for (let turn = 1; turn <= 7; turn++) {
      const active = turn % 2 === 1 ? a : b;
      const other = active === a ? b : a;
      expect(await waitForRoller([a, b])).toBe(active);
      await roll(active.page);
      await pass(other.page);
      await pass(active.page);
      await pass(active.page);
      if (turn === 3) {
        // Mid-game DOM: only your own card, opponent is a chip.
        for (const p of [a, b]) {
          await expect(p.page.locator(".g-sheet")).toHaveCount(1);
          await expect(p.page.locator(".g-mini, .g-mini-cell, .g-bars")).toHaveCount(0);
          await expect(p.page.locator(".g-chip")).toHaveCount(1);
        }
      }
    }
    await expectGameOver(a.page);
    await expectGameOver(b.page);

    for (const frames of [framesA, framesB]) {
      const views = frames
        .map((f) => JSON.parse(f) as Frame)
        .filter((f) => f.type === "view" && f.game);
      let pre = 0;
      let over = 0;
      for (const f of views) {
        const players = f.game?.players ?? [];
        if (f.game?.phase === "GAME_OVER") {
          over++;
          for (const p of players) {
            expect(p.sheet).not.toBeNull();
            expect(p.score.rows).not.toBeNull();
          }
        } else if (f.game?.phase) {
          pre++;
          for (const p of players.filter((x) => x.seat !== f.you?.seat)) {
            expect(p.sheet).toBeNull();
            expect(p.score.rows).toBeNull();
          }
        }
      }
      expect(pre).toBeGreaterThan(5);
      expect(over).toBeGreaterThan(0);
    }

    // Game over: every card is visible.
    for (const p of [a, b]) {
      const cards = p.page.locator(".g-final-card");
      await expect(cards).toHaveCount(2);
      for (const card of await cards.all()) {
        await card.scrollIntoViewIfNeeded();
        await expect(card.locator(".g-sheet")).toBeVisible();
      }
    }
  } finally {
    await closeAll([a, b]);
  }
});
