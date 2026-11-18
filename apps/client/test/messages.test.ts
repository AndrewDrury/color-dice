import { describe, expect, it } from "vitest";
import { MAX_SERVER_MESSAGE_CHARS, parseLobbyMessage, parseServerMessage } from "../src/messages";
import { makeView } from "./fixtures";

const s = (v: unknown) => JSON.stringify(v);

describe("parseServerMessage", () => {
  it("accepts every valid server message", () => {
    expect(parseServerMessage(s(makeView(3)))?.type).toBe("view");
    expect(parseServerMessage(s({ type: "error", code: "E_STALE_TURN", command: "roll" }))).toEqual(
      {
        type: "error",
        code: "E_STALE_TURN",
        command: "roll",
      },
    );
    for (const type of ["kicked", "sessionEnded", "pong"]) {
      expect(parseServerMessage(s({ type }))).toEqual({ type });
    }
  });

  it("rejects malformed frames", () => {
    expect(parseServerMessage(s({ ...makeView(1), secret: "x" }))).toBeNull();
    expect(parseServerMessage(s({ type: "pong", x: 1 }))).toBeNull();
    expect(parseServerMessage(s({ type: "error", code: "E_NOPE", command: null }))).toBeNull();
    expect(parseServerMessage(s({ type: "other" }))).toBeNull();
    expect(parseServerMessage("[]")).toBeNull();
    expect(parseServerMessage("{")).toBeNull();
    expect(parseServerMessage(new ArrayBuffer(2))).toBeNull();
    expect(parseServerMessage(" ".repeat(MAX_SERVER_MESSAGE_CHARS + 1))).toBeNull();
  });

  it("validates lobby messages", () => {
    expect(parseLobbyMessage(s({ type: "games", games: [] }))).toEqual({
      type: "games",
      games: [],
    });
    expect(parseLobbyMessage(s({ type: "games" }))).toBeNull();
    expect(parseLobbyMessage(s({ type: "games", games: [], x: 1 }))).toBeNull();
  });
});
