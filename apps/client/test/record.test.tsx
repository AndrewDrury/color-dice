import { cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SeatList } from "../src/components/SeatList";
import { Settings } from "../src/components/Settings";
import {
  _resetHistoryForTests,
  exportTransferCode,
  getHistory,
  HISTORY_CAP,
  HISTORY_KEY,
  historyTotals,
  importTransferCode,
  recordGame,
  sanitizeHistory,
} from "../src/history";
import { GameOver } from "../src/screens/GameOver";
import { CODE, makeGameView, player } from "./fixtures/views";

beforeEach(() => {
  localStorage.clear();
  _resetHistoryForTests();
});
afterEach(cleanup);

const rec = (wins: number, ties: number, losses: number) => ({
  wins,
  ties,
  losses,
});

describe("SeatList record", () => {
  const seats = () => makeGameView({ players: 2 }).seats;

  it("is hidden while every seat is 0-0", () => {
    const { container } = render(<SeatList seats={seats()} youSeatId={null} isHost={false} />);
    expect(container.querySelector("[data-record]")).toBeNull();
  });

  it("shows W-L for every seat once anyone has played", () => {
    const s = seats();
    s[0] = { ...(s[0] as (typeof s)[number]), record: rec(3, 1, 0) };
    const { container } = render(<SeatList seats={s} youSeatId={null} isHost={false} />);
    const shown = [...container.querySelectorAll("[data-record]")].map((e) => e.textContent);
    expect(shown).toEqual(["3–1–0", "0–0–0"]);
  });
});

describe("GameOver record column and device history", () => {
  function over(seatRecords: Array<{ wins: number; ties: number; losses: number }>) {
    const v = makeGameView({
      players: 2,
      phase: "GAME_OVER",
      winners: ["seat-1"],
      gamePlayers: [player(0), player(1)],
    });
    v.seats = v.seats.map((s, i) => ({
      ...s,
      record: seatRecords[i] as { wins: number; ties: number; losses: number },
    }));
    return v;
  }
  const mount = (v: ReturnType<typeof over>) =>
    render(
      <GameOver
        view={v}
        rematchBusy={false}
        send={() => true}
        onRematch={() => {}}
        onHome={() => {}}
      />,
    );

  it("renders the Record column and logs the game once", () => {
    const v = over([rec(0, 0, 2), rec(2, 0, 0)]);
    const { container, unmount } = mount(v);
    expect(screen.getByRole("columnheader", { name: "Record" })).toBeTruthy();
    const cells = [...container.querySelectorAll("td[data-record]")].map((c) => c.textContent);
    expect(cells.sort()).toEqual(["0–0–2", "2–0–0"]);
    expect(getHistory()).toHaveLength(1);
    expect(getHistory()[0]).toMatchObject({ code: CODE, game: 2, result: "L" });
    unmount();
    mount(v); // reload at game over: same game number, no duplicate
    expect(getHistory()).toHaveLength(1);
    expect(historyTotals()).toEqual({ wins: 0, ties: 0, losses: 1 });
  });
});

