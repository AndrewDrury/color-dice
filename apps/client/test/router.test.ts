import { beforeEach, describe, expect, it } from "vitest";
import { getRoute, initialRoute, navigate, readGameCode } from "../src/router";
import { _resetMemoryForTests, saveSession } from "../src/session";
import { CODE, SEAT, TOKEN } from "./fixtures";

beforeEach(() => {
  localStorage.clear();
  _resetMemoryForTests();
  history.replaceState(null, "", "/qwixx/");
});

describe("router", () => {
  it("reads and validates ?game=", () => {
    expect(readGameCode(`?game=${CODE.toLowerCase()}`)).toBe(CODE);
    expect(readGameCode("?game=<script>")).toBeNull();
    expect(readGameCode("")).toBeNull();
  });

  it("picks the first screen", () => {
    expect(initialRoute("")).toEqual({ screen: "home", code: null });
    expect(initialRoute(`?game=${CODE}`)).toEqual({ screen: "join", code: CODE });
    saveSession(CODE, { token: TOKEN, seatId: SEAT, name: "A", roomName: "Room" });
    expect(initialRoute(`?game=${CODE}`)).toEqual({ screen: "waiting", code: CODE });
  });

  it("keeps the URL in sync and keeps the base path", () => {
    navigate("waiting", CODE);
    expect(location.pathname).toBe("/qwixx/");
    expect(location.search).toBe(`?game=${CODE}`);
    navigate("home");
    expect(location.search).toBe("");
    navigate("game", "bad");
    expect(getRoute()).toEqual({ screen: "home", code: null });
  });
});
