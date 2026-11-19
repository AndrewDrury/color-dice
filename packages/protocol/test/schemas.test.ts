import { describe, expect, expectTypeOf, it } from "vitest";
import type { z } from "zod";
import {
  AuthResSchema,
  CLOSE,
  ClientMessageSchema,
  CODE_ALPHABET,
  CreateGameReqSchema,
  cleanName,
  ERROR_CODES,
  ErrorBodySchema,
  isErrorCode,
  JoinReqSchema,
  KickReqSchema,
  MAX_PLAYERS,
  MaxPlayersSchema,
  MIN_PLAYERS,
  PatchRoomReqSchema,
  PLAYER_NAME_MAX,
  PublicGameSchema,
  parseClientMessage,
  ReclaimReqSchema,
  ROOM_NAME_MAX,
} from "../src";

const TOKEN = "A".repeat(43);
const createOk = {
  roomName: "Friday dice",
  name: "Andrew",
  password: "hunter2",
  maxPlayers: 4,
  listed: true,
};

describe("HTTP request schemas", () => {
  it("accepts valid bodies and returns cleaned names", () => {
    const r = CreateGameReqSchema.parse({
      ...createOk,
      roomName: "  Friday \t dice ",
      name: " An​drew ",
    });
    expect(r.roomName).toBe("Friday dice");
    expect(r.name).toBe("Andrew");
    expect(JoinReqSchema.parse({ name: "Bo", password: "abcd" })).toEqual({
      name: "Bo",
      password: "abcd",
    });
    expect(ReclaimReqSchema.safeParse({ name: "Bo", password: "x".repeat(64) }).success).toBe(true);
    expect(KickReqSchema.safeParse({ seatId: "a1b2c3d4" }).success).toBe(true);
    expect(PatchRoomReqSchema.safeParse({ listed: false }).success).toBe(true);
  });

  it("rejects extra fields", () => {
    expect(CreateGameReqSchema.safeParse({ ...createOk, admin: true }).success).toBe(false);
    expect(JoinReqSchema.safeParse({ name: "Bo", password: "abcd", host: true }).success).toBe(
      false,
    );
  });

  it("rejects passwords of 3 or 65 chars, but does not trim them", () => {
    expect(CreateGameReqSchema.safeParse({ ...createOk, password: "abc" }).success).toBe(false);
    expect(CreateGameReqSchema.safeParse({ ...createOk, password: "a".repeat(65) }).success).toBe(
      false,
    );
    expect(JoinReqSchema.parse({ name: "Bo", password: " ab " }).password).toBe(" ab ");
  });

  it("rejects bad maxPlayers", () => {
    for (const maxPlayers of [1, 6, 2.5, "4"]) {
      expect(CreateGameReqSchema.safeParse({ ...createOk, maxPlayers }).success).toBe(false);
    }
    expect([...MaxPlayersSchema.values]).toEqual([MIN_PLAYERS, 3, 4, MAX_PLAYERS]);
  });

  it("rejects names that are empty after cleaning, and space-only room names", () => {
    expect(JoinReqSchema.safeParse({ name: " \u0000​ ", password: "abcd" }).success).toBe(false);
    expect(
      JoinReqSchema.safeParse({ name: "x".repeat(PLAYER_NAME_MAX + 1), password: "abcd" }).success,
    ).toBe(false);
    expect(CreateGameReqSchema.safeParse({ ...createOk, roomName: "      " }).success).toBe(false);
    expect(CreateGameReqSchema.safeParse({ ...createOk, roomName: "ab" }).success).toBe(false);
    expect(
      CreateGameReqSchema.safeParse({ ...createOk, roomName: "x".repeat(ROOM_NAME_MAX + 1) })
        .success,
    ).toBe(false);
  });

  it("accepts names at the max length and rejects max + 1", () => {
    expect(ROOM_NAME_MAX).toBe(50);
    expect(PLAYER_NAME_MAX).toBe(30);
    const ok = (roomName: string, name: string) =>
      CreateGameReqSchema.safeParse({ ...createOk, roomName, name }).success;
    expect(ok("r".repeat(ROOM_NAME_MAX), "p".repeat(PLAYER_NAME_MAX))).toBe(true);
    expect(ok("r".repeat(ROOM_NAME_MAX + 1), "p")).toBe(false);
    expect(ok("room", "p".repeat(PLAYER_NAME_MAX + 1))).toBe(false);
    expect(
      JoinReqSchema.safeParse({ name: "p".repeat(PLAYER_NAME_MAX), password: "abcd" }).success,
    ).toBe(true);
    expect(PatchRoomReqSchema.safeParse({ roomName: "r".repeat(ROOM_NAME_MAX) }).success).toBe(
      true,
    );
    expect(PatchRoomReqSchema.safeParse({ roomName: "r".repeat(ROOM_NAME_MAX + 1) }).success).toBe(
      false,
    );
  });

  it("rejects an empty patch and bad seat ids", () => {
    expect(PatchRoomReqSchema.safeParse({}).success).toBe(false);
    expect(PatchRoomReqSchema.safeParse({ roomName: "   " }).success).toBe(false);
    expect(KickReqSchema.safeParse({ seatId: "../../x" }).success).toBe(false);
  });
});

