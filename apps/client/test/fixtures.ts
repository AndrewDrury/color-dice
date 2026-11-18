import type { ViewMessage } from "@cd/protocol";

export const CODE = "K7QF2";
export const TOKEN = "a".repeat(43);
export const SEAT = "a1b2c3d4";

export function makeView(version: number): ViewMessage {
  return {
    type: "view",
    version,
    code: CODE,
    room: {
      name: "Friday dice",
      listed: true,
      maxPlayers: 4,
      status: "lobby",
      joinLockedUntil: null,
    },
    seats: [
      {
        seatId: SEAT,
        name: "Andrew",
        host: true,
        online: true,
        away: false,
        record: { wins: 0, ties: 0, losses: 0 },
      },
    ],
    game: null,
    you: {
      seatId: SEAT,
      host: true,
      seat: null,
      action1Decision: null,
      legalAction1: [],
      legalAction2: [],
      canRoll: false,
    },
  };
}
