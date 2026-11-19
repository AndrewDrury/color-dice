import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { REACTIONS } from "@cd/protocol";
import { cleanup, render } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CatReaction, catCaption, reactionAsset, reactionUrl } from "../src/components/CatReaction";
import { LaughingCat } from "../src/components/cats/LaughingCat";

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

describe("cat reactions", () => {
  it("serves GIFs under the deploy base path (Pages lives at /color-dice/)", () => {
    vi.stubEnv("BASE_URL", "/color-dice/");
    for (const id of REACTIONS) expect(reactionAsset(id)).toMatch(/^\/color-dice\/reactions\/.+/);
    expect(reactionUrl("mad-cat.jpg")).toBe("/color-dice/reactions/mad-cat.jpg");
  });

  it("every allow-listed id points at a file that exists in public/reactions", () => {
    for (const id of REACTIONS) {
      const file = decodeURIComponent(reactionAsset(id).split("/reactions/")[1] ?? "");
      expect(existsSync(resolve(import.meta.dirname, "../public/reactions", file)), id).toBe(true);
    }
    expect(existsSync(resolve(import.meta.dirname, "../public/reactions/mad-cat.jpg"))).toBe(true);
  });

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
