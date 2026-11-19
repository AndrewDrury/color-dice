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
});