describe("device history storage", () => {
  it("loads legacy boolean-won entries as W / L", () => {
    localStorage.setItem(
      HISTORY_KEY,
      JSON.stringify([
        { code: CODE, game: 1, won: true, at: 1 },
        { code: CODE, game: 2, won: false, at: 2 },
      ]),
    );
    expect(historyTotals()).toEqual({ wins: 1, ties: 0, losses: 1 });
  });

  it("dedupes by code + game and caps at 200 (newest kept)", () => {
    recordGame({ code: CODE, game: 1, result: "W", at: 1 });
    recordGame({ code: CODE, game: 1, result: "L", at: 2 });
    expect(getHistory()).toHaveLength(1);
    for (let i = 2; i < HISTORY_CAP + 50; i++)
      recordGame({ code: CODE, game: i, result: "W", at: i });
    const h = getHistory();
    expect(h).toHaveLength(HISTORY_CAP);
    expect(h.at(-1)?.game).toBe(HISTORY_CAP + 49);
    expect(JSON.parse(localStorage.getItem(HISTORY_KEY) as string)).toHaveLength(HISTORY_CAP);
  });

  it("ignores corrupt storage and drops malformed entries", () => {
    localStorage.setItem(HISTORY_KEY, "{not json");
    expect(getHistory()).toEqual([]);
    _resetHistoryForTests();
    localStorage.setItem(
      HISTORY_KEY,
      JSON.stringify([
        { code: CODE, game: 1, won: true, at: 5 },
        { code: CODE, game: 1, won: false, at: 6 },
        { code: "bad!", game: 1, won: true, at: 1 },
        { code: CODE, game: -3, won: true, at: 1 },
        { code: CODE, game: 2, won: "yes", at: 1 },
        { code: CODE, game: 3, won: true, at: Number.NaN },
        "junk",
        null,
        { code: CODE, game: 4, won: false, at: 9, extra: "<script>" },
      ]),
    );
    expect(getHistory()).toEqual([
      { code: CODE, game: 1, result: "W", at: 5 },
      { code: CODE, game: 4, result: "L", at: 9 },
    ]);
    expect(sanitizeHistory({ not: "array" })).toEqual([]);
    expect(
      sanitizeHistory(
        Array.from({ length: 500 }, (_, i) => ({ code: CODE, game: i + 1, won: true, at: i })),
      ),
    ).toHaveLength(HISTORY_CAP);
  });

  it("Settings shows the record with a reset", () => {
    recordGame({ code: CODE, game: 1, result: "W", at: 1 });
    recordGame({ code: CODE, game: 2, result: "L", at: 2 });
    render(<Settings onClose={vi.fn()} onPanel={vi.fn()} />);
    expect(screen.getByText(/Your record: 1 W – 0 T – 1 L/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Reset record" }));
    expect(getHistory()).toEqual([]);
    expect(screen.getByText(/Your record: 0 W – 0 T – 0 L/)).toBeTruthy();
  });
});

describe("transfer code", () => {
  const seed = (n: number, from = 1) => {
    for (let i = from; i < from + n; i++)
      recordGame({
        code: CODE,
        game: i,
        result: i % 2 === 0 ? "W" : "L",
        at: i,
      });
  };

  it("round-trips into an empty store", () => {
    seed(5);
    const code = exportTransferCode();
    expect(code).toMatch(/^CD2\.[A-Za-z0-9_-]+$/);
    const before = historyTotals();
    localStorage.clear();
    _resetHistoryForTests();
    expect(importTransferCode(code)).toEqual({ ok: true, added: 5 });
    expect(historyTotals()).toEqual(before);
  });

  it("round-trips ties (CD2)", () => {
    recordGame({ code: CODE, game: 1, result: "W", at: 1 });
    recordGame({ code: CODE, game: 2, result: "T", at: 2 });
    recordGame({ code: CODE, game: 3, result: "L", at: 3 });
    const code = exportTransferCode();
    localStorage.clear();
    _resetHistoryForTests();
    expect(importTransferCode(code)).toEqual({ ok: true, added: 3 });
    expect(historyTotals()).toEqual({ wins: 1, ties: 1, losses: 1 });
  });

  it("still imports a legacy CD1 code (won -> W, lost -> L)", () => {
    const rows = [
      [CODE, 1, 1, 10],
      [CODE, 2, 0, 20],
    ];
    const b64 = btoa(JSON.stringify(rows))
      .replaceAll("+", "-")
      .replaceAll("/", "_")
      .replaceAll("=", "");
    expect(importTransferCode(`CD1.${b64}`)).toEqual({ ok: true, added: 2 });
    expect(getHistory().map((e) => e.result)).toEqual(["W", "L"]);
  });

  it("merges and never double-counts", () => {
    seed(3);
    const a = exportTransferCode();
    localStorage.clear();
    _resetHistoryForTests();
    seed(3, 2); // games 2..4: overlaps on 2 and 3
    expect(importTransferCode(a)).toEqual({ ok: true, added: 1 });
    expect(importTransferCode(a)).toEqual({ ok: true, added: 0 });
    expect(getHistory()).toHaveLength(4);
  });

  it("ignores garbage and oversized input without throwing", () => {
    seed(2);
    const base = getHistory();
    const bad = [
      "",
      "hello",
      "CD1.",
      "CD1.!!!",
      `CD1.${"A".repeat(50_000)}`,
      `CD1.${btoa("{}")}`,
      `CD1.${btoa(JSON.stringify([["toolongcode-0123456789", 1, 1, 1], ["K7QF2", 1, 2, 1], "x"]))}`,
    ];
    for (const b of bad) expect(importTransferCode(b).ok).toBe(false);
    expect(importTransferCode(undefined as unknown as string).ok).toBe(false);
    expect(getHistory()).toEqual(base);
  });

  it("Settings imports, shows a text message, and reset clears", () => {
    seed(2);
    const code = exportTransferCode();
    localStorage.clear();
    _resetHistoryForTests();
    render(<Settings onClose={vi.fn()} onPanel={vi.fn()} />);
    fireEvent.input(screen.getByLabelText("Import transfer code"), { target: { value: code } });
    fireEvent.click(screen.getByRole("button", { name: "Import" }));
    expect(screen.getByRole("status").textContent).toBe("Imported 2 new games.");
    fireEvent.input(screen.getByLabelText("Import transfer code"), {
      target: { value: "<b>x</b>" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Import" }));
    expect(screen.getByRole("status").textContent).toBe("That is not a valid transfer code.");
    fireEvent.click(screen.getByRole("button", { name: "Reset record" }));
    expect(getHistory()).toEqual([]);
  });
});

describe("GameOver ties", () => {
  function tied(n: number, winners: number[], totals: number[], names?: string[]) {
    const v = makeGameView({
      players: n,
      phase: "GAME_OVER",
      winners: winners.map((i) => `seat-${i}`),
      gamePlayers: Array.from({ length: n }, (_, i) => player(i)),
    });
    v.seats = v.seats.map((s, i) => ({
      ...s,
      name: names?.[i] ?? s.name,
      record: {
        wins: winners.includes(i) && winners.length === 1 ? 1 : 0,
        ties: winners.includes(i) && winners.length > 1 ? 1 : 0,
        losses: winners.includes(i) ? 0 : 1,
      },
    }));
    if (v.game) {
      v.game.players = v.game.players.map((p, i) => ({
        ...p,
        score: { ...p.score, total: totals[i] as number },
      }));
    }
    return v;
  }
  const mount = (v: ReturnType<typeof tied>) =>
    render(
      <GameOver
        view={v}
        rematchBusy={false}
        send={() => true}
        onRematch={() => {}}
        onHome={() => {}}
      />,
    );

  it("single winner: Winner + crown, no tie badge", () => {
    const { container } = mount(tied(3, [0], [9, 5, 2]));
    expect(container.querySelector(".g-winner")?.textContent).toMatch(/^\s*Winner: /);
    expect(container.querySelector(".g-tie-badge")).toBeNull();
    expect(container.querySelector("tr[data-winner] svg title")?.textContent).toBe("Winner");
    expect(getHistory()[0]?.result).toBe("W");
  });

  it("2-way tie among 3: Tie: A & B, badges, ranks 1,1,3", () => {
    const { container } = mount(tied(3, [0, 2], [9, 2, 9], ["Ana", "Cy", "Ben"]));
    expect(container.querySelector(".g-winner")?.textContent).toContain("Tie: Ana & Ben");
    expect(container.querySelectorAll("tbody .g-tie-badge")).toHaveLength(2);
    expect(container.querySelector("tbody svg title")).toBeNull();
    const ranks = [...container.querySelectorAll("tbody .g-rank")].map((e) => e.textContent);
    expect(ranks).toEqual(["1.", "1.", "3."]);
    expect(getHistory()[0]?.result).toBe("T"); // you are seat 0 in the fixture
  });

  it.each([2, 5])("all %i tied: It's a tie!, no crown", (n) => {
    const { container } = mount(
      tied(
        n,
        Array.from({ length: n }, (_, i) => i),
        Array(n).fill(7),
      ),
    );
    expect(container.querySelector(".g-winner")?.textContent).toContain("It's a tie!");
    expect(container.querySelector(".g-winner")?.textContent).not.toContain("Winner");
    expect(container.querySelectorAll("tbody .g-tie-badge")).toHaveLength(n);
    expect(
      [...container.querySelectorAll("tbody .g-rank")].every((e) => e.textContent === "1."),
    ).toBe(true);
  });

  it("long tied names are title-attributed for truncation", () => {
    const long = "Bartholomew-the-Extremely-Long";
    const { container } = mount(tied(3, [0, 1], [9, 9, 1], [long, "Al", "Cy"]));
    const t = container.querySelector(`.g-winner .g-name[title="${long}"]`);
    expect(t).toBeTruthy();
  });
});
