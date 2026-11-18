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
import { closeAll, newPlayer, roll, rollFaces, waitForRoller } from "./helpers";

interface Frame {
  type?: string;
  game?: {
    phase: string;
    events: { type: string }[];
    players: {
      seat: number;
      action1Submitted: boolean;
      sheet: { rows: Record<string, { marked: boolean[] }> };
    }[];
  };
  you?: { action1Decision: unknown };
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
    await joinGame(c!, code, "pw-hide");
    await queueDice(code, [6, ...rollFaces(7)]); // Ada starts; white sum 7
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
    await expect(a!.page.getByText(/Waiting|Everyone/).first()).toBeVisible();

    const before = frames.slice(start).map((f) => JSON.parse(f) as Frame);
    for (const f of before) {
      if (f.type !== "view" || !f.game) continue;
      expect(f.game.phase).toBe("ACTION_1");
      expect(f.game.events.map((e) => e.type)).not.toContain("ACTION1_REVEALED");
      expect(f.game.events.map((e) => e.type)).not.toContain("MARKED");
      for (const p of f.game.players)
        for (const row of Object.values(p.sheet.rows)) expect(row.marked.some(Boolean)).toBe(false);
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
