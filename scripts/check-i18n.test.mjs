// Self-test for check-i18n.mjs: fixtures that must be flagged / must pass.
import assert from "node:assert/strict";
import { test } from "node:test";
import { findLeaks } from "./check-i18n.mjs";

const tsx = (s) => findLeaks(s, ".tsx");
const ts = (s) => findLeaks(s, ".ts", "fixture.ts");

test("JSX text with letters is flagged, symbols/digits are not", () => {
  assert.equal(tsx("<p>Hello world</p>").length, 1);
  assert.equal(tsx("<p>Ok!</p>").length, 1);
  assert.equal(tsx("<p>Score: {n} pts</p>").length, 2);
  assert.equal(tsx("<p>✕</p>").length, 0);
  assert.equal(tsx("<p>12 · 3 / 4%</p>").length, 0);
  assert.equal(tsx("<p>{t('a')}</p>").length, 0);
});

test("attributes and props", () => {
  for (const a of [
    "aria-description",
    "aria-roledescription",
    "aria-valuetext",
    "aria-label",
    "text",
    "message",
    "heading",
    "description",
    "caption",
    "summary",
    "tooltip",
  ]) {
    assert.equal(tsx(`<X ${a}="Some words" />`).length, 1, a);
    assert.equal(tsx(`<X ${a}={t("k")} />`).length, 0, `${a} with t()`);
  }
});

test("showToast literal", () => {
  assert.equal(tsx('showToast("Saved it")').length, 1);
});

test(".ts sentence-like literals", () => {
  assert.equal(ts('const m = "Something went wrong";').length, 1);
  assert.equal(ts('const m = "Failed";').length, 1);
  assert.equal(ts('const m = "two words";').length, 1);
  assert.equal(ts('const m = t("err.generic");').length, 0);
  assert.equal(ts('const k = "snake_case";').length, 0);
  assert.equal(ts('import x from "./thing";').length, 0);
  assert.equal(ts('const m = "Failed"; // i18n-ok').length, 0);
});

test("generics and non-JSX code are not mistaken for JSX text", () => {
  assert.equal(tsx("const o = <V extends string>(l: V[]) => l;").length, 0);
  assert.equal(tsx("const [a] = useState<string | null>(null);").length, 0);
  assert.equal(tsx("const x = <div>{c ? (<b>1</b>) : null}</div>;").length, 0);
});
