import { describe, expect, it } from "vitest";
import {
  CreateGameReqSchema,
  defaultProfile,
  JoinReqSchema,
  PROFILE_COLORS,
  ProfileSchema,
  parseClientMessage,
  REACTIONS,
} from "../src";

const create = {
  roomName: "Cat room",
  name: "Ann",
  password: "secret-pw",
  maxPlayers: 2,
  listed: true,
};

describe("profile (T-NEW-13)", () => {
  it("accepts every allow-listed colour and cat", () => {
    for (const color of PROFILE_COLORS) {
      expect(ProfileSchema.safeParse({ color, cat: "mad-cat" }).success).toBe(true);
    }
    for (const cat of REACTIONS) {
      expect(ProfileSchema.safeParse({ color: "teal", cat }).success).toBe(true);
    }
  });

  it.each([
    { color: "red", cat: "mad-cat" },
    { color: "teal", cat: "../../etc/passwd" },
    { color: "teal", cat: "Cat GIF.gif" },
    { color: "teal", cat: "" },
    { color: "teal" },
    { cat: "mad-cat" },
    { color: "teal", cat: "mad-cat", extra: 1 },
    { color: 1, cat: "mad-cat" },
    null,
    "teal",
  ])("rejects malformed profile %j", (bad) => {
    expect(ProfileSchema.safeParse(bad).success).toBe(false);
    expect(CreateGameReqSchema.safeParse({ ...create, profile: bad }).success).toBe(false);
    expect(
      JoinReqSchema.safeParse({ name: "Bo", password: "secret-pw", profile: bad }).success,
    ).toBe(false);
  });

  it("profile is optional on create and join", () => {
    expect(CreateGameReqSchema.safeParse(create).success).toBe(true);
    expect(JoinReqSchema.safeParse({ name: "Bo", password: "secret-pw" }).success).toBe(true);
  });

  it("the profile socket message is validated", () => {
    const ok = JSON.stringify({ type: "profile", profile: { color: "sky", cat: "cat-gif" } });
    expect(parseClientMessage(ok)).not.toBeNull();
    const bad = JSON.stringify({ type: "profile", profile: { color: "sky", cat: "nope" } });
    expect(parseClientMessage(bad)).toBeNull();
    expect(parseClientMessage('{"type":"profile"}')).toBeNull();
  });

  it("default profiles cycle through the colours with the default cat", () => {
    expect(defaultProfile(1)).toEqual({ color: "coral", cat: "mad-cat" });
    expect(defaultProfile(11).color).toBe("coral");
    expect(defaultProfile(0).color).toBe("coral");
  });
});
