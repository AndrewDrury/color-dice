import {
  DEFAULT_PROFILE_CAT,
  PROFILE_COLORS,
  type ProfileColor,
  type ServerMessage,
  type ViewMessage,
} from "@cd/protocol";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseChatFrame } from "../src/chat/parse";
import { REACTION_MOOD_ORDER } from "../src/components/CatReaction";
import { _resetPrefsForTests, setPrefs } from "../src/prefs";
import { Game } from "../src/screens/Game";
import { _resetMemoryForTests, saveSession } from "../src/session";
import { _resetStoreForTests, applyView, getState } from "../src/store";
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
const withProfiles = (v: ViewMessage): ViewMessage => ({
  ...v,
  seats: v.seats.map((s, i) => ({
    ...s,
    profile: {
      color: PROFILE_COLORS[i % PROFILE_COLORS.length] as ProfileColor,
      cat: DEFAULT_PROFILE_CAT,
    },
  })),
});
const toasts = () => Array.from(document.querySelectorAll(".chat-toast"));
const openChat = async () => {
  fireEvent.click(screen.getByLabelText(/^Open chat/));
  await screen.findByRole("log");
};
const box = () => screen.getByLabelText("Message") as HTMLTextAreaElement;

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
  show(withProfiles(makeGameView({ legal1: ["RED"] })));
  render(<Game code={CODE} />);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("chat client", () => {
  it("uses the generic cat-face icon for reaction send buttons", async () => {
    const top = screen.getAllByLabelText("Send reaction")[0] as HTMLElement;
    expect(top.querySelector("svg.icon")).not.toBeNull();
    expect(top.querySelector("img")).toBeNull();
    await openChat();
    const inChat = screen.getAllByLabelText("Send reaction").at(-1) as HTMLElement;
    expect(inChat.querySelector("svg.icon")).not.toBeNull();
    expect(inChat.querySelector("img")).toBeNull();
  });

  it("incoming text toasts as avatar + bubble without the sender name; opening clears the badge", async () => {
    emit(text(1, "hello there"));
    expect(toasts()[0]?.textContent).toBe("hello there");
    expect(toasts()[0]?.querySelector(".av")).not.toBeNull();
    expect(screen.getByLabelText("Open chat, 1 unread")).toBeTruthy();
    expect(screen.getByTestId("chat-live").textContent).toMatch(/says: hello there$/);
    await openChat();
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

  it("renders markup as literal text", async () => {
    emit(text(1, "<img src=x onerror=alert(1)>"));
    await openChat();
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
    await openChat();
    expect(screen.getByRole("log")).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(document.querySelector(".bs-sheet.is-leaving")).not.toBeNull();
    await waitFor(() => expect(screen.queryByRole("log")).toBeNull());
  });

  it("Enter sends chat and the text is shown only after the echo", async () => {
    await openChat();
    fireEvent.input(box(), { target: { value: "gg" } });
    fireEvent.keyDown(box(), { key: "Enter" });
    expect(sent).toEqual([{ type: "chat", text: "gg" }]);
    expect(screen.getByRole("log").textContent).not.toContain("gg");
    emit(text(0, "gg"));
    expect(screen.getByRole("log").textContent).toContain("gg");
    expect(box().value).toBe("");
  });

  it("Shift+Enter does not send (it inserts a newline)", async () => {
    await openChat();
    fireEvent.input(box(), { target: { value: "a" } });
    const notPrevented = fireEvent.keyDown(box(), { key: "Enter", shiftKey: true });
    expect(notPrevented).toBe(true);
    expect(sent).toEqual([]);
  });

  it("focuses the textarea as soon as the panel opens and returns focus to the Chat button on close", async () => {
    const btn = screen.getByLabelText(/^Open chat/) as HTMLElement;
    btn.focus();
    await openChat();
    expect(document.activeElement).toBe(box());
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("log")).toBeNull());
    expect(document.activeElement).toBe(btn);
  });

  it("auto-grows to the content height, capped at 6 lines, then scrolls", async () => {
    await openChat();
    const el = box();
    Object.defineProperty(el, "scrollHeight", { configurable: true, value: 60 });
    fireEvent.input(el, { target: { value: "a\nb\nc" } });
    expect(el.style.height).toBe("60px");
    expect(el.style.overflowY).toBe("hidden");
    Object.defineProperty(el, "scrollHeight", { configurable: true, value: 900 });
    fireEvent.input(el, { target: { value: "a\nb\nc\nd" } });
    expect(Number.parseFloat(el.style.height)).toBeLessThan(900);
    expect(el.style.overflowY).toBe("auto");
  });

  it("accepts 500 code points, clips the 501st, and shows the counter only near the limit", async () => {
    await openChat();
    expect(document.querySelector(".chat-count")).toBeNull();
    fireEvent.input(box(), { target: { value: "😀".repeat(500) } });
    expect([...box().value]).toHaveLength(500);
    expect(document.querySelector(".chat-count")?.textContent).toBe("500/500");
    fireEvent.input(box(), { target: { value: "😀".repeat(501) } });
    expect([...box().value]).toHaveLength(500);
    fireEvent.keyDown(box(), { key: "Enter" });
    expect(sent).toHaveLength(1);
  });

  it("send is disabled for blank text and the draft survives closing", async () => {
    await openChat();
    const send = screen.getByLabelText("Send") as HTMLButtonElement;
    expect(send.disabled).toBe(true);
    fireEvent.input(box(), { target: { value: "keep me" } });
    expect(send.disabled).toBe(false);
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("log")).toBeNull());
    await openChat();
    expect(box().value).toBe("keep me");
  });

  it("mine on the right, others on the left, grouped avatars, no visible names, sr-only names", async () => {
    emit(text(1, "hi from them"));
    emit(text(1, "second"));
    emit(text(0, "mine"));
    emit(reaction(1));
    await openChat();
    const rows = Array.from(document.querySelectorAll(".chat-row"));
    expect(rows.map((r) => r.classList.contains("is-mine"))).toEqual([false, false, true, false]);
    expect(rows.map((r) => r.classList.contains("is-other"))).toEqual([true, true, false, true]);
    // Avatar only on the last bubble of a run.
    expect(rows.map((r) => r.querySelector(".av") !== null)).toEqual([false, true, true, true]);
    expect(rows[0]?.classList.contains("is-first")).toBe(true);
    expect(rows[1]?.classList.contains("is-last")).toBe(true);
    // Reaction renders as a media bubble.
    expect(rows[3]?.querySelector(".chat-b-media")).not.toBeNull();
    // Names exist only in sr-only spans.
    const names = ["Andrew", ...(getState().view?.seats.map((s) => s.name) ?? [])];
    const log = screen.getByRole("log");
    const clone = log.cloneNode(true) as HTMLElement;
    for (const n of clone.querySelectorAll(".sr-only")) n.remove();
    for (const n of names) expect(clone.textContent).not.toContain(n);
    expect(log.querySelectorAll(".sr-only").length).toBe(4);
    expect(log.querySelector(".sr-only")?.textContent).toMatch(/ says:/);
  });

  it("chat panel sends a reaction GIF from the in-chat picker", async () => {
    await openChat();
    fireEvent.click(screen.getAllByLabelText("Send reaction").at(-1) as HTMLElement);
    fireEvent.click(screen.getByLabelText("React mad the internet"));
    expect(sent).toEqual([{ type: "react", emoji: "mad-the-internet-gif-by-moodman" }]);
  });

  it("showChat=false: no toast, badge or float from others; panel still lists messages", async () => {
    setPrefs({ showChat: false });
    emit(text(1, "quiet"));
    emit(reaction(1));
    expect(toasts()).toHaveLength(0);
    expect(document.querySelectorAll(".rx-float")).toHaveLength(0);
    expect(screen.getByLabelText("Open chat")).toBeTruthy();
    await openChat();
    expect(screen.getByRole("log").textContent).toContain("quiet");
  });

  it("E_RATE_LIMITED for chat shows a friendly message and keeps the draft", async () => {
    await openChat();
    fireEvent.input(box(), { target: { value: "spam" } });
    fireEvent.keyDown(box(), { key: "Enter" });
    emit({ type: "error", code: "E_RATE_LIMITED", command: "chat" });
    expect(screen.getByText("Slow down a little.")).toBeTruthy();
    expect(box().value).toBe("spam");
  });

  it("game shortcuts are ignored while the chat input has focus", async () => {
    cleanup();
    _resetStoreForTests();
    show(makeGameView({ phase: "AWAIT_ROLL", canRoll: true, active: 0, version: 9 }));
    render(<Game code={CODE} />);
    await openChat();
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

  it("counts code points: 500 emoji pass (1000 UTF-16 units), 501 fail", () => {
    const f = (text: string) =>
      parseChatFrame(
        JSON.stringify({ type: "chat", id: 1, seatId: "a", kind: "text", text, at: 1 }),
      );
    expect(f("😀".repeat(500))?.type).toBe("chat");
    expect(f("😀".repeat(501))).toBeNull();
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

describe("bubble contrast", () => {
  it("every profile colour keeps >= 4.5:1 between its bubble and its text colour", async () => {
    const { contrastRatio } = await import("../src/styles/contrast");
    const av = (await import("../src/styles/avatar.css?raw")).default;
    const css = (await import("../src/styles/chat.css?raw")).default;
    const colors = [...av.matchAll(/\.pc-(\w+) \{\s*--pc: (#[0-9a-f]{6})/g)];
    expect(colors).toHaveLength(10);
    for (const [, name, hex] of colors) {
      const own = css.match(
        new RegExp(`\\.chat-row\\.pc-${name}[^{]*\\{\\s*--bub-ink: (#[0-9a-f]{3,6})`),
      );
      const ink = own?.[1] ?? "#111";
      const full =
        ink.length === 4 ? `#${ink[1]}${ink[1]}${ink[2]}${ink[2]}${ink[3]}${ink[3]}` : ink;
      // Bubble colours are theme-independent (themes only restyle the surrounding paper).
      expect(contrastRatio(full, hex as string), `${name} ${ink}`).toBeGreaterThanOrEqual(4.5);
    }
  });
});
