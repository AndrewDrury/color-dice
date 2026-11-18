import { gzipSync } from "node:zlib";
import { REACTIONS } from "@cd/protocol";
import { cleanup, render } from "@testing-library/preact";
import { afterEach, describe, expect, it } from "vitest";
import { CatReaction, catCaption } from "../src/components/CatReaction";
import { Cat } from "../src/components/cats/Cat";
import { LaughingCat } from "../src/components/cats/LaughingCat";
import { en } from "../src/i18n/en";
import { es } from "../src/i18n/es";
import { fr } from "../src/i18n/fr";

afterEach(cleanup);

describe("cat reactions", () => {
  it("draws all eight cats with a distinct face and a caption below", () => {
    const html = REACTIONS.map((id) => render(<Cat id={id} />).container.innerHTML);
    expect(new Set(html).size).toBe(REACTIONS.length);
    cleanup();
    const { container } = render(<CatReaction id="cat_clap" />);
    expect(container.querySelector(".cat-svg")?.getAttribute("aria-hidden")).toBe("true");
    expect(container.querySelector(".cat-cap")?.textContent).toBe("gg");
  });

  it("every id has a caption in EN, FR and ES; unknown ids fall back to the id", () => {
    for (const id of REACTIONS) {
      const key = `cat.${id.replace("cat_", "")}` as keyof typeof en;
      for (const cat of [en, fr, es]) expect(cat[key]).toBeTruthy();
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
