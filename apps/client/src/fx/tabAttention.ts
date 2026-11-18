/** Tab title + favicon dot while the tab is hidden and it is your move (H11). */
import { useEffect } from "preact/hooks";
import { t } from "../i18n";

/** A constant string: no user input ever reaches this data URL. */
const DOT_ICON =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect x="72" y="72" width="368" height="368" rx="84" fill="#fffdf8" stroke="#1c2230" stroke-width="16"/><circle cx="256" cy="256" r="38" fill="#1c2230"/><circle cx="410" cy="102" r="86" fill="#5b5bf0" stroke="#fffdf8" stroke-width="16"/></svg>',
  );

function iconLink(): HTMLLinkElement | null {
  return document.querySelector<HTMLLinkElement>('link[rel~="icon"]');
}

/** Wire the title and favicon swap; returns a cleanup that restores both. */
export function trackTabAttention(isMyMove: () => boolean): {
  refresh: () => void;
  stop: () => void;
} {
  const baseTitle = document.title;
  const baseIcon = iconLink()?.getAttribute("href") ?? null;
  const refresh = () => {
    const on = document.hidden && isMyMove();
    document.title = on ? t("attention.title") : baseTitle;
    const link = iconLink();
    if (link) {
      if (on) link.setAttribute("href", DOT_ICON);
      else if (baseIcon !== null) link.setAttribute("href", baseIcon);
    }
  };
  document.addEventListener("visibilitychange", refresh);
  globalThis.addEventListener("focus", refresh);
  refresh();
  return {
    refresh,
    stop: () => {
      document.removeEventListener("visibilitychange", refresh);
      globalThis.removeEventListener("focus", refresh);
      document.title = baseTitle;
      const link = iconLink();
      if (link && baseIcon !== null) link.setAttribute("href", baseIcon);
    },
  };
}

export function useTabAttention(myMove: boolean): void {
  useEffect(() => {
    const t = trackTabAttention(() => myMove);
    return t.stop;
  }, [myMove]);
}
