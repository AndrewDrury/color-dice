import { describe, expect, it } from "vitest";
import {
  CHAT_HISTORY_MAX,
  CHAT_RATE,
  CHAT_TEXT_MAX,
  ClientMessageSchema,
  cleanChatText,
  isReaction,
  parseClientMessage,
  REACTIONS,
} from "../src";

describe("chat protocol", () => {
  it("exposes the constants", () => {
    expect(CHAT_TEXT_MAX).toBe(200);
    expect(CHAT_HISTORY_MAX).toBe(30);
    expect(CHAT_RATE).toEqual({
      text: { limit: 5, windowMs: 10_000 },
      react: { limit: 10, windowMs: 10_000 },
    });
    expect(REACTIONS).toHaveLength(21);
    expect(new Set(REACTIONS).size).toBe(21);
  });

  it("allows only cat reaction ids; old emoji keys are rejected (K5.1)", () => {
    for (const id of REACTIONS) {
      expect(parseClientMessage(JSON.stringify({ type: "react", emoji: id }))).toEqual({
        type: "react",
        emoji: id,
      });
      expect(isReaction(id)).toBe(true);
    }
    for (const old of [
      "👍",
      "😂",
      "😮",
      "😬",
      "🔥",
      "🎉",
      "😭",
      "👏",
      "cat_",
      "cat_fire",
      "CAT_LOL",
    ]) {
      expect(parseClientMessage(JSON.stringify({ type: "react", emoji: old }))).toBeNull();
      expect(isReaction(old)).toBe(false);
    }
  });

  it("parses chat and react, strictly", () => {
    expect(parseClientMessage(JSON.stringify({ type: "chat", text: "hi 🎉" }))).toEqual({
      type: "chat",
      text: "hi 🎉",
    });
    expect(
      parseClientMessage(
        JSON.stringify({ type: "react", emoji: "mad-the-internet-gif-by-moodman" }),
      )?.type,
    ).toBe("react");
    expect(parseClientMessage(JSON.stringify({ type: "react", emoji: "💩" }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ type: "react", emoji: "hello" }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ type: "chat", text: "x", extra: 1 }))).toBeNull();
    expect(ClientMessageSchema.safeParse({ type: "chat", text: "x".repeat(1001) }).success).toBe(
      false,
    );
    expect(ClientMessageSchema.safeParse({ type: "chat" }).success).toBe(false);
  });

  it("cleans text like names and keeps emoji", () => {
    expect(cleanChatText("  a \n\n b\t🎉\u0000​ ")).toBe("a b 🎉");
    expect(cleanChatText("\u0000\u0007 \n")).toBe("");
    expect(isReaction("cat-gif")).toBe(true);
    expect(isReaction("x")).toBe(false);
  });
});
