/**
 * `?lab=dice` route hook. Call `mountLabIfRequested(root)` from main.tsx before rendering the app;
 * when it resolves true, the lab owns the root. The dynamic import sits inside an
 * `import.meta.env.DEV` guard, so production builds drop it (and the lab) entirely.
 */
export function labRequested(search: string): boolean {
  return new URLSearchParams(search).get("lab") === "dice";
}

export function mountLabIfRequested(root: Element): Promise<boolean> {
  if (import.meta.env.DEV && labRequested(location.search)) {
    return Promise.all([import("preact"), import("./DiceLab")]).then(([{ h, render }, lab]) => {
      render(h(lab.DiceLab, null), root);
      return true;
    });
  }
  return Promise.resolve(false);
}
