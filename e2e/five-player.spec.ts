import { createGame, expect, joinGame, mark, pass, queueDice, startGame, test } from "./fixtures";
import { closeAll, expectGameOver, newPlayer, roll, rollFaces, waitForRoller } from "./helpers";

type Move = [color: string, n: number] | null;

// EC-14: one row already locked; a white sum of 12 lets P0 lock red and P1 lock yellow in the
// same Action 1 -> three locked rows, game over, no Action 2.
//
// Script (white sums per turn). Everyone marks in Action 1, so every turn is one white sum:
//   P0 marks red 2..6 and P1 yellow 2..6 on the low sums; P2 marks green 12..8 on the high sums.
//   Turn 11 (sum 2): P2 locks green.   Turn 12 (sum 12): P0 locks red, P1 locks yellow.
const SUMS = [2, 12, 3, 11, 4, 10, 5, 9, 6, 8, 2, 12];
const MOVES: Record<number, Move[]> = {
  1: [["RED", 2], null, null, null, null],
  2: [null, null, ["GREEN", 12], null, null],
  3: [["RED", 3], null, null, null, null],
  4: [null, null, ["GREEN", 11], null, null],
  5: [["RED", 4], null, null, null, null],
  6: [null, null, ["GREEN", 10], null, null],
  7: [["RED", 5], null, null, null, null],
  8: [null, null, ["GREEN", 9], null, null],
  9: [["RED", 6], null, null, null, null],
  10: [null, null, ["GREEN", 8], null, null],
  11: [null, null, ["GREEN", 2], null, null],
  12: [["RED", 12], ["YELLOW", 12], null, null, null],
};
// P1 marks yellow on the same low-sum turns as P0 marks red.
for (const t of [1, 3, 5, 7, 9]) MOVES[t]![1] = ["YELLOW", SUMS[t - 1]!];

test("five players: a double lock in one Action 1 ends the game with 3 locked rows", async ({
  browser,
}) => {
  test.setTimeout(170_000);
  const names = ["Pia", "Quinn", "Rae", "Sol", "Tess"];
  const ps = await Promise.all(names.map((n) => newPlayer(browser, n)));
  try {
    const code = await createGame(ps[0]!, {
      roomName: `Five ${Date.now() % 10000}`,
      password: "pw-five",
      max: 5,
    });
    // Roll-off: seat 0 rolls a 6. Turns 1..11 roll 6 dice, turn 12 five (green is gone).
    const dice = [6, 1, 1, 1, 1];
    for (const [i, s] of SUMS.entries()) dice.push(...rollFaces(s, i < 11 ? 4 : 3));
    await queueDice(code, dice);
    for (const p of ps.slice(1)) await joinGame(p, code, "pw-five"); // the 5th join auto-starts
    await startGame(ps[0]!);

    for (let turn = 1; turn <= SUMS.length; turn++) {
      const active = ps[(turn - 1) % 5]!;
      expect(await waitForRoller(ps)).toBe(active);
      await roll(active.page);
      const moves = MOVES[turn]!;
      for (let i = 0; i < 5; i++) {
        const m = moves[i];
        if (m) await mark(ps[i]!.page, m[0], m[1]);
        else await pass(ps[i]!.page);
      }
      if (turn < SUMS.length) await pass(active.page); // Action 2
    }

    for (const p of ps) {
      await expectGameOver(p.page);
      await expect(p.page.locator(".g-reason")).toContainText(/lock/i);
      // The board behind the dialog: 3 locked rows (red, yellow, green).
      await expect(p.page.locator(".g-main .g-row.is-closed")).toHaveCount(3);
    }
  } finally {
    await closeAll(ps);
  }
});
