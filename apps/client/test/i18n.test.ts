import { ILLEGAL_REASONS } from "@cd/engine";
import { ERROR_CODES } from "@cd/protocol";
import { describe, expect, it } from "vitest";
import { errorText, t } from "../src/i18n";

const GENERIC_ERROR = t("err.generic");

describe("errorText", () => {
  it.each(ERROR_CODES)("has friendly text for %s", (code) => {
    const text = errorText(code);
    expect(text).not.toBe(GENERIC_ERROR);
    expect(text).not.toMatch(/E_/);
  });

  it.each(ILLEGAL_REASONS)("has text for E_ILLEGAL_MARK reason %s", (reason) => {
    expect(errorText("E_ILLEGAL_MARK", reason)).not.toBe(errorText("E_ILLEGAL_MARK"));
  });

  it("explains LEFT_OF_RIGHTMOST", () => {
    expect(errorText("E_ILLEGAL_MARK", "LEFT_OF_RIGHTMOST")).toBe(
      "You can only mark to the right of your last mark in that row.",
    );
  });

  it("falls back for unknown codes and reasons", () => {
    expect(errorText("E_WHATEVER")).toBe(GENERIC_ERROR);
    expect(errorText("__proto__")).toBe(GENERIC_ERROR);
    expect(errorText("E_ILLEGAL_MARK", "NOPE")).toBe("You can't mark that box.");
  });
});
