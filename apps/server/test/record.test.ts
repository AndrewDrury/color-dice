import { describe, expect, it } from "vitest";
import { removeSeat } from "../src/room-lobby-ops";
import { tallyRecord } from "../src/room-play-ops";
import type { SeatRecord } from "../src/room-store";

const seat = (i: number): SeatRecord => ({
  seatId: `s${i}`,
  name: `P${i}`,
  joinOrder: i,
  host: i === 0,
  seatIndex: i,
  tokenHash: "x",
  away: false,
  lastSeenAt: 0,
});

describe("tallyRecord (J5)", () => {
  it("3-player 2-way tie: each co-winner gets a tie, the rest a loss", () => {
    const seats = [seat(0), seat(1), seat(2)];
    tallyRecord(seats, ["seat-0", "seat-2"]);
    expect(seats.map((s) => s.record)).toEqual([
      { wins: 0, ties: 1, losses: 0 },
      { wins: 0, ties: 0, losses: 1 },
      { wins: 0, ties: 1, losses: 0 },
    ]);
  });

  it("2-player tie: both get a tie", () => {
    const seats = [seat(0), seat(1)];
    tallyRecord(seats, ["seat-0", "seat-1"]);
    expect(seats.map((s) => s.record)).toEqual([
      { wins: 0, ties: 1, losses: 0 },
      { wins: 0, ties: 1, losses: 0 },
    ]);
  });

  it("sole winner gets a win, the rest a loss", () => {
    const seats = [seat(0), seat(1), seat(2)];
    tallyRecord(seats, ["seat-1"]);
    expect(seats.map((s) => s.record)).toEqual([
      { wins: 0, ties: 0, losses: 1 },
      { wins: 1, ties: 0, losses: 0 },
      { wins: 0, ties: 0, losses: 1 },
    ]);
  });

  it("accumulates and drops with a removed seat", () => {
    const seats = [seat(0), seat(1)];
    tallyRecord(seats, ["seat-1"]);
    tallyRecord(seats, ["seat-1"]);
    expect(seats[1]?.record).toEqual({ wins: 2, ties: 0, losses: 0 });
    const rest = removeSeat(seats, "s1");
    expect(rest.map((s) => s.seatId)).toEqual(["s0"]);
    expect(rest[0]?.record).toEqual({ wins: 0, ties: 0, losses: 2 });
  });
});
