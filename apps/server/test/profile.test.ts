/// <reference types="@cloudflare/vitest-plugin/types" />
/** Player profile (T-NEW-13): stored, defaulted, validated, public to every seat, not in the list. */
import type { AuthRes } from "@cd/protocol";
import { describe, expect, it } from "vitest";
import { api, connect, PASSWORD } from "./helpers/client";

const body = (extra: Record<string, unknown> = {}) => ({
  roomName: "Cat room",
  name: "Ann",
  password: PASSWORD,
  maxPlayers: 3,
  listed: true,
  ...extra,
});

describe("profile", () => {
  it("is stored on create/join and visible to every seat; defaults for old clients", async () => {
    const cr = await api("POST", "/api/games", {
      body: body({ profile: { color: "teal", cat: "cat-laugh-gif" } }),
    });
    expect(cr.status).toBe(201);
    const host = (await cr.json()) as AuthRes;
    const jr = await api("POST", `/api/games/${host.code}/join`, {
      body: { name: "Bo", password: PASSWORD },
    });
    expect(jr.status).toBe(201);
    const guest = (await jr.json()) as AuthRes;
    const c = await connect(host.code, host.token);
    const g = await connect(host.code, guest.token);
    for (const conn of [c, g]) {
      await conn.until(() => conn.view().seats.length === 2);
      const seats = conn.view().seats;
      expect(seats[0]?.profile).toEqual({ color: "teal", cat: "cat-laugh-gif" });
      expect(seats[1]?.profile).toEqual({ color: "amber", cat: "mad-cat" });
    }
  });

  it("rejects invalid profile ids with 400", async () => {
    for (const profile of [
      { color: "red", cat: "mad-cat" },
      { color: "teal", cat: "../x" },
      { color: "teal" },
      "teal",
    ]) {
      const r = await api("POST", "/api/games", { body: body({ profile }) });
      expect(r.status).toBe(400);
    }
    const cr = await api("POST", "/api/games", { body: body() });
    const host = (await cr.json()) as AuthRes;
    const r = await api("POST", `/api/games/${host.code}/join`, {
      body: { name: "Bo", password: PASSWORD, profile: { color: "teal", cat: "nope" } },
    });
    expect(r.status).toBe(400);
  });

  it("can be changed in the lobby over the socket; bad ids are rejected", async () => {
    const cr = await api("POST", "/api/games", { body: body() });
    const host = (await cr.json()) as AuthRes;
    const c = await connect(host.code, host.token);
    const profile = { color: "violet", cat: "dance-cat-gif" };
    c.send({ type: "profile", profile });
    await c.until(() => c.view().seats[0]?.profile?.color === "violet");
    expect(c.view().seats[0]?.profile).toEqual(profile);
    c.send({ type: "profile", profile: { color: "violet", cat: "nope" } });
    const err = await c.next("error");
    expect(err.code).toBe("E_INVALID_COMMAND");
    expect(c.view().seats[0]?.profile).toEqual(profile);
  });

  it("is absent from the public room list", async () => {
    const cr = await api("POST", "/api/games", {
      body: body({ roomName: "Public cats", profile: { color: "pink", cat: "cat-gif" } }),
    });
    expect(cr.status).toBe(201);
    const list = await api("GET", "/api/games");
    const text = await list.text();
    expect(text).toContain("Public cats");
    expect(text).not.toContain("pink");
    expect(text).not.toContain("cat-gif");
    expect(text).not.toContain("profile");
  });

  it("reclaim applies a profile only in the lobby", async () => {
    const cr = await api("POST", "/api/games", { body: body({ maxPlayers: 2 }) });
    const host = (await cr.json()) as AuthRes;
    const mine = { color: "pink", cat: "cat-gif" };
    const lobby = await api("POST", `/api/games/${host.code}/reclaim`, {
      body: { name: "Ann", password: PASSWORD, profile: mine },
    });
    expect(lobby.status).toBe(200);
    const t1 = ((await lobby.json()) as AuthRes).token;
    const c = await connect(host.code, t1);
    expect(c.view().seats[0]?.profile).toEqual(mine);
    c.close();
    await api("POST", `/api/games/${host.code}/join`, { body: { name: "Bo", password: PASSWORD } });
    const c2 = await connect(host.code, t1);
    await c2.until(() => c2.view().game !== null || c2.view().rollOff !== null);
    c2.close();
    const late = await api("POST", `/api/games/${host.code}/reclaim`, {
      body: { name: "Ann", password: PASSWORD, profile: { color: "teal", cat: "mad-cat" } },
    });
    expect(late.status).toBe(200);
    const c3 = await connect(host.code, ((await late.json()) as AuthRes).token);
    expect(c3.view().seats[0]?.profile).toEqual(mine);
  });

  describe("unique colours (T-NEW-32)", () => {
    const P = (color: string) => ({ color, cat: "mad-cat" });
    const make = async (color: string, maxPlayers = 4) => {
      const cr = await api("POST", "/api/games", {
        body: body({ maxPlayers, profile: P(color) }),
      });
      return (await cr.json()) as AuthRes;
    };
    const join = (code: string, name: string, profile?: unknown) =>
      api("POST", `/api/games/${code}/join`, {
        body: { name, password: PASSWORD, ...(profile ? { profile } : {}) },
      });

    it("rejects a taken colour on join, lists colours only, and picks a free default", async () => {
      const host = await make("amber");
      const r = await join(host.code, "Bo", P("amber"));
      expect(r.status).toBe(409);
      expect(await r.json()).toEqual({ code: "E_COLOUR_TAKEN", reason: "amber" });
      // No profile: the order-2 default (amber) is taken, so the first free colour is used.
      const ok = await join(host.code, "Cy");
      expect(ok.status).toBe(201);
      const c = await connect(host.code, host.token);
      expect(c.view().seats.map((s) => s.profile?.color)).toEqual(["amber", "coral"]);
      const info = await api("GET", `/api/games/${host.code}/colors`);
      expect(await info.json()).toEqual({ taken: ["amber", "coral"] });
      expect((await api("GET", "/api/games/ZZZZZZ/colors")).status).toBe(404);
    });

    it("concurrent joins with the same colour: exactly one wins", async () => {
      const host = await make("teal");
      const rs = await Promise.all(["Bo", "Cy", "Di"].map((n) => join(host.code, n, P("pink"))));
      expect(rs.map((r) => r.status).sort()).toEqual([201, 409, 409]);
    });

    it("setProfile: taken colour refused, own colour kept, a free swap works, left frees it", async () => {
      const host = await make("teal");
      const g = (await (await join(host.code, "Bo", P("pink"))).json()) as AuthRes;
      const c = await connect(host.code, host.token);
      await c.until(() => c.view().seats.length === 2);
      c.send({ type: "profile", profile: P("pink") });
      expect((await c.next("error")).code).toBe("E_COLOUR_TAKEN");
      c.send({ type: "profile", profile: { color: "teal", cat: "cat-gif" } });
      await c.until(() => c.view().seats[0]?.profile?.cat === "cat-gif");
      c.send({ type: "profile", profile: P("sky") });
      await c.until(() => c.view().seats[0]?.profile?.color === "sky");
      // Bo leaves; pink is free again.
      await api("POST", `/api/games/${host.code}/leave`, { token: g.token });
      expect((await join(host.code, "Cy", P("pink"))).status).toBe(201);
    });

    it("reclaim in the lobby cannot take another seat's colour", async () => {
      const host = await make("teal");
      await join(host.code, "Bo", P("pink"));
      const r = await api("POST", `/api/games/${host.code}/reclaim`, {
        body: { name: "Ann", password: PASSWORD, profile: P("pink") },
      });
      expect(r.status).toBe(409);
      expect(((await r.json()) as { code: string }).code).toBe("E_COLOUR_TAKEN");
      const same = await api("POST", `/api/games/${host.code}/reclaim`, {
        body: { name: "Ann", password: PASSWORD, profile: P("teal") },
      });
      expect(same.status).toBe(200);
    });
  });
});
