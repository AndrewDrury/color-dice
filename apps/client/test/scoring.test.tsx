import { crossCount, triangular } from "@cd/engine";
import { cleanup, render } from "@testing-library/preact";
import { afterEach, describe, expect, it } from "vitest";
import { Row } from "../src/components/Row";
import { ScoreGuide } from "../src/components/ScoreGuide";
import { Sheet, type SheetProps } from "../src/components/Sheet";
import { applyLanguage } from "../src/i18n";

afterEach(cleanup);

const empty = () => ({ marked: Array(11).fill(false), lockCrossed: false });
const rows = (over: Record<string, { marked: boolean[]; lockCrossed: boolean }> = {}) =>
  ({ RED: empty(), YELLOW: empty(), GREEN: empty(), BLUE: empty(), ...over }) as never;
const marks = (n: number) => Array.from({ length: 11 }, (_, i) => i < n);

const fx = { flash: {}, glint: null, floats: [], shakeKey: 0 };
function sheet(penalties: number, staged: SheetProps["staged"] = []) {
  const r = rows({ RED: { marked: marks(5), lockCrossed: false } });
  return (
    <Sheet
      player={
        {
          sheet: { rows: r, penalties },
          score: {
            rows: { RED: 15, YELLOW: 0, GREEN: 0, BLUE: 0 },
            penalties: penalties === 0 ? 0 : -5 * penalties,
            total: 15 - 5 * penalties,
          },
        } as never
      }
      lockedColors={[]}
      legal={new Set()}
      staged={staged}
      ghost={[]}
      disabled
      fx={fx}
      onPick={() => {}}
    />
  );
}

describe("score card footer", () => {
  it("is an equation: + + + − =", () => {
    const { container } = render(sheet(2));
    const eq = container.querySelector(".g-eq");
    const ops = Array.from(eq?.querySelectorAll(".g-op") ?? []).map((e) => e.textContent);
    expect(ops).toEqual(["+", "+", "+", "−", "="]);
    expect(container.querySelector("[data-penalty-points]")?.textContent).toBe("10");
    expect(container.querySelector("[data-total]")?.getAttribute("data-total")).toBe("5");
  });
  it("shows the penalty chip as 0 with no penalties, and −5 in empty boxes", () => {
    const { container } = render(sheet(0));
    expect(container.querySelector("[data-penalty-points]")?.textContent).toBe("0");
    expect(container.querySelector(".g-pen-label")?.textContent).toBe("Penalty −5 each");
    expect(Array.from(container.querySelectorAll(".g-pbox")).map((e) => e.textContent)).toEqual([
      "−5",
      "−5",
      "−5",
      "−5",
    ]);
  });
});

describe("score card footer, round 3 (K3.2, K3.4)", () => {
  afterEach(() => applyLanguage("en"));

  it("is one line: the equation first, the penalty boxes after it, in the same flex row", () => {
    const { container } = render(sheet(1));
    const foot = container.querySelector(".g-foot");
    const kids = Array.from(foot?.children ?? []).map((e) => e.className.split(" ")[0]);
    expect(kids).toEqual(["g-scores", "g-pen"]);
    expect(foot?.querySelectorAll(".g-pbox")).toHaveLength(4);
    expect(Array.from(foot?.querySelectorAll(".g-pbox") ?? []).map((e) => e.textContent)).toEqual([
      "✕",
      "−5",
      "−5",
      "−5",
    ]);
  });

  it("captions the penalty term only, in each language", async () => {
    for (const [lang, word] of [
      ["en", "penalties"],
      ["fr", "pénalités"],
      ["es", "penalizaciones"],
    ] as const) {
      await applyLanguage(lang);
      const { container, unmount } = render(sheet(2));
      const caps = container.querySelectorAll(".g-pencap");
      expect(caps).toHaveLength(1);
      expect(caps[0]?.textContent).toBe(word);
      // Number over caption, inside the penalty term.
      const term = caps[0]?.parentElement;
      expect(term?.classList.contains("g-penscore")).toBe(true);
      expect(term?.firstElementChild?.textContent).toBe("10");
      expect(term?.lastElementChild).toBe(caps[0]);
      unmount();
    }
  });

  it("emphasises the total with the large class and a screen-reader label", () => {
    const { container } = render(sheet(2));
    const total = container.querySelector(".g-total");
    expect(total?.classList.contains("g-total--xl")).toBe(true);
    expect(total?.getAttribute("aria-label")).toBe("Total score 5");
  });

  it("previews the staged mark: row pill +gain, total a → b; clears on cancel", () => {
    const view = render(sheet(0));
    const red = () => view.container.querySelector(".g-row.c-red .g-rowpts");
    expect(red()?.textContent).toBe("5✕·15");
    // Red has 5 marks (2..6): marking 8 makes 6 crosses → 21 (+6).
    view.rerender(sheet(0, [{ color: "RED", number: 8 }]));
    expect(red()?.textContent).toBe("+6");
    expect(red()?.getAttribute("data-gain")).toBe("6");
    const total = view.container.querySelector(".g-total");
    expect(total?.textContent).toBe("15→21total");
    expect(total?.getAttribute("aria-label")).toBe("Total score 15, 21 after this mark");
    expect(total?.classList.contains("g-total--xl")).toBe(true);
    view.rerender(sheet(0));
    expect(red()?.textContent).toBe("5✕·15");
    expect(view.container.querySelector(".g-total")?.textContent).toBe("15total");
  });

  it("counts the lock as a cross in the preview", () => {
    const { container } = render(
      <Row
        color="RED"
        row={{ marked: marks(5), lockCrossed: false }}
        lockedColors={[]}
        legal={[12]}
        stagedNumbers={[12]}
        ghostNumbers={[]}
        flash={[]}
        disabled={false}
        shake={false}
        glint={false}
        onPick={() => {}}
      />,
    );
    // 5 marks → 6 marks + lock = 7 crosses: 28 − 15 = +13.
    expect(container.querySelector(".g-rowpts")?.textContent).toBe("+13");
  });
});

