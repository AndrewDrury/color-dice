/// <reference types="@cloudflare/vitest-plugin/types" />

import { exports } from "cloudflare:workers";
import type { AuthRes, MeRes } from "@cd/protocol";
import { describe, expect, it } from "vitest";
import { isRoomFull } from "../src/room-start";
import type { RoomMeta, SeatRecord } from "../src/room-store";

const PW = "hunter22";
let seq = 0;

function api(method: string, path: string, body?: unknown, token?: string): Promise<Response> {
  seq++;
  const headers: Record<string, string> = { "cf-connecting-ip": `10.88.${seq >> 8}.${seq & 255}` };
  if (body !== undefined) headers["content-type"] = "application/json";
  if (token) headers.authorization = `Bearer ${token}`;
  return exports.default.fetch(
    new Request(`https://worker.test${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
}

const create = async (maxPlayers: number): Promise<AuthRes> => {
  const r = await api("POST", "/api/games", {
    roomName: "Auto",
    name: "Host",
    password: PW,
    maxPlayers,
    listed: false,
  });
  expect(r.status).toBe(201);
  return (await r.json()) as AuthRes;
};
const join = (code: string, name: string) =>
  api("POST", `/api/games/${code}/join`, { name, password: PW });
const status = async (a: AuthRes) =>
  ((await (await api("GET", `/api/games/${a.code}/me`, undefined, a.token)).json()) as MeRes)
    .status;

describe("auto-start when the room fills", () => {
  it("the join that fills a 2-player room starts the game", async () => {
    const host = await create(2);
    expect(await status(host)).toBe("lobby");
    const r = await join(host.code, "Bob");
    expect(r.status).toBe(201);
    expect(await status(host)).toBe("playing");
  });

  it("a room below max stays in the lobby, then manual Start works", async () => {
    const host = await create(3);
    await join(host.code, "Bob");
    expect(await status(host)).toBe("lobby");
    expect((await api("POST", `/api/games/${host.code}/start`, undefined, host.token)).status).toBe(
      204,
    );
    expect(await status(host)).toBe("playing");
  });

  it("a third join starts a 3-player room; a late Start or join is refused (exactly once)", async () => {
    const host = await create(3);
    await join(host.code, "Bob");
    await join(host.code, "Cy");
    expect(await status(host)).toBe("playing");
    expect((await api("POST", `/api/games/${host.code}/start`, undefined, host.token)).status).toBe(
      409,
    );
    expect((await join(host.code, "Di")).status).toBe(409);
  });

  it("racing joins into the last seat start once and seat once", async () => {
    const host = await create(2);
    const rs = await Promise.all([join(host.code, "Bob"), join(host.code, "Cy")]);
    expect(rs.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await status(host)).toBe("playing");
  });

  it("a seat that left the lobby does not count", async () => {
    const host = await create(3);
    const bob = (await (await join(host.code, "Bob")).json()) as AuthRes;
    expect((await api("POST", `/api/games/${host.code}/leave`, undefined, bob.token)).status).toBe(
      204,
    );
    await join(host.code, "Cy");
    expect(await status(host)).toBe("lobby");
    await join(host.code, "Di");
    expect(await status(host)).toBe("playing");
  });
});

describe("isRoomFull", () => {
  const meta = (status: string, maxPlayers: number) =>
    ({ status, maxPlayers }) as unknown as RoomMeta;
  const seats = (n: number) => Array.from({ length: n }, () => ({})) as SeatRecord[];
  it("only a lobby at capacity", () => {
    expect(isRoomFull(meta("lobby", 2), seats(2))).toBe(true);
    expect(isRoomFull(meta("lobby", 3), seats(2))).toBe(false);
    expect(isRoomFull(meta("playing", 2), seats(2))).toBe(false);
  });
});
