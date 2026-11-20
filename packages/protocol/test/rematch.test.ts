import { describe, expect, it } from "vitest";
import {
  ClientMessageSchema,
  ErrorMessageSchema,
  parseClientMessage,
  RematchOfferMessageSchema,
} from "../src";

const token = "a".repeat(43);
const offer = {
  fromSeatId: "seat0001",
  fromName: "Alex",
  fromProfile: { color: "teal", cat: "mad-cat" },
  accepted: ["seat0001"],
  expiresAt: 1_700_000_000_000,
};

describe("T-NEW-30 rematch messages", () => {
  it("parses the client messages and rejects extra fields", () => {
    for (const type of ["rematchRequest", "rematchAccept", "rematchDecline"]) {
      expect(ClientMessageSchema.parse({ type })).toEqual({ type });
      expect(parseClientMessage(JSON.stringify({ type, extra: 1 }))).toBeNull();
    }
    expect(ClientMessageSchema.parse({ type: "watch", token })).toEqual({ type: "watch", token });
    expect(parseClientMessage(JSON.stringify({ type: "watch" }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ type: "watch", token: "short" }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ type: "watch", token, x: 1 }))).toBeNull();
  });

  it("validates rematchOffer strictly (display data only)", () => {
    const ok = RematchOfferMessageSchema.safeParse({ type: "rematchOffer", offer });
    expect(ok.success).toBe(true);
    expect(
      RematchOfferMessageSchema.safeParse({ type: "rematchOffer", offer: null, reason: "started" })
        .success,
    ).toBe(true);
    expect(
      RematchOfferMessageSchema.safeParse({ type: "rematchOffer", offer: { ...offer, token } })
        .success,
    ).toBe(false);
    expect(
      RematchOfferMessageSchema.safeParse({ type: "rematchOffer", offer: null, reason: "nope" })
        .success,
    ).toBe(false);
    expect(RematchOfferMessageSchema.safeParse({ type: "rematchOffer" }).success).toBe(false);
  });

  it("error messages may name the new commands", () => {
    for (const command of ["rematchRequest", "rematchAccept", "rematchDecline", "watch"]) {
      expect(
        ErrorMessageSchema.safeParse({ type: "error", code: "E_RATE_LIMITED", command }).success,
      ).toBe(true);
    }
  });
});
