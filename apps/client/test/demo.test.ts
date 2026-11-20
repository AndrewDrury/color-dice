import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDemoView, DEMO_CODE, exitDemo, startDemo } from "../src/demo";
import { _resetDemoStoreForTests, getDemoState } from "../src/demo-store";
import { navigate } from "../src/router";
import { _resetStoreForTests, clearView, getState } from "../src/store";

beforeEach(() => {
  history.replaceState(null, "", "/");
  navigate("home");
  clearView();
  _resetStoreForTests();
  _resetDemoStoreForTests();
});

describe("demo mode", () => {
  it("creates an in-memory synthetic view without a real room code", () => {
    startDemo("turn");
    expect(DEMO_CODE).toBe("DEMO");
    expect(DEMO_CODE).not.toMatch(/^[A-Z0-9]{5}$/);
    expect(getDemoState()).toEqual({ active: true, scenario: "turn" });
    expect(getState().view?.code).toBe(DEMO_CODE);
  });

  it("does not call room APIs or mutate real sessions", async () => {
    const api = await import("../src/api");
    const createSpy = vi.spyOn(api, "createGame");
    startDemo();
    expect(createSpy).not.toHaveBeenCalled();
  });

  it("provides synthetic views for existing game components", () => {
    expect(createDemoView("roll").room.status).toBe("playing");
    expect(createDemoView("roll").game?.phase).toBe("AWAIT_ROLL");
    expect(createDemoView("turn").game?.phase).toBe("ACTION_1");
    expect(createDemoView("game-over").game?.phase).toBe("GAME_OVER");
  });

  it("exit clears demo state and the in-memory view", () => {
    startDemo();
    exitDemo();
    expect(getDemoState().active).toBe(false);
    expect(getState().view).toBeNull();
  });
});
