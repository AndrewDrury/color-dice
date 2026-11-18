import { COLORS } from "../../src/constants";
import type { Color, GameState, Player } from "../../src/index";

function fail(id: string, msg: string): never {
  throw new Error(`${id} violated: ${msg}`);
}

function check(cond: boolean, id: string, msg: string): void {
  if (!cond) fail(id, msg);
}

const markTotal = (p: Player, c: Color) => p.sheet.rows[c].marked.filter(Boolean).length;

/** Assert spec §3.4 INV-1..INV-10 for `next` (and for the step from `prev`, if given). */
export function assertInvariants(prev: GameState | null, next: GameState): void {
  const n = next.players.length;
  // INV-1
  check(n >= 2 && n <= 5, "INV-1", `player count ${n}`);
  check(new Set(next.players.map((p) => p.id)).size === n, "INV-1", "duplicate ids");
  check(
    next.players.every((p, i) => p.seat === i),
    "INV-1",
    "seats not 0..N-1",
  );

  const locked = new Set(next.lockedColors);
  check(locked.size === next.lockedColors.length, "INV-4", "duplicate lockedColors");
  for (const c of COLORS) {
    let anyLock = false;
    for (const p of next.players) {
      const row = p.sheet.rows[c];
      check(row.marked.length === 11, "INV-2", "row length");
      // INV-2
      check(row.lockCrossed === row.marked[10], "INV-2", `${p.id} ${c}`);
      // INV-3
      if (row.marked[10]) {
        check(row.marked.slice(0, 10).filter(Boolean).length >= 5, "INV-3", `${p.id} ${c}`);
      }
      anyLock ||= row.lockCrossed;
    }
    // INV-4
    check(anyLock === locked.has(c), "INV-4", `${c} anyLock=${anyLock} locked=${locked.has(c)}`);
  }
  // INV-5
  for (const p of next.players) {
    check(p.sheet.penalties >= 0 && p.sheet.penalties <= 4, "INV-5", `${p.id}`);
  }
  // INV-6 / INV-7
  if (next.phase !== "GAME_OVER") {
    check(locked.size < 2, "INV-6", `locked ${locked.size}`);
    check(
      next.players.every((p) => p.sheet.penalties < 4),
      "INV-6",
      "4 penalties",
    );
  } else {
    check(locked.size <= 3, "INV-7", `locked ${locked.size}`);
  }

  // Early Action 2 (spec §17 A-2) only ever pends during ACTION_1.
  if (next.phase !== "ACTION_1") {
    check(next.turn?.pendingAction2 == null, "A-2", `pendingAction2 in ${next.phase}`);
  }

  // INV-9 (from the log: marks since the last TURN_STARTED)
  const perPlayer = new Map<string, number>();
  let activeSeat = -1;
  for (let i = next.log.length - 1; i >= 0; i--) {
    const e = next.log[i];
    if (e?.type === "TURN_STARTED") {
      activeSeat = e.activeSeat;
      break;
    }
    if (e?.type === "MARKED") perPlayer.set(e.playerId, (perPlayer.get(e.playerId) ?? 0) + 1);
  }
  for (const [id, count] of perPlayer) {
    const seat = next.players.find((p) => p.id === id)?.seat;
    check(count <= (seat === activeSeat ? 2 : 1), "INV-9", `${id} marked ${count} times in a turn`);
  }

  // INV-10
  const roll = next.turn?.roll;
  if (roll && (next.phase === "ACTION_1" || next.phase === "ACTION_2")) {
    for (const c of COLORS) {
      const inRoll = roll.colored[c] !== undefined;
      if (!inRoll) check(locked.has(c), "INV-10", `${c} missing from roll but not locked`);
      if (prev?.phase === "AWAIT_ROLL") {
        check(inRoll === !locked.has(c), "INV-10", `${c} in roll=${inRoll}`);
      }
    }
  }

  if (!prev) return;
  // INV-8: monotonic
  for (const c of prev.lockedColors) check(locked.has(c), "INV-8", `lock ${c} vanished`);
  check(next.log.length >= prev.log.length, "INV-8", "log shrank");
  check(n === prev.players.length, "INV-8", "player count changed");
  for (const pp of prev.players) {
    const np = next.players.find((p) => p.id === pp.id);
    if (!np) fail("INV-8", `player ${pp.id} vanished`);
    check(np.sheet.penalties >= pp.sheet.penalties, "INV-8", "penalties decreased");
    for (const c of COLORS) {
      const a = pp.sheet.rows[c];
      const b = np.sheet.rows[c];
      for (let i = 0; i < 11; i++) {
        check(!a.marked[i] || b.marked[i] === true, "INV-8", `${pp.id} ${c}[${i}] vanished`);
      }
      check(!a.lockCrossed || b.lockCrossed, "INV-8", "lockCrossed vanished");
    }
    // INV-9 per transition: passive players gain at most 1; nobody gains >2.
    const gained = COLORS.reduce((s, c) => s + markTotal(np, c) - markTotal(pp, c), 0);
    const isActive = pp.seat === prev.turn?.activeSeat;
    check(gained <= (isActive ? 2 : 1), "INV-9", `${pp.id} gained ${gained} in one step`);
  }
}
