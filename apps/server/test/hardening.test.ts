import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { readJson, type Schema } from "../src/http";
import { api } from "./helpers/client";

const BASE = "https://worker.test";
const anyJson: Schema<unknown> = { safeParse: (data) => ({ success: true, data }) };

function post(headers: Record<string, string>, body: string): Promise<Response> {
  return exports.default.fetch(new Request(`${BASE}/api/games`, { method: "POST", headers, body }));
}

describe("T-FIX-3 hardening", () => {
  it("rejects a non-JSON content type with 415", async () => {
    const res = await post({ "content-type": "text/plain", "cf-connecting-ip": "10.99.0.1" }, "{}");
    expect(res.status).toBe(415);
    expect(await res.json()).toMatchObject({ code: "E_INVALID_COMMAND" });
  });

  it("rejects a present-but-disallowed Origin on POST with 403", async () => {
    const res = await post(
      {
        "content-type": "application/json",
        origin: "https://evil.example",
        "cf-connecting-ip": "10.99.0.2",
      },
      "{}",
    );
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "E_FORBIDDEN_ORIGIN" });
  });

  it("still allows bodiless POSTs (client start/leave)", async () => {
    const res = await api("POST", "/api/games/ABCDE/leave", { token: "x".repeat(43) });
    expect(res.status).toBe(401);
  });

  it("readJson caps the body at 4 KB", async () => {
    const big = JSON.stringify({ pad: "a".repeat(5000) });
    const req = new Request(`${BASE}/x`, { method: "POST", body: big });
    const r = await readJson(req, anyJson);
    expect(r.ok).toBe(false);
    const small = new Request(`${BASE}/x`, { method: "POST", body: '{"a":1}' });
    expect((await readJson(small, anyJson)).ok).toBe(true);
  });

  it("an oversized create body is a 400", async () => {
    const body = JSON.stringify({ roomName: "a".repeat(5000) });
    const res = await post(
      { "content-type": "application/json", "cf-connecting-ip": "10.99.0.3" },
      body,
    );
    expect(res.status).toBe(400);
  });
});
