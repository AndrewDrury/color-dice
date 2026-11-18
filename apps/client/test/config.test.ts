import { describe, expect, it } from "vitest";
import { stripTrailingSlash, toWsUrl, WS_URL } from "../src/config";

describe("config", () => {
  it("derives the ws url", () => {
    expect(toWsUrl("http://localhost:8787")).toBe("ws://localhost:8787");
    expect(toWsUrl("https://example.workers.dev")).toBe("wss://example.workers.dev");
    expect(stripTrailingSlash("https://a.dev//")).toBe("https://a.dev");
    expect(WS_URL).toMatch(/^wss?:\/\//);
  });
});
