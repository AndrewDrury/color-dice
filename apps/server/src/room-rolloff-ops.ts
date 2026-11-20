/**
 * Opening roll-off (T-NEW-2). Every seated player asks the server to roll their one die;
 * faces come from the server's dice (crypto, or scripted by test hooks), never from a client.
 * Each face is visible to everyone as soon as it is rolled (D-L1). The highest
 * face starts (A-2); a tie for highest re-rolls with only the tied seats (the others hold 0 =
 * out). Seats that left are rolled by the server so they can't stall the room. Callers run inside the room's serial queue.
 */
import {
  createGame,
  type DiceSource,
  type GameState,
  isValidRollOff,
  MAX_ROLL_OFF_ROUNDS,
  rollFace,
  rollOffLeaders,
} from "@cd/engine";
import type { ErrorCode } from "@cd/protocol";
import { playerId } from "./room-lobby-ops";
import {
  ROLL_OFF_KEY,
  type RollOffState,
  type RoomMeta,
  type RoomStore,
  type SeatRecord,
} from "./room-store";
import { loadDice } from "./test-hooks";

export type RollOffError = { code: ErrorCode; reason?: string };

export interface RollOffDeps {
  env(): { ALLOW_TEST_HOOKS?: string };
  storage: DurableObjectStorage;
  store: RoomStore;
  commit(meta: RoomMeta, seats: SeatRecord[], state?: string): Promise<void>;
  /** Starts play from the finished roll-off (autopass, status, commit). */
  finish(
    meta: RoomMeta,
    seats: SeatRecord[],
    state: GameState,
    dice: { dice: DiceSource; save(): Promise<void> },
  ): Promise<void>;
}

export class RollOffOps {
  constructor(private readonly d: RollOffDeps) {}

  /** A seat rolls its die for `round`. Returns an error for stale, repeated or out-of-phase calls. */
  async submit(
    meta: RoomMeta,
    seats: SeatRecord[],
    me: SeatRecord,
    round: number,
  ): Promise<RollOffError | null> {
    const ro = await this.d.store.getRollOff();
    if (!ro || me.seatIndex === null) return { code: "E_WRONG_PHASE" };
    if (me.left) return { code: "E_INVALID_COMMAND", reason: "seat left" };
    if (round !== ro.round) return { code: "E_STALE_TURN" };
    if (ro.current[me.seatIndex] === 0) {
      return { code: "E_INVALID_COMMAND", reason: "out of this round" };
    }
    if (ro.current[me.seatIndex] !== null) {
      return { code: "E_INVALID_COMMAND", reason: "already rolled" };
    }
    const dice = await loadDice(this.d.env(), this.d.storage);
    ro.current[me.seatIndex] = rollFace(dice.dice);
    await this.settle(meta, seats, ro, dice);
    return null;
  }

  /** Re-checks the roll-off after a seat change (e.g. a leave): left seats are rolled for. */
  async resettle(meta: RoomMeta, seats: SeatRecord[]): Promise<boolean> {
    const ro = await this.d.store.getRollOff();
    if (!ro) return false;
    const dice = await loadDice(this.d.env(), this.d.storage);
    await this.settle(meta, seats, ro, dice);
    return true;
  }

  /** A failed roll-off must not wedge the room: reopen the current round for every seat. */
  private resetRound(ro: RollOffState, reason: string): void {
    console.error(`roll-off reset: ${reason}`);
    ro.completed = [];
    ro.current = ro.current.map(() => null);
  }

  private async settle(
    meta: RoomMeta,
    seats: SeatRecord[],
    ro: RollOffState,
    dice: { dice: DiceSource; save(): Promise<void> },
  ): Promise<void> {
    const left = seats.filter((s) => s.seatIndex !== null && (s.left || s.kind === "cpu"));
    for (;;) {
      for (const s of left) {
        if (ro.current[s.seatIndex as number] === null) {
          ro.current[s.seatIndex as number] = rollFace(dice.dice);
        }
      }
      if (ro.current.some((f) => f === null)) break;
      const round = ro.current as number[];
      const leaders = rollOffLeaders(round);
      if (leaders.length === 1) {
        const rounds = [...ro.completed, round];
        const ordered = seats
          .filter((s): s is SeatRecord & { seatIndex: number } => s.seatIndex !== null)
          .sort((a, b) => a.seatIndex - b.seatIndex);
        if (!isValidRollOff(rounds, ordered.length)) {
          this.resetRound(ro, "invalid roll-off");
          break;
        }
        const res = createGame(
          ordered.map((s) => ({ id: playerId(s.seatIndex), displayName: s.name })),
          { dice: dice.dice, rollOffRounds: rounds as never },
        );
        if (!res.ok) {
          this.resetRound(ro, `createGame failed: ${res.error.code}`);
          break;
        }
        await this.d.storage.delete(ROLL_OFF_KEY);
        await this.d.finish(meta, seats, res.state, dice);
        return;
      }
      ro.completed.push(round);
      ro.round += 1;
      // Only the seats tied for the highest face roll again; the rest are out (0).
      ro.current = round.map((_, seat) => (leaders.includes(seat) ? null : 0));
      if (ro.round > MAX_ROLL_OFF_ROUNDS) {
        this.resetRound(ro, "round cap reached");
        break;
      }
    }
    await this.d.storage.put(ROLL_OFF_KEY, ro);
    await dice.save();
    await this.d.commit(meta, seats);
  }
}
