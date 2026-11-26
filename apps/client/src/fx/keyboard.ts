/** Desktop shortcuts (H11). Ignored while a text field has focus or a modifier is held. */
import { useEffect, useRef } from "preact/hooks";
import { modalOpen } from "./modal";

export interface KeyActions {
  canRoll: boolean;
  canPass: boolean;
  canPenaltyPass: boolean;
  roll: () => void;
  pass: () => void;
  penaltyPass: () => void;
  canUndo: boolean;
  undo: () => void;
  /** Escape: cancel staging (dialogs close themselves). */
  cancel: () => void;
  mute: () => void;
  help: () => void;
  /** `/` or `c`: open the chat panel (I3). */
  chat?: () => void;
  /** `e`: open the emoji/reaction picker. */
  emoji?: () => void;
  /** `s`: open settings. */
  settings?: () => void;
}

export function isTyping(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el || typeof el.tagName !== "string") return false;
  return (
    el.tagName === "INPUT" ||
    el.tagName === "TEXTAREA" ||
    el.tagName === "SELECT" ||
    el.isContentEditable === true
  );
}

/** Enabled (= legal) boxes of your sheet as a grid, rows top to bottom, columns left to right. */
function legalGrid(root: ParentNode): HTMLButtonElement[][] {
  return Array.from(root.querySelectorAll(".g-sheet .g-row")).map((row) =>
    Array.from(row.querySelectorAll<HTMLButtonElement>(".g-box:not(:disabled)")),
  );
}

function columnOf(el: HTMLElement): number {
  const boxes = Array.from(el.parentElement?.querySelectorAll(".g-box") ?? []);
  return boxes.indexOf(el);
}

/** Move focus to the next legal box in a direction; returns whether focus moved. */
export function moveFocus(
  dir: "left" | "right" | "up" | "down",
  root: ParentNode = document,
): boolean {
  const grid = legalGrid(root);
  const all = grid.flat();
  if (all.length === 0) return false;
  const cur = document.activeElement as HTMLButtonElement | null;
  const at = cur ? all.indexOf(cur) : -1;
  if (at < 0) {
    all[0]?.focus();
    return true;
  }
  const r = grid.findIndex((row) => row.includes(cur as HTMLButtonElement));
  const row = grid[r] ?? [];
  let next: HTMLButtonElement | undefined;
  if (dir === "left") next = row[row.indexOf(cur as HTMLButtonElement) - 1];
  else if (dir === "right") next = row[row.indexOf(cur as HTMLButtonElement) + 1];
  else {
    const step = dir === "up" ? -1 : 1;
    const col = columnOf(cur as HTMLElement);
    for (let i = r + step; i >= 0 && i < grid.length && !next; i += step) {
      const cand = grid[i] ?? [];
      next = cand.reduce<HTMLButtonElement | undefined>(
        (best, b) =>
          !best || Math.abs(columnOf(b) - col) < Math.abs(columnOf(best) - col) ? b : best,
        undefined,
      );
    }
  }
  next?.focus();
  return !!next;
}

const ARROWS: Record<string, "left" | "right" | "up" | "down"> = {
  ArrowLeft: "left",
  ArrowRight: "right",
  ArrowUp: "up",
  ArrowDown: "down",
};

/** Returns true when the key was handled (and default prevented). */
export function handleKey(e: KeyboardEvent, a: KeyActions): boolean {
  // T-FIX-12: while a modal dialog (reveal, results, sheet, chat) is open, the board's shortcuts stand down.
  if (modalOpen()) return false;
  if (e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return false;
  const k = e.key;
  const done = () => {
    e.preventDefault();
    return true;
  };
  if (k === "Escape") {
    a.cancel();
    return false; // dialogs listen for Escape too
  }
  if (e.repeat) return false;
  if (k === " " || k === "Spacebar") {
    if (a.canRoll) {
      a.roll();
      return done();
    }
    if (a.canPass) {
      a.pass();
      return done();
    }
    // Never let Space click a focused button by accident (for example Undo).
    return done();
  }
  if (k === "x" || k === "X") {
    if (!a.canPenaltyPass) return false;
    a.penaltyPass();
    return done();
  }
  if (k === "z" || k === "Z") {
    if (!a.canUndo) return false;
    a.undo();
    return done();
  }
  if (k === "m" || k === "M") {
    a.mute();
    return done();
  }
  if ((k === "/" || k === "c" || k === "C") && a.chat) {
    a.chat();
    return done();
  }
  if ((k === "e" || k === "E") && a.emoji) {
    a.emoji();
    return done();
  }
  if ((k === "s" || k === "S") && a.settings) {
    a.settings();
    return done();
  }
  if (k === "?") {
    a.help();
    return done();
  }
  const dir = ARROWS[k];
  if (dir) return moveFocus(dir) ? done() : false;
  return false;
}

export function useGameKeys(actions: KeyActions): void {
  const ref = useRef(actions);
  ref.current = actions;
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      handleKey(e, ref.current);
    };
    document.addEventListener("keydown", on);
    return () => document.removeEventListener("keydown", on);
  }, []);
}
