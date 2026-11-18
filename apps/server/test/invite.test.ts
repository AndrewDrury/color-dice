/// <reference types="@cloudflare/vitest-plugin/types" />
/** K2.1 invite link: creation, use, rotation, guessing, and secrecy. */
import { runInDurableObject } from "cloudflare:test";
import { env } from "cloudflare:workers";
import {
  type AuthRes,
  type CreateGameRes,
  INVITE_KEY_LENGTH,
  type InviteRes,
  LOCKOUT_FAILED_ATTEMPTS,
} from "@cd/protocol";
import { describe, expect, it, vi } from "vitest";
import type { GameRoom } from "../src/game-room";
import type { RoomMeta } from "../src/room-store";
import { api, connect, PASSWORD } from "./helpers/client";

const stub = (code: string) => env.GAME_ROOM.get(env.GAME_ROOM.idFromName(code));
const BAD = JSON.stringify({ code: "E_BAD_CREDENTIALS" });

function randomKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function create(listed = true): Promise<CreateGameRes> {
  const res = await api("POST", "/api/games", {
    body: { roomName: "Invite room", name: "Ana", password: PASSWORD, maxPlayers: 5, listed },
  });
  expect(res.status).toBe(201);
  return (await res.json()) as CreateGameRes;
}

const join = (code: string, body: Record<string, unknown>) =>
  api("POST", `/api/games/${code}/join`, { body });
const reclaim = (code: string, body: Record<string, unknown>) =>
  api("POST", `/api/games/${code}/reclaim`, { body });

async function getInvite(code: string, token: string): Promise<Response> {
  return api("GET", `/api/games/${code}/invite`, { token });
}

describe("invite key", () => {
  it("create returns a 256-bit key; joining with it needs no password", async () => {
    const host = await create();
    expect(host.inviteKey).toMatch(new RegExp(`^[A-Za-z0-9_-]{${INVITE_KEY_LENGTH}}$`));
    const res = await join(host.code, { name: "Bo", invite: host.inviteKey });
    expect(res.status).toBe(201);
    const bo = (await res.json()) as AuthRes;
    expect(Object.keys(bo).sort()).toEqual(["code", "seatId", "token"]);
    // Any seated player can read it back; nobody else can.
    const got = await getInvite(host.code, bo.token);
    expect(got.status).toBe(200);
    expect(await got.json()).toEqual({ inviteKey: host.inviteKey } satisfies InviteRes);
    expect((await api("GET", `/api/games/${host.code}/invite`)).status).toBe(401);
    expect((await getInvite(host.code, "x".repeat(43))).status).toBe(401);
  });

  it("both or neither of password/invite → 400, and the 400 body never echoes the key", async () => {
    const host = await create();
    const both = await join(host.code, { name: "Bo", password: PASSWORD, invite: host.inviteKey });
    const neither = await join(host.code, { name: "Bo" });
    const both2 = await reclaim(host.code, {
      name: "Ana",
      password: PASSWORD,
      invite: host.inviteKey,
    });
    for (const r of [both, neither, both2]) {
      expect(r.status).toBe(400);
      expect(await r.text()).not.toContain(host.inviteKey);
    }
  });

  it("wrong invite → the same 401 body as a wrong password and an unknown code", async () => {
    const host = await create();
    const wrongInvite = await join(host.code, { name: "Bo", invite: randomKey() });
    const wrongPw = await join(host.code, { name: "Bo", password: "nope-nope" });
    const unknown = await join("ZZZZ3", { name: "Bo", invite: host.inviteKey });
    for (const r of [wrongInvite, wrongPw, unknown]) {
      expect(r.status).toBe(401);
      expect(await r.text()).toBe(BAD);
    }
  });

  it("reclaim works with the invite", async () => {
    const host = await create();
    const res = await reclaim(host.code, { name: "ana", invite: host.inviteKey });
    expect(res.status).toBe(200);
    const fresh = (await res.json()) as AuthRes;
    expect(fresh.seatId).toBe(host.seatId);
    expect((await getInvite(host.code, host.token)).status).toBe(401);
  });

  it("host reset rotates the key at once; non-host → 403", async () => {
    const host = await create();
    const bo = (await (
      await join(host.code, { name: "Bo", invite: host.inviteKey })
    ).json()) as AuthRes;
    const denied = await api("POST", `/api/games/${host.code}/invite/reset`, { token: bo.token });
    expect(denied.status).toBe(403);
    const res = await api("POST", `/api/games/${host.code}/invite/reset`, { token: host.token });
    expect(res.status).toBe(200);
    const { inviteKey } = (await res.json()) as InviteRes;
    expect(inviteKey).not.toBe(host.inviteKey);
    const old = await join(host.code, { name: "Cy", invite: host.inviteKey });
    expect(old.status).toBe(401);
    expect(await old.text()).toBe(BAD);
    expect((await join(host.code, { name: "Cy", invite: inviteKey })).status).toBe(201);
  });

  it("changing the password rotates the key", async () => {
    const host = await create();
    const res = await api("PATCH", `/api/games/${host.code}`, {
      token: host.token,
      body: { password: "brand-new" },
    });
    expect(res.status).toBe(204);
    expect((await join(host.code, { name: "Bo", invite: host.inviteKey })).status).toBe(401);
    const now = (await (await getInvite(host.code, host.token)).json()) as InviteRes;
    expect(now.inviteKey).not.toBe(host.inviteKey);
    expect((await join(host.code, { name: "Bo", invite: now.inviteKey })).status).toBe(201);
  });
});

