import { beforeEach, describe, expect, it } from "vitest";
import {
  _resetStoreForTests,
  applyView,
  clearView,
  dismissToast,
  getState,
  showToast,
  subscribe,
} from "../src/store";
import { makeView } from "./fixtures";

beforeEach(() => _resetStoreForTests());

describe("store", () => {
  it("applies a higher version and ignores lower or equal versions", () => {
    expect(applyView(makeView(5))).toBe(true);
    expect(applyView(makeView(5))).toBe(false);
    expect(applyView(makeView(4))).toBe(false);
    expect(getState().view?.version).toBe(5);
    expect(applyView(makeView(6))).toBe(true);
    expect(getState().view?.version).toBe(6);
  });

  it("accepts any version after clearView", () => {
    applyView(makeView(9));
    clearView();
    expect(applyView(makeView(1))).toBe(true);
  });

  it("notifies subscribers and handles toasts", () => {
    const seen: string[] = [];
    const off = subscribe((s) => seen.push(s.toast?.text ?? "-"));
    const id = showToast("Hello");
    dismissToast(id + 1);
    expect(getState().toast?.text).toBe("Hello");
    dismissToast(id);
    expect(getState().toast).toBeNull();
    off();
    showToast("ignored");
    expect(seen).toEqual(["Hello", "-"]);
  });
});
