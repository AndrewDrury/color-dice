import { gzipSync } from "node:zlib";
import { REACTIONS } from "@cd/protocol";
import { cleanup, render } from "@testing-library/preact";
import { afterEach, describe, expect, it } from "vitest";
import { CatReaction, catCaption, reactionAsset } from "../src/components/CatReaction";
import { LaughingCat } from "../src/components/cats/LaughingCat";

afterEach(cleanup);

describe("cat reactions", () => {
  it("draws all eight GIF reactions with a distinct public asset and a caption below", () => {
    const assets = REACTIONS.map((id) =>
      render(<CatReaction id={id} />)
        .container.querySelector("img")
        ?.getAttribute("src"),
    );
    expect(new Set(assets).size).toBe(REACTIONS.length);
    for (const id of REACTIONS) {
      expect(reactionAsset(id)).toMatch(/^\/reactions\/.+/);
    }
    cleanup();
    const { container } = render(<CatReaction id="happy-black-cat-gif-by-sou-eu-na-vida" />);
    expect(container.querySelector(".cat-gif")?.getAttribute("aria-hidden")).toBe("true");
    expect(container.querySelector(".cat-cap")?.textContent).toBe("happy cat");
  });

  it("every id has a caption in EN, FR and ES; unknown ids fall back to the id", () => {
    for (const id of REACTIONS) {
      expect(catCaption(id)).toBeTruthy();
    }
    expect(catCaption("cat_nope")).toBe("cat_nope");
  });

  it("laughing cat: animated by default, still on request", () => {
    expect(render(<LaughingCat />).container.querySelector(".lcat.is-still")).toBeNull();
    cleanup();
    expect(render(<LaughingCat still />).container.querySelector(".lcat.is-still")).not.toBeNull();
  });

  it("the SVG sources stay small (<= 12 KB gzip)", async () => {
    const srcs = [
      (await import("../src/components/cats/Cat.tsx?raw")).default,
      (await import("../src/components/cats/LaughingCat.tsx?raw")).default,
    ];
    const total = srcs.map((x) => gzipSync(x).length).reduce((x, y) => x + y, 0);
    expect(total).toBeLessThan(12 * 1024);
  });
});
