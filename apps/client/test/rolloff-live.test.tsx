import type { ViewMessage } from "@cd/protocol";
import { cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RollOffLive } from "../src/components/RollOff";
import { CODE, makeGameView } from "./fixtures/views";

afterEach(cleanup);

function liveView(rolled: boolean[], mySeat: number, completed: number[][] = []): ViewMessage {
  const base = makeGameView({});
  return {
    ...base,
    game: null,
    rollOff: { round: completed.length + 1, rolled, completed },
    you: { ...base.you, seat: mySeat },
  } as ViewMessage;
}

describe("RollOffLive (T-NEW-2)", () => {
  it("shows my Roll button, sends the current round, never a face", () => {
    const send = vi.fn(() => true);
    render(<RollOffLive view={liveView([false, false], 1, [[1, 2]])} send={send} />);
    fireEvent.click(screen.getByTestId("rolloff-roll"));
    expect(send).toHaveBeenCalledWith({ type: "rollOff", round: 2 });
    expect(screen.getAllByTestId("rolloff-round")).toHaveLength(1);
  });

  it("hides Roll once I have rolled and says who we're waiting for", () => {
    render(<RollOffLive view={liveView([false, true], 1)} send={() => true} />);
    expect(screen.queryByTestId("rolloff-roll")).toBeNull();
    expect(screen.getByTestId("rolloff-current").textContent).toContain("Waiting for");
    expect(CODE).toBeTruthy();
  });
});
