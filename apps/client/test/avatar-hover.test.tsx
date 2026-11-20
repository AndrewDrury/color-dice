import { cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it } from "vitest";
import { AvatarHover } from "../src/components/AvatarHover";

afterEach(cleanup);

describe("AvatarHover", () => {
  it("shows a tooltip on focus and hides on Escape", () => {
    render(<AvatarHover profile={{ color: "teal", cat: "mad-cat" }} name="Alex" size={24} />);
    const avatar = screen.getByLabelText("Alex");
    fireEvent.focus(avatar);
    expect(screen.getByRole("tooltip").textContent).toContain("Alex");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("tooltip")).toBeNull();
  });
});