describe("row points pill (K3.2)", () => {
  it("shows triangular(crossCount) for every row, after the lock box", () => {
    const r = rows({
      RED: { marked: marks(4), lockCrossed: false },
      YELLOW: { marked: marks(1), lockCrossed: false },
      GREEN: { marked: marks(11), lockCrossed: true },
    });
    const { container } = render(
      <Sheet
        player={
          {
            sheet: { rows: r, penalties: 0 },
            score: { rows: { RED: 10, YELLOW: 1, GREEN: 78, BLUE: 0 }, penalties: 0, total: 89 },
          } as never
        }
        lockedColors={[]}
        legal={new Set()}
        staged={[]}
        ghost={[]}
        disabled
        fx={fx}
        onPick={() => {}}
      />,
    );
    for (const c of ["RED", "YELLOW", "GREEN", "BLUE"] as const) {
      const row = container.querySelector(`.g-row.c-${c.toLowerCase()}`);
      const pill = row?.querySelector(".g-rowpts");
      const row0 = (r as Record<string, { marked: boolean[]; lockCrossed: boolean }>)[c];
      const k = crossCount({
        color: c,
        marked: row0?.marked ?? [],
        lockCrossed: !!row0?.lockCrossed,
      });
      expect(Number(pill?.getAttribute("data-points"))).toBe(triangular(k));
      expect(Number(pill?.getAttribute("data-crosses"))).toBe(k);
      expect(row?.lastElementChild).toBe(pill);
      expect(pill?.previousElementSibling?.classList.contains("g-lockbox")).toBe(true);
    }
    expect(container.querySelector(".g-row.c-red .g-rowpts")?.getAttribute("aria-label")).toBe(
      "Red row: 4 ✕, 10 points",
    );
  });
});

describe("ScoreGuide", () => {
  it("shows engine triangular values for 1..12", () => {
    const { container } = render(<ScoreGuide rows={rows()} />);
    const pts = Array.from(container.querySelectorAll("[data-pts]")).map((e) =>
      Number(e.textContent),
    );
    expect(pts).toEqual(Array.from({ length: 12 }, (_, i) => triangular(i + 1)));
  });
  it("puts one dot per colour at its cross count (lock counts)", () => {
    const { container } = render(
      <ScoreGuide
        rows={rows({
          RED: { marked: marks(5), lockCrossed: false },
          GREEN: { marked: marks(5), lockCrossed: true },
        })}
      />,
    );
    const cells = Array.from(container.querySelectorAll(".g-guide-dots td"));
    expect(cells[4]?.querySelectorAll(".g-guide-dot").length).toBe(1);
    expect(cells[5]?.querySelector('[aria-label="Green: 6 ✕"]')).toBeTruthy();
  });
  it("is a collapsed details on phone", () => {
    const { container } = render(<ScoreGuide rows={rows()} collapsible />);
    const d = container.querySelector("details");
    expect(d?.open).toBe(false);
    expect(d?.textContent).toContain("How scoring works");
  });
});

describe("lock progress pips", () => {
  const rowEl = (n: number) =>
    render(
      <Row
        color="RED"
        row={{ marked: marks(n), lockCrossed: false } as never}
        lockedColors={[]}
        legal={[]}
        stagedNumbers={[]}
        ghostNumbers={[]}
        flash={[]}
        disabled
        shake={false}
        glint={false}
        onPick={() => {}}
      />,
    ).container;
  it("fills pips = marks and explains in aria", () => {
    const c = rowEl(3);
    expect(c.querySelectorAll(".g-pips i.is-on").length).toBe(3);
    expect(c.querySelectorAll(".g-pips i").length).toBe(5);
    expect(c.querySelector(".g-lockbox")?.getAttribute("aria-label")).toBe(
      "Red lock, needs 5 marks, has 3",
    );
    expect(c.querySelector(".g-lockbox.is-available")).toBeNull();
  });
  it("goes solid and available at 5 marks", () => {
    const c = rowEl(5);
    expect(c.querySelectorAll(".g-pips i.is-on").length).toBe(5);
    expect(c.querySelector(".g-lockbox.is-available")).toBeTruthy();
  });
});
