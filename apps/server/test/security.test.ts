/// <reference types="@cloudflare/vitest-plugin/types" />
/** Security checklist evidence (docs/ARCHITECTURE.md#security) not covered elsewhere. */
import { describe, expect, it, vi } from "vitest";
import { connectAll, createRoom, startGame } from "./helpers/client";

describe("game socket validation and authority", () => {
  it("unknown fields and malformed commands → E_INVALID_COMMAND, state unchanged", async () => {
    const room = await createRoom(2);
    await startGame(room);
    const [a] = await connectAll(room);
    const c = a as NonNullable<typeof a>;
    const v0 = c.view();
    const turn = v0.game?.turn?.number as number;
    c.send({ type: "roll", turn, extra: 1 });
    c.send({ type: "roll", turn: "1" });
    c.send({ type: "action1", turn, kind: "MARK", color: "PURPLE" });
    await c.until(() => c.frames.filter((f) => f.type === "error").length >= 3);
    const errs = c.frames.filter((f) => f.type === "error");
    expect(errs.every((e) => e.code === "E_INVALID_COMMAND")).toBe(true);
    expect(c.view().version).toBe(v0.version);
  });

  it("setAway no longer exists (T-NEW-3): it is an invalid command", async () => {
    const room = await createRoom(2);
    await startGame(room);
    const conns = await connectAll(room);
    const guest = conns[1] as NonNullable<(typeof conns)[1]>;
    const hostSeat = room.players[0]?.seatId as string;
    const v0 = guest.view().version;
    guest.send({ type: "setAway", seatId: hostSeat, away: true });
    const e = await guest.until(() => guest.frames.find((f) => f.type === "error"));
    expect(e.code).toBe("E_INVALID_COMMAND");
    expect(guest.view().version).toBe(v0);
  });
});

describe("chat privacy", () => {
  it("chat text is never written to the logs", async () => {
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((m) =>
      vi.spyOn(console, m).mockImplementation(() => {}),
    );
    try {
      const room = await createRoom(2);
      await startGame(room);
      const [a, b] = await connectAll(room);
      const sender = a as NonNullable<typeof a>;
      const rcv = b as NonNullable<typeof b>;
      sender.send({ type: "chat", text: "SECRET-CHAT-MARKER" });
      sender.send({ type: "chat", text: "x".repeat(500) });
      await rcv.until(() => rcv.frames.find((f) => f.type === "chat"));
      await sender.until(() => sender.frames.find((f) => f.type === "error"));
      const logged = spies.flatMap((s) => s.mock.calls).map((c) => JSON.stringify(c));
      expect(logged.join("\n")).not.toContain("SECRET-CHAT-MARKER");
      expect(logged.join("\n")).not.toContain("xxxxxxxxxx");
    } finally {
      for (const s of spies) s.mockRestore();
    }
  });
});
