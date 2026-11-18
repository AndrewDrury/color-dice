import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  _setBaseUrlForTests,
  ApiError,
  createGame,
  getMe,
  joinGame,
  listGames,
  startGame,
} from "../src/api";
import { CODE, SEAT, TOKEN } from "./fixtures";

type Call = { url: string; init: RequestInit };
let calls: Call[];

function mockFetch(res: Response | Error) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      if (res instanceof Error) throw res;
      return res;
    }),
  );
}

const jsonRes = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });

beforeEach(() => {
  calls = [];
  _setBaseUrlForTests("http://srv");
});
afterEach(() => vi.unstubAllGlobals());

describe("api", () => {
  it("creates a game and validates the response", async () => {
    mockFetch(jsonRes(201, { code: CODE, token: TOKEN, seatId: SEAT }));
    const body = {
      roomName: "Fri",
      name: "A",
      password: "pass",
      maxPlayers: 4 as const,
      listed: true,
    };
    await expect(createGame(body)).resolves.toEqual({ code: CODE, token: TOKEN, seatId: SEAT });
    expect(calls[0]?.url).toBe("http://srv/api/games");
    expect(calls[0]?.init.method).toBe("POST");
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual(body);
  });

  it("sends the bearer token", async () => {
    mockFetch(jsonRes(200, { seatId: SEAT, name: "A", host: true, status: "lobby" }));
    await getMe(CODE, TOKEN);
    const headers = (calls[0]?.init.headers ?? {}) as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(calls[0]?.url).toBe(`http://srv/api/games/${CODE}/me`);
  });

  it("handles 204", async () => {
    mockFetch(new Response(null, { status: 204 }));
    await expect(startGame(CODE, TOKEN)).resolves.toBeUndefined();
  });

  it("turns error bodies into ApiError with retryAfter", async () => {
    mockFetch(jsonRes(429, { code: "E_RATE_LIMITED" }, { "Retry-After": "30" }));
    const err = await joinGame(CODE, { name: "A", password: "pass" }).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 429, code: "E_RATE_LIMITED", retryAfter: 30 });
  });

  it("maps network failures, bad bodies and bad codes", async () => {
    mockFetch(new TypeError("Failed to fetch"));
    await expect(listGames()).rejects.toMatchObject({ status: 0, code: "E_NETWORK" });
    mockFetch(jsonRes(200, [{ code: "nope" }]));
    await expect(listGames()).rejects.toMatchObject({ code: "E_BAD_RESPONSE" });
    mockFetch(jsonRes(500, "<html>"));
    await expect(listGames()).rejects.toMatchObject({ status: 500, code: "E_BAD_RESPONSE" });
    await expect(getMe("../x", TOKEN)).rejects.toMatchObject({ code: "E_BAD_CODE" });
  });
});
