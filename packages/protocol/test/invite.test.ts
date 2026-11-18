import { describe, expect, it } from "vitest";
import {
  CreateGameResSchema,
  INVITE_KEY_LENGTH,
  InviteKeySchema,
  InviteResSchema,
  JoinReqSchema,
  PublicGameSchema,
  ReclaimReqSchema,
} from "../src";

const KEY = "a".repeat(INVITE_KEY_LENGTH);

describe("invite link schemas (K2.1)", () => {
  it("invite key is 43 base64url chars", () => {
    expect(InviteKeySchema.safeParse(KEY).success).toBe(true);
    expect(InviteKeySchema.safeParse(`${"-_".repeat(21)}Z`).success).toBe(true);
    for (const bad of ["", KEY.slice(1), `${KEY}a`, `${KEY.slice(1)}=`, `${KEY.slice(1)}/`]) {
      expect(InviteKeySchema.safeParse(bad).success).toBe(false);
    }
  });

  it("join and reclaim take exactly one of password or invite", () => {
    for (const schema of [JoinReqSchema, ReclaimReqSchema]) {
      expect(schema.safeParse({ name: "Bo", password: "abcd" }).success).toBe(true);
      expect(schema.safeParse({ name: "Bo", invite: KEY }).success).toBe(true);
      expect(schema.safeParse({ name: "Bo", password: "abcd", invite: KEY }).success).toBe(false);
      expect(schema.safeParse({ name: "Bo" }).success).toBe(false);
      expect(schema.safeParse({ name: "Bo", invite: "short" }).success).toBe(false);
      expect(schema.safeParse({ name: "Bo", invite: KEY, x: 1 }).success).toBe(false);
    }
  });

  it("create response carries the invite key; invite response is strict", () => {
    const res = { code: "K7QF2", token: "A".repeat(43), seatId: "a1b2c3d4", inviteKey: KEY };
    expect(CreateGameResSchema.safeParse(res).success).toBe(true);
    expect(CreateGameResSchema.safeParse({ ...res, inviteKey: undefined }).success).toBe(false);
    expect(InviteResSchema.safeParse({ inviteKey: KEY }).success).toBe(true);
    expect(InviteResSchema.safeParse({ inviteKey: KEY, code: "K7QF2" }).success).toBe(false);
  });
});

describe("public room list (K2.3)", () => {
  it("entries carry no player names", () => {
    const pg = { code: "K7QF2", roomName: "Fri", players: 1, maxPlayers: 4, createdAt: 1 };
    expect(PublicGameSchema.safeParse(pg).success).toBe(true);
    expect(PublicGameSchema.safeParse({ ...pg, hostName: "Ana" }).success).toBe(false);
    expect(Object.keys(PublicGameSchema.shape).sort()).toEqual(
      ["code", "createdAt", "maxPlayers", "players", "roomName"].sort(),
    );
  });
});
