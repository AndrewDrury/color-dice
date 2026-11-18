import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

const BASE = "https://worker.test";
const GOOD = "http://localhost:5173";

function call(path: string, init?: RequestInit): Promise<Response> {
  return exports.default.fetch(new Request(`${BASE}${path}`, init));
}

describe("health and routing", () => {
  it("GET /health returns 200 ok", async () => {
    const res = await call("/health");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("ok");
  });

  it("unknown route returns 404 with an error body", async () => {
    const res = await call("/nope");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ code: "E_NOT_FOUND" });
  });

  it("invalid game code returns 404", async () => {
    expect((await call("/api/games/OOOOO/me")).status).toBe(404);
    expect((await call("/ws/game/abc", { headers: { origin: GOOD } })).status).toBe(404);
  });

  it("routes a lower-case game code to the stub GameRoom (501)", async () => {
    const res = await call("/api/games/abcde/me");
    expect(res.status).toBe(501);
    expect(await res.json()).toEqual({ code: "E_NOT_IMPLEMENTED" });
  });

  it("routes GET /api/games to the stub Lobby (501) with CORS for allowed origin", async () => {
    const res = await call("/api/games", { headers: { origin: GOOD } });
    expect(res.status).toBe(501);
    expect(res.headers.get("access-control-allow-origin")).toBe(GOOD);
    await res.body?.cancel();
  });
});

describe("origin and CORS", () => {
  it("WS upgrade with a bad Origin returns 403", async () => {
    const res = await call("/ws/lobby", {
      headers: { upgrade: "websocket", origin: "https://evil.example" },
    });
    expect(res.status).toBe(403);
    await res.body?.cancel();
  });

  it("WS upgrade with no Origin returns 403", async () => {
    const res = await call("/ws/game/ABCDE", { headers: { upgrade: "websocket" } });
    expect(res.status).toBe(403);
    await res.body?.cancel();
  });

  it("preflight from an allowed origin returns 204 with CORS headers", async () => {
    const res = await call("/api/games", {
      method: "OPTIONS",
      headers: { origin: GOOD, "access-control-request-method": "POST" },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe(GOOD);
    expect(res.headers.get("vary")).toBe("Origin");
    expect(res.headers.get("access-control-allow-headers")).toBe("content-type, authorization");
    expect(res.headers.get("access-control-allow-methods")).toBe("GET,POST,PATCH,OPTIONS");
  });

  it("preflight from a disallowed origin gets no ACAO header", async () => {
    const res = await call("/api/games", {
      method: "OPTIONS",
      headers: { origin: "https://evil.example", "access-control-request-method": "POST" },
    });
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
    await res.body?.cancel();
  });

  it("requests without Origin are allowed but get no CORS headers", async () => {
    const res = await call("/health");
    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });
});