describe("HTTP response schemas", () => {
  it("accepts valid responses", () => {
    expect(
      AuthResSchema.safeParse({ code: "K7QF2", token: TOKEN, seatId: "a1b2c3d4" }).success,
    ).toBe(true);
    const pg = {
      code: "K7QF2",
      roomName: "Fri",
      players: 1,
      maxPlayers: 4,
      createdAt: 1,
    };
    expect(PublicGameSchema.safeParse(pg).success).toBe(true);
    expect(PublicGameSchema.safeParse({ ...pg, password: "x" }).success).toBe(false);
    expect(ErrorBodySchema.safeParse({ code: "E_BAD_CREDENTIALS" }).success).toBe(true);
    expect(ErrorBodySchema.safeParse({ code: "E_NOPE" }).success).toBe(false);
  });

  it("rejects codes outside the alphabet", () => {
    for (const code of ["K7QF", "K7QF2X", "K7QF0", "k7qf2", "K7QI2"]) {
      expect(AuthResSchema.safeParse({ code, token: TOKEN, seatId: "a1b2c3d4" }).success).toBe(
        false,
      );
    }
    expect(CODE_ALPHABET).not.toMatch(/[01ILO]/);
  });
});

describe("client messages", () => {
  const valid = [
    { type: "auth", token: TOKEN },
    { type: "roll", turn: 1 },
    { type: "action1", turn: 3, kind: "PASS" },
    { type: "action1", turn: 3, kind: "MARK", color: "RED" },
    { type: "action2", turn: 3, kind: "PASS" },
    { type: "action2", turn: 3, kind: "MARK", whiteDie: 1, color: "BLUE" },
    {
      type: "turn",
      turn: 3,
      action1: { kind: "MARK", color: "RED" },
      action2: { kind: "MARK", whiteDie: 0, color: "GREEN" },
    },
    { type: "turn", turn: 3, action1: { kind: "PASS" }, action2: { kind: "PASS" } },
    { type: "rollOff", round: 2 },
    { type: "rematch" },
    { type: "ping" },
  ];

  it("parses every valid message", () => {
    for (const m of valid) expect(ClientMessageSchema.parse(m)).toEqual(m);
  });

  it("rejects malformed messages", () => {
    const bad = [
      { type: "ping", extra: 1 },
      { type: "action1", turn: 3, kind: "MARK", color: "PURPLE" },
      { type: "action2", turn: 3, kind: "MARK", whiteDie: 2, color: "RED" },
      { type: "roll", turn: "3" },
      { type: "roll", turn: 0 },
      { type: "roll", turn: 1.5 },
      { type: "action1", turn: 3, kind: "PASS", color: "RED" },
      { type: "action2", turn: 3, kind: "MARK", color: "RED" },
      { type: "auth", token: "short" },
      { type: "turn", turn: 3, action1: { kind: "PASS" } },
      { type: "turn", turn: 3, action1: { kind: "PASS" }, action2: { kind: "MARK", color: "RED" } },
      { type: "turn", turn: 3, action1: { kind: "PASS", x: 1 }, action2: { kind: "PASS" } },
      { type: "turn", turn: 3, action1: { kind: "PASS" }, action2: { kind: "PASS" }, x: 1 },
      { type: "nope" },
      null,
      [],
    ];
    for (const m of bad) expect(ClientMessageSchema.safeParse(m).success).toBe(false);
  });

  it("parseClientMessage handles raw frames", () => {
    expect(parseClientMessage('{"type":"ping"}')).toEqual({ type: "ping" });
    expect(parseClientMessage('{"type":"undo","turn":3}')).toEqual({ type: "undo", turn: 3 });
    expect(parseClientMessage("{not json")).toBeNull();
    expect(parseClientMessage(new ArrayBuffer(4))).toBeNull();
    expect(parseClientMessage(`{"type":"ping","x":"${"a".repeat(2000)}"}`)).toBeNull();
    expect(parseClientMessage('{"type":"__proto__"}')).toBeNull();
  });
});

describe("cleanName", () => {
  it("trims, removes control chars, collapses whitespace", () => {
    expect(cleanName("  a\u0000b  ")).toBe("ab");
    expect(cleanName("a\t\n  b")).toBe("a b");
    expect(cleanName("a  b")).toBe("a b");
  });
  it("removes zero-width and bidi format characters", () => {
    expect(cleanName("a​b")).toBe("ab");
    expect(cleanName("﻿a‍b‮c⁦")).toBe("abc");
  });
  it("NFC-normalizes", () => {
    expect(cleanName("é")).toBe("é");
  });
});

describe("constants", () => {
  it("error codes include engine and protocol codes without duplicates", () => {
    expect(new Set(ERROR_CODES).size).toBe(ERROR_CODES.length);
    for (const c of ["E_ILLEGAL_MARK", "E_STALE_TURN", "E_TOO_SOON", "E_INVALID_COMMAND"]) {
      expect(isErrorCode(c)).toBe(true);
    }
  });
  it("close codes match defaults", () => {
    expect(CLOSE).toEqual({
      NOT_AUTHED: 4001,
      KICKED: 4003,
      SESSION_ENDED: 4004,
      POLICY_VIOLATION: 4008,
    });
  });
  it("request types are the schema inputs", () => {
    expectTypeOf<z.input<typeof JoinReqSchema>>().toEqualTypeOf<{
      name: string;
      password?: string | undefined;
      invite?: string | undefined;
    }>();
  });
});
