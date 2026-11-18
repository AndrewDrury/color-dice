import { triangular } from "@cd/engine";
import { cleanup, render } from "@testing-library/preact";
import { afterEach, describe, expect, it } from "vitest";
import { Row } from "../src/components/Row";
import { ScoreGuide } from "../src/components/ScoreGuide";
import { Sheet } from "../src/components/Sheet";

afterEach(cleanup);

const empty = () => ({ marked: Array(11).fill(false), lockCrossed: false });
const rows = (over: Record<string, { marked: boolean[]; lockCrossed: boolean }> = {}) =>
  ({ RED: empty(), YELLOW: empty(), GREEN: empty(), BLUE: empty(), ...over }) as never;
const marks = (n: number) => Array.from({ length: 11 }, (_, i) => i < n);

const fx = { flash: {}, glint: null, floats: [], shakeKey: 0 };
function sheet(penalties: number) {
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
      staged={null}
      ghost={null}
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
        stagedNumber={null}
        ghostNumber={null}
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
