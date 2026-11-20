import type { ServerMessage, ViewMessage } from "@cd/protocol";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseChatFrame } from "../src/chat/parse";
import { REACTION_MOOD_ORDER } from "../src/components/CatReaction";
import { _resetPrefsForTests, setPrefs } from "../src/prefs";
import { Game } from "../src/screens/Game";
import { _resetMemoryForTests, saveSession } from "../src/session";
import { _resetStoreForTests, applyView } from "../src/store";
import { TOKEN } from "./fixtures";
import { CODE, makeGameView, seatIdOf } from "./fixtures/views";

const { sent, emitters, FakeSocket } = vi.hoisted(() => {
  const sent: unknown[] = [];
  const emitters = new Set<(m: unknown) => void>();
  class FakeSocket {
    connect() {}
    close() {}
    send(m: unknown) {
      sent.push(m);
      return true;
    }
    onMessage(cb: (m: unknown) => void) {
      emitters.add(cb);
      return () => emitters.delete(cb);
    }
    onStatus() {
      return () => {};
    }
  }
  return { sent, emitters, FakeSocket };
});
vi.mock("../src/ws", () => ({ GameSocket: FakeSocket, LobbySocket: FakeSocket }));

let nextId = 1;
const emit = (m: ServerMessage) =>
  act(() => {
    for (const cb of emitters) cb(m);
  });
const text = (seat: number, t: string, id = nextId++): ServerMessage => ({
  type: "chat",
  id,
  seatId: seatIdOf(seat),
  kind: "text",
  text: t,
  at: 1,
});
const reaction = (seat: number, id = nextId++): ServerMessage => ({
  type: "chat",
  id,
  seatId: seatIdOf(seat),
  kind: "reaction",
  emoji: "mad-the-internet-gif-by-moodman",
  at: 1,
});

function show(v: ViewMessage) {
  act(() => {
    applyView(v);
  });
}
const toasts = () => Array.from(document.querySelectorAll(".chat-toast"));
const openChat = () => fireEvent.click(screen.getByLabelText(/^Open chat/));

