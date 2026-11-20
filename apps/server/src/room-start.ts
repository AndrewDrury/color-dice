/**
 * Lobby → playing transition, shared by the host's Start and the auto-start that
 * fires when the last seat fills (T-UX-17). Callers run inside the room's serial queue,
 * so a racing Start + join can start the game at most once (the loser sees "playing").
 */
import { createGame, toJSON } from "@cd/engine";
import { MIN_PLAYERS } from "@cd/protocol";
import { fail, type OpResult, ok, playerId } from "./room-lobby-ops";
import { ROLL_OFF_KEY, type RollOffState, type RoomMeta, type SeatRecord } from "./room-store";
import { DICE_KEY, hooksEnabled, startDice } from "./test-hooks";

export interface Started {
  seats: SeatRecord[];
  /** Serialized engine state; null while the interactive opening roll-off runs (T-NEW-2). */
  state: string | null;
}

/** True when a lobby is full: every seat up to `maxPlayers` is taken (seats that left are removed). */
export function isRoomFull(meta: RoomMeta, seats: SeatRecord[]): boolean {
  return meta.status === "lobby" && seats.length >= meta.maxPlayers && seats.length >= MIN_PLAYERS;
}

/** Seats the players by join order, rolls the opening dice and flips `meta` to playing. */
export async function startLobbyGame(
  env: { ALLOW_TEST_HOOKS?: string },
  storage: DurableObjectStorage,
  meta: RoomMeta,
  seats: SeatRecord[],
  diceOverride?: number[],
): Promise<OpResult<Started>> {
  const humanSeats = [...seats].filter((s) => s.kind !== "cpu");
  const existingCpuSeats = [...seats].filter((s) => s.kind === "cpu");
  const cpuCount = meta.cpuCount ?? 0;
  const neededCpu = cpuCount - existingCpuSeats.length;
  const added: SeatRecord[] = [];
  if (neededCpu > 0) {
    const usedIds = new Set(seats.map((s) => s.seatId));
    const nextOrder = Math.max(0, ...seats.map((s) => s.joinOrder));
    for (let i = 0; i < neededCpu; i++) {
      let n = i + 1;
      let name = `CPU ${n}`;
      while (seats.some((s) => s.name.toLowerCase() === name.toLowerCase())) {
        n++;
        name = `CPU ${n}`;
      }
      let seatId = `cpu${(nextOrder + i + 1).toString(36).padStart(5, "0")}`;
      while (usedIds.has(seatId)) seatId += "x";
      seatId = seatId.slice(0, 8).padEnd(8, "0");
      usedIds.add(seatId);
      added.push({
        seatId,
        name,
        joinOrder: nextOrder + i + 1,
        host: false,
        seatIndex: null,
        tokenHash: "",
        away: false,
        left: false,
        lastSeenAt: Date.now(),
        kind: "cpu",
        policy: "balanced",
      });
    }
  }
  const ordered = [...humanSeats, ...existingCpuSeats, ...added].sort(
    (x, y) => x.joinOrder - y.joinOrder,
  );
  if (ordered.length < MIN_PLAYERS || ordered.length > meta.maxPlayers) {
    return fail(422, "E_PLAYER_COUNT");
  }
  ordered.forEach((s, i) => {
    s.seatIndex = i;
  });
  // Test hooks only: scripted dice (an override or a non-empty queue) stand in for the
  // roll-off, as before. Otherwise the players roll it themselves (T-NEW-2).
  const scripted =
    hooksEnabled(env) &&
    ((diceOverride?.length ?? 0) > 0 || ((await storage.get<number[]>(DICE_KEY)) ?? []).length > 0);
  if (!scripted) {
    const roll: RollOffState = {
      round: 1,
      current: ordered.map(() => null),
      completed: [],
    };
    await storage.put(ROLL_OFF_KEY, roll);
    meta.status = "playing";
    return ok({ seats: ordered, state: null });
  }
  const dice = await startDice(env, storage, diceOverride);
  const res = createGame(
    ordered.map((s) => ({ id: playerId(s.seatIndex as number), displayName: s.name })),
    { dice: dice.dice },
  );
  if (!res.ok) return fail(422, res.error.code);
  meta.status = "playing";
  await dice.save();
  return ok({ seats: ordered, state: toJSON(res.state) });
}