describe("guessing", () => {
  it("1,000 random keys are all rejected with the same 401", async () => {
    const host = await create(false);
    await runInDurableObject(stub(host.code), async (room: GameRoom) => {
      for (let i = 0; i < 1000; i++) {
        const r = await room.join(`G${i % 10}`, { invite: randomKey() });
        expect(r).toEqual({ ok: false, status: 401, code: "E_BAD_CREDENTIALS" });
      }
    });
  });

  it("wrong invites and passwords share the 10-strike lockout", async () => {
    const host = await create();
    const half = LOCKOUT_FAILED_ATTEMPTS / 2;
    for (let i = 0; i < half; i++)
      expect((await join(host.code, { name: "Bo", password: "wrong-pw" })).status).toBe(401);
    for (let i = 0; i < half - 1; i++)
      expect((await join(host.code, { name: "Bo", invite: randomKey() })).status).toBe(401);
    const meta = () =>
      runInDurableObject(stub(host.code), (_r: GameRoom, s: DurableObjectState) =>
        s.storage.get<RoomMeta>("meta"),
      );
    expect((await meta())?.joinLockedUntil).toBeNull();
    expect((await join(host.code, { name: "Bo", invite: randomKey() })).status).toBe(401);
    expect((await meta())?.joinLockedUntil).not.toBeNull();
    // Locked: even the right invite gets the same 401.
    const locked = await join(host.code, { name: "Bo", invite: host.inviteKey });
    expect(locked.status).toBe(401);
    expect(await locked.text()).toBe(BAD);
  });
});

describe("secrecy", () => {
  it("the key is never in a WS frame, the public list, an error body or the logs", async () => {
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((m) =>
      vi.spyOn(console, m).mockImplementation(() => {}),
    );
    try {
      const host = await create();
      const hostConn = await connect(host.code, host.token);
      const bo = (await (
        await join(host.code, { name: "Bo", invite: host.inviteKey })
      ).json()) as AuthRes;
      const boConn = await connect(host.code, bo.token);
      await api("POST", `/api/games/${host.code}/invite/reset`, { token: host.token });
      const { inviteKey } = (await (await getInvite(host.code, bo.token)).json()) as InviteRes;
      const errors = [
        await join(host.code, { name: "Bo", invite: inviteKey }), // name taken
        await reclaim(host.code, { name: "Bo", invite: inviteKey }), // seat online
        await join(host.code, { name: "Cy", invite: host.inviteKey }), // stale key
      ];
      expect(
        (await api("POST", `/api/games/${host.code}/start`, { token: host.token })).status,
      ).toBe(204);
      await hostConn.until(() => hostConn.view().game !== null);
      await boConn.until(() => boConn.view().game !== null);
      const list = await (await api("GET", "/api/games")).text();
      const bodies = await Promise.all(errors.map((r) => r.text()));
      const frames = JSON.stringify([...hostConn.frames, ...boConn.frames]);
      const logs = JSON.stringify(spies.map((s) => s.mock.calls));
      for (const key of [host.inviteKey, inviteKey]) {
        expect(frames).not.toContain(key);
        expect(list).not.toContain(key);
        for (const b of bodies) expect(b).not.toContain(key);
        expect(logs).not.toContain(key);
      }
      hostConn.close();
      boConn.close();
    } finally {
      for (const s of spies) s.mockRestore();
    }
  });

  it("GET /api/games carries no player names", async () => {
    const host = await create();
    await join(host.code, { name: "Zelda", invite: host.inviteKey });
    const body = await (await api("GET", "/api/games")).text();
    const entry = (JSON.parse(body) as { code: string }[]).find((g) => g.code === host.code);
    expect(entry).toBeDefined();
    expect(Object.keys(entry ?? {}).sort()).toEqual(
      ["code", "createdAt", "maxPlayers", "players", "roomName"].sort(),
    );
    expect(body).not.toMatch(/Ana|Zelda|hostName|invite/);
  });
});