beforeEach(() => {
  sent.length = 0;
  nextId = 1;
  localStorage.clear();
  _resetMemoryForTests();
  _resetStoreForTests();
  _resetPrefsForTests();
  setPrefs({ sound: false, haptics: false, motion: "full" });
  saveSession(CODE, { token: TOKEN, seatId: seatIdOf(0), name: "Andrew", roomName: "Friday dice" });
  Object.defineProperty(window, "innerWidth", { value: 390, configurable: true, writable: true });
  show(makeGameView({ legal1: ["RED"] }));
  render(<Game code={CODE} />);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("chat client", () => {
  it("incoming text toasts `Name: text`, bumps the badge; opening clears it", () => {
    emit(text(1, "hello there"));
    expect(toasts()[0]?.textContent).toMatch(/^.+: hello there$/);
    expect(screen.getByLabelText("Open chat, 1 unread")).toBeTruthy();
    expect(screen.getByTestId("chat-live").textContent).toMatch(/says: hello there$/);
    openChat();
    expect(screen.getByLabelText("Open chat")).toBeTruthy();
    expect(screen.getByRole("log").textContent).toContain("hello there");
  });

  it("toasts ignore pointer events, vanish after 4 s, max 2", () => {
    vi.useFakeTimers();
    emit(text(1, "one"));
    emit(text(2, "two"));
    emit(text(1, "three"));
    expect(toasts().map((t) => t.textContent)).toHaveLength(2);
    act(() => {
      vi.advanceTimersByTime(4100);
    });
    expect(toasts()).toHaveLength(0);
  });

  it("pointer-events: none is set in chat.css for toasts and floats", async () => {
    const css = (await import("../src/styles/chat.css?raw")).default;
    expect(css).toMatch(/\.chat-toasts \{[^}]*pointer-events: none/);
    expect(css).toMatch(/\.chat-toast \{[^}]*pointer-events: none/);
    expect(css).toMatch(/\.rx-layer \{[^}]*pointer-events: none/);
  });

  it("renders markup as literal text", () => {
    emit(text(1, "<img src=x onerror=alert(1)>"));
    openChat();
    expect(document.querySelector("img[src='x']")).toBeNull();
    expect(screen.getByRole("log").textContent).toContain("<img src=x onerror=alert(1)>");
  });

  it("picker sends the tapped cat id and closes after its exit animation", async () => {
    fireEvent.click(screen.getAllByLabelText("Send reaction")[0] as HTMLElement);
    // Accessible name is the translated caption, never the raw id.
    expect(screen.queryByLabelText(/cat_/)).toBeNull();
    fireEvent.click(screen.getByLabelText("React dancing cat"));
    expect(sent).toEqual([{ type: "react", emoji: "cat-dancing-gif-by-unscreen" }]);
    // The node stays mounted while it animates out, then goes away.
    expect(document.querySelector(".rx-picker.mo-exit")).not.toBeNull();
    await waitFor(() => expect(screen.queryByRole("group", { name: "Reactions" })).toBeNull());
  });

  it("every picker button sends its own id", () => {
    fireEvent.click(screen.getByLabelText("Send reaction"));
    const ids = REACTION_MOOD_ORDER;
    expect(document.querySelectorAll(".rx-pick")).toHaveLength(ids.length);
    for (const b of document.querySelectorAll(".rx-pick")) fireEvent.click(b);
    expect(sent.map((m) => (m as { emoji: string }).emoji)).toEqual(ids);
  });

  it("Esc closes the picker", async () => {
    fireEvent.click(screen.getByLabelText("Send reaction"));
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("group", { name: "Reactions" })).toBeNull());
  });

  it("a reaction float lives 3.5 s with its caption, then is removed", () => {
    vi.useFakeTimers();
    emit(reaction(1));
    expect(document.querySelector(".rx-float .cat-cap")?.textContent).toBe("mad the internet");
    act(() => {
      vi.advanceTimersByTime(3400);
    });
    expect(document.querySelectorAll(".rx-float")).toHaveLength(1);
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(document.querySelectorAll(".rx-float")).toHaveLength(0);
  });

  it("the chat panel stays mounted while it animates out", async () => {
    openChat();
    expect(screen.getByRole("log")).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(document.querySelector(".bs-sheet.is-leaving")).not.toBeNull();
    await waitFor(() => expect(screen.queryByRole("log")).toBeNull());
  });

  it("chat.css fades the log and releases the mask on hover and focus", async () => {
    const css = (await import("../src/styles/chat.css?raw")).default;
    expect(css).toMatch(/\.chat-log \{[^}]*mask-image: linear-gradient/);
    expect(css).toMatch(/\.chat-panel:hover \.chat-log,[^{]*\.chat-panel:focus-within \.chat-log/);
  });

  it("Enter sends chat and the text is shown only after the echo", () => {
    openChat();
    const input = screen.getByLabelText("Message") as HTMLInputElement;
    fireEvent.input(input, { target: { value: "gg" } });
    fireEvent.submit(input.closest("form") as HTMLFormElement);
    expect(sent).toEqual([{ type: "chat", text: "gg" }]);
    expect(screen.getByRole("log").textContent).not.toContain("gg");
    emit(text(0, "gg"));
    expect(screen.getByRole("log").textContent).toContain("gg");
    expect((screen.getByLabelText("Message") as HTMLInputElement).value).toBe("");
  });

  it("chat panel sends a reaction GIF from the in-chat picker", () => {
    openChat();
    fireEvent.click(screen.getAllByLabelText("Send reaction").at(-1) as HTMLElement);
    fireEvent.click(screen.getByLabelText("React mad the internet"));
    expect(sent).toEqual([{ type: "react", emoji: "mad-the-internet-gif-by-moodman" }]);
  });

  it("showChat=false: no toast, badge or float from others; panel still lists messages", () => {
    setPrefs({ showChat: false });
    emit(text(1, "quiet"));
    emit(reaction(1));
    expect(toasts()).toHaveLength(0);
    expect(document.querySelectorAll(".rx-float")).toHaveLength(0);
    expect(screen.getByLabelText("Open chat")).toBeTruthy();
    openChat();
    expect(screen.getByRole("log").textContent).toContain("quiet");
  });

  it("E_RATE_LIMITED for chat shows a friendly message and keeps the draft", () => {
    openChat();
    const input = screen.getByLabelText("Message") as HTMLInputElement;
    fireEvent.input(input, { target: { value: "spam" } });
    fireEvent.submit(input.closest("form") as HTMLFormElement);
    emit({ type: "error", code: "E_RATE_LIMITED", command: "chat" });
    expect(screen.getByText("Slow down a little.")).toBeTruthy();
    expect((screen.getByLabelText("Message") as HTMLInputElement).value).toBe("spam");
  });

  it("game shortcuts are ignored while the chat input has focus", () => {
    cleanup();
    _resetStoreForTests();
    show(makeGameView({ phase: "AWAIT_ROLL", canRoll: true, active: 0, version: 9 }));
    render(<Game code={CODE} />);
    openChat();
    const input = screen.getByLabelText("Message");
    input.focus();
    fireEvent.keyDown(input, { key: " " });
    expect(sent.find((m) => (m as { type: string }).type === "roll")).toBeUndefined();
  });

  it("reaction floats are static under reduced motion", () => {
    setPrefs({ motion: "reduced" });
    emit(reaction(1));
    const f = document.querySelector(".rx-float");
    expect(f?.classList.contains("is-static")).toBe(true);
  });

  it("reaction floats animate with full motion and de-dupe by id", () => {
    emit(reaction(1, 50));
    emit(reaction(1, 50));
    expect(document.querySelectorAll(".rx-float")).toHaveLength(1);
    expect(document.querySelector(".rx-float.is-static")).toBeNull();
  });
});

describe("parseChatFrame", () => {
  it("accepts well-formed frames and rejects malformed ones", () => {
    const ok = JSON.stringify({
      type: "chat",
      id: 1,
      seatId: "a",
      kind: "text",
      text: "hi",
      at: 1,
    });
    expect(parseChatFrame(ok)?.type).toBe("chat");
    expect(
      parseChatFrame(
        JSON.stringify({ type: "chat", id: 1, seatId: "a", kind: "reaction", emoji: "x", at: 1 }),
      ),
    ).toBeNull();
    expect(parseChatFrame(JSON.stringify({ type: "chatHistory", messages: "x" }))).toBeNull();
    expect(
      parseChatFrame(JSON.stringify({ type: "error", code: "E_RATE_LIMITED", command: "react" }))
        ?.type,
    ).toBe("error");
    expect(parseChatFrame("nope")).toBeNull();
  });

  it("counts code points: 200 emoji pass (400 UTF-16 units), 201 fail", () => {
    const f = (text: string) =>
      parseChatFrame(
        JSON.stringify({ type: "chat", id: 1, seatId: "a", kind: "text", text, at: 1 }),
      );
    expect(f("😀".repeat(200))?.type).toBe("chat");
    expect(f("😀".repeat(201))).toBeNull();
  });

  it("chatHistory drops only the invalid entry", () => {
    const good = (id: number) => ({ id, seatId: "a", kind: "text", text: "hi", at: 1 });
    const m = parseChatFrame(
      JSON.stringify({ type: "chatHistory", messages: [good(1), { bad: true }, good(3)] }),
    );
    expect(m?.type).toBe("chatHistory");
    expect(m?.type === "chatHistory" && m.messages.map((e) => e.id)).toEqual([1, 3]);
  });
});
