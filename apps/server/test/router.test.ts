import { describe, expect, it } from "vitest";
import { bearer, readJson, type Schema } from "../src/http";
import { matchRoute, normalizeCode } from "../src/router";

describe("router", () => {
  it("matches every C5/C6 route", () => {
    expect(matchRoute("GET", "/health")).toEqual({ kind: "health" });
    expect(matchRoute("GET", "/api/games")).toEqual({ kind: "listGames" });
    expect(matchRoute("POST", "/api/games")).toEqual({ kind: "createGame" });
    expect(matchRoute("GET", "/ws/lobby")).toEqual({ kind: "lobbySocket" });
    expect(matchRoute("GET", "/ws/game/abcde")).toEqual({ kind: "gameSocket", code: "ABCDE" });
    for (const [m, a] of [
      ["POST", "join"],
      ["POST", "reclaim"],
      ["GET", "me"],
      ["POST", "start"],
      ["POST", "leave"],
      ["POST", "kick"],
    ] as const) {
      expect(matchRoute(m, `/api/games/ABCDE/${a}`)).toEqual({
        kind: "game",
        code: "ABCDE",
        action: a,
      });
    }
    expect(matchRoute("PATCH", "/api/games/ABCDE")).toEqual({
      kind: "game",
      code: "ABCDE",
      action: "update",
    });
  });

  it("rejects wrong methods, bad codes and extra segments", () => {
    expect(matchRoute("POST", "/health")).toBeNull();
    expect(matchRoute("GET", "/api/games/ABCDE/join")).toBeNull();
    expect(matchRoute("DELETE", "/api/games")).toBeNull();
    expect(matchRoute("GET", "/api/games/ABCD1/me")).toBeNull();
    expect(matchRoute("GET", "/api/games/ABCDEF/me")).toBeNull();
    expect(matchRoute("GET", "/api/games/ABCDE/me/x")).toBeNull();
    expect(matchRoute("GET", "/api/games/ABCDE/constructor")).toBeNull();
  });

  it("normalizes codes", () => {
    expect(normalizeCode("x2y3z")).toBe("X2Y3Z");
    expect(normalizeCode("ABCD0")).toBeNull();
    expect(normalizeCode("%E0%A4%A")).toBeNull();
  });
});

describe("http helpers", () => {
  const schema: Schema<{ n: number }> = {
    safeParse: (x) =>
      typeof x === "object" && x !== null && typeof (x as { n?: unknown }).n === "number"
        ? { success: true, data: x as { n: number } }
        : { success: false },
  };

  it("readJson accepts valid bodies and rejects bad ones with 400", async () => {
    const good = await readJson(
      new Request("https://x", { method: "POST", body: '{"n":1}' }),
      schema,
    );
    expect(good).toEqual({ ok: true, value: { n: 1 } });
    for (const body of ["{", '{"n":"1"}']) {
      const bad = await readJson(new Request("https://x", { method: "POST", body }), schema);
      expect(bad.ok).toBe(false);
      if (!bad.ok) {
        expect(bad.response.status).toBe(400);
        expect(((await bad.response.json()) as { code: string }).code).toBe("E_INVALID_COMMAND");
      }
    }
  });

  it("bearer extracts the token", () => {
    const h = (v?: string) => new Request("https://x", v ? { headers: { authorization: v } } : {});
    expect(bearer(h("Bearer abc"))).toBe("abc");
    expect(bearer(h("bearer abc"))).toBe("abc");
    expect(bearer(h("Basic abc"))).toBeNull();
    expect(bearer(h())).toBeNull();
  });
});
