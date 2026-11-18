import { CryptoDice, createGame, type GameEvent, viewFor } from "@cd/engine";
import { describe, expect, it } from "vitest";
import type { z } from "zod";
import { type ViewMessage, ViewMessageSchema } from "../src";

// Compile-time: every ViewMessage value is accepted by the schema's input type.
type Assignable<A, B> = A extends B ? true : false;
const _compat: Assignable<ViewMessage, z.input<typeof ViewMessageSchema>> = true;
void _compat;

const row = (n: number) => ({
  marked: Array.from({ length: 11 }, (_, i) => i < n),
  lockCrossed: false,
});
const events: GameEvent[] = [
  { type: "TURN_STARTED", turnNumber: 9, activeSeat: 0 },
  { type: "ACTION1_SUBMITTED", playerId: "seat-1" },
];

const fixture: ViewMessage = {
  type: "view",
  version: 42,
  code: "K7QF2",
  room: {
    name: "Friday dice",
    listed: true,
    maxPlayers: 4,
    status: "playing",
    joinLockedUntil: null,
  },
  seats: [
    {
      seatId: "a1b2c3d4",
      name: "Andrew",
      host: true,
      online: true,
      away: false,
      record: { wins: 0, ties: 0, losses: 0 },
    },
    {
      seatId: "e5f6g7h8",
      name: "Bo",
      host: false,
      online: false,
      away: true,
      record: { wins: 2, ties: 1, losses: 1 },
    },
  ],
  game: {
    phase: "ACTION_1",
    turn: { number: 9, activeSeat: 0 },
    roll: { white: [3, 5], colored: { RED: 2, GREEN: 6, BLUE: 1 }, whiteSum: 8 },
    lockedColors: ["YELLOW"],
    players: [
      {
        seat: 0,
        seatId: "a1b2c3d4",
        sheet: { rows: { RED: row(2), YELLOW: row(0), GREEN: row(4), BLUE: row(0) }, penalties: 1 },
        score: { rows: { RED: 3, YELLOW: 0, GREEN: 10, BLUE: 0 }, penalties: -5, total: 8 },
        action1Submitted: true,
      },
    ],
    events,
    endReason: null,
    winners: null,
  },
  you: {
    seatId: "a1b2c3d4",
    host: true,
    seat: 0,
    action1Decision: { kind: "MARK", color: "RED" },
    pendingAction2: { kind: "MARK", whiteDie: 1, color: "GREEN" },
    legalAction1: [{ kind: "PASS" }, { kind: "MARK", color: "RED" }],
    legalAction2: [{ kind: "PASS" }, { kind: "MARK", whiteDie: 0, color: "GREEN", number: 9 }],
    canRoll: false,
  },
};

describe("ViewMessageSchema", () => {
  it("accepts the C7 sample and a lobby view", () => {
    expect(ViewMessageSchema.safeParse(fixture).success).toBe(true);
    const lobby: ViewMessage = {
      ...fixture,
      room: { ...fixture.room, status: "lobby" },
      game: null,
      you: {
        ...fixture.you,
        seat: null,
        action1Decision: null,
        pendingAction2: null,
        legalAction1: [],
        legalAction2: [],
      },
    };
    expect(ViewMessageSchema.safeParse(lobby).success).toBe(true);
  });

  it("seat `left` is an optional boolean", () => {
    const withLeft = { ...fixture, seats: fixture.seats.map((s) => ({ ...s, left: true })) };
    expect(ViewMessageSchema.safeParse(withLeft).success).toBe(true);
    const bad = { ...fixture, seats: fixture.seats.map((s) => ({ ...s, left: "yes" })) };
    expect(ViewMessageSchema.safeParse(bad).success).toBe(false);
  });

  it("parses hidden opponent cards (sheet and score.rows null)", () => {
    const g = fixture.game;
    const mine = g?.players[0];
    if (!g || !mine) throw new Error("fixture");
    const opp = {
      seat: 1,
      seatId: "e5f6g7h8",
      sheet: null,
      score: { rows: null, penalties: -5, total: -2 },
      action1Submitted: false,
    };
    const hidden = { ...fixture, game: { ...g, players: [mine, opp] } };
    expect(ViewMessageSchema.safeParse(hidden).success).toBe(true);
    // The schema is not the guard: a full opponent card still parses (the server never sends it).
    const full = { ...opp, sheet: mine.sheet, score: mine.score };
    const open = { ...fixture, game: { ...g, players: [mine, full] } };
    expect(ViewMessageSchema.safeParse(open).success).toBe(true);
  });

  it("rejects extra fields and bad shapes", () => {
    expect(ViewMessageSchema.safeParse({ ...fixture, secret: 1 }).success).toBe(false);
    const g = fixture.game;
    if (!g) throw new Error("fixture");
    const leaky = { ...fixture, game: { ...g, players: [{ ...g.players[0], action1: "RED" }] } };
    expect(ViewMessageSchema.safeParse(leaky).success).toBe(false);
    const badRow = { ...fixture, game: { ...g, lockedColors: ["PURPLE"] } };
    expect(ViewMessageSchema.safeParse(badRow).success).toBe(false);
    const badEvent = { ...fixture, game: { ...g, events: [{ type: "NOPE" }] } };
    expect(ViewMessageSchema.safeParse(badEvent).success).toBe(false);
    const badPending = { ...fixture, you: { ...fixture.you, pendingAction2: { kind: "MARK" } } };
    expect(ViewMessageSchema.safeParse(badPending).success).toBe(false);
  });

  it("accepts the K1 events (ACTION2_VOIDED, roll-off rounds)", () => {
    const g = fixture.game;
    if (!g) throw new Error("fixture");
    const k1: GameEvent[] = [
      {
        type: "FIRST_PLAYER_CHOSEN",
        seat: 1,
        method: "ROLL_OFF",
        rounds: [
          [6, 6],
          [2, 6],
        ],
      },
      { type: "ACTION2_VOIDED", playerId: "seat-0", reason: "ROW_LOCKED" },
    ];
    const msg: ViewMessage = { ...fixture, game: { ...g, events: k1 } };
    expect(ViewMessageSchema.safeParse(msg).success).toBe(true);
  });
});

describe("ViewMessage built from the engine's viewFor", () => {
  it("parses a wrapped engine view", () => {
    const created = createGame(
      [
        { id: "seat-0", displayName: "A" },
        { id: "seat-1", displayName: "B" },
      ],
      { dice: new CryptoDice() },
    );
    if (!created.ok) throw new Error("createGame failed");
    const state = created.state;
    const ev = viewFor(state, 0);
    const seatIds = ["a1b2c3d4", "e5f6g7h8"];
    const msg = {
      type: "view",
      version: 1,
      code: "K7QF2",
      room: { name: "Room", listed: true, maxPlayers: 4, status: "playing", joinLockedUntil: null },
      seats: [
        {
          seatId: "a1b2c3d4",
          name: "A",
          host: true,
          online: true,
          away: false,
          record: { wins: 0, ties: 0, losses: 0 },
        },
        {
          seatId: "e5f6g7h8",
          name: "B",
          host: false,
          online: true,
          away: false,
          record: { wins: 0, ties: 0, losses: 0 },
        },
      ],
      game: {
        ...ev.game,
        players: ev.game.players.map((p) => ({ ...p, seatId: seatIds[p.seat] })),
      },
      you: { seatId: "a1b2c3d4", host: true, ...ev.you },
    };
    const r = ViewMessageSchema.safeParse(msg);
    expect(r.error?.issues).toBeUndefined();
    expect(r.success).toBe(true);
  });
});
