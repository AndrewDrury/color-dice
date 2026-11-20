/**
 * Theme swatches (T-NEW-16, D-L6/D-L7): one round radio per theme showing its background,
 * pattern and accent. Choosing one applies it to the whole page at once (App.applyPrefs listens
 * to prefs) and saves it, so the page itself is the preview.
 */
import { useEffect, useState } from "preact/hooks";
import { t, useT } from "../i18n";
import { getPrefs, onPrefs, setPrefs, THEMES } from "../prefs";

export function ThemePicker({ legend }: { legend: string }) {
  useT();
  const names = t("settings.themes").split(",");
  const [theme, setTheme] = useState(() => getPrefs().theme);
  useEffect(() => onPrefs((p) => setTheme(p.theme)), []);
  return (
    <fieldset class="tp">
      <legend class="tp-legend">{legend}</legend>
      {THEMES.map((id, i) => (
        <label key={id} class={`tp-swatch th-${id}`}>
          <input
            type="radio"
            name="theme"
            class="tp-input"
            checked={id === theme}
            onChange={() => setPrefs({ theme: id })}
          />
          <span class="sr-only">{names[i] ?? id}</span>
        </label>
      ))}
    </fieldset>
  );
}
