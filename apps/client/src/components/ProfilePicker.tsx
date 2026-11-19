/** Colour swatches + cat GIF grid (T-NEW-13). Lazy chunk: only create/join/waiting screens load it. */
import {
  DEFAULT_PROFILE_CAT,
  PROFILE_COLORS,
  type Profile,
  type ProfileCat,
  type Reaction,
} from "@cd/protocol";
import { useState } from "preact/hooks";
import { t, useT } from "../i18n";
import { Avatar } from "./Avatar";
import { catCaption, REACTION_MOOD_ORDER } from "./CatReaction";
import "../styles/profile.css";

const CATS: readonly ProfileCat[] = [DEFAULT_PROFILE_CAT, ...REACTION_MOOD_ORDER];
const catName = (c: ProfileCat) => catCaption(c as Reaction).replace("-", " ");

export function ProfilePicker({
  value,
  onChange,
}: {
  value: Profile;
  onChange: (p: Profile) => void;
}) {
  useT();
  const [open, setOpen] = useState(false);
  const names = t("profile.colors").split(",");
  return (
    <fieldset class="pp stack">
      <legend class="pp-legend">{t("profile.title")}</legend>
      <div class="pp-row">
        <Avatar profile={value} size={44} />
        <fieldset class="pp-colors">
          <legend class="sr-only">{t("profile.colorGroup")}</legend>
          {PROFILE_COLORS.map((color, i) => (
            <label key={color} class={`pp-swatch pc-${color}`}>
              <input
                type="radio"
                name="profile-color"
                class="pp-input"
                checked={color === value.color}
                onChange={() => onChange({ ...value, color })}
              />
              <span class="sr-only">{names[i] ?? color}</span>
            </label>
          ))}
        </fieldset>
      </div>
      <button
        type="button"
        class="btn pp-toggle"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {t("profile.cats")}
      </button>
      {open ? (
        <fieldset class="pp-cats">
          <legend class="sr-only">{t("profile.catGroup")}</legend>
          {CATS.map((cat) => (
            <label key={cat} class="pp-cat">
              <input
                type="radio"
                name="profile-cat"
                class="pp-input"
                checked={cat === value.cat}
                onChange={() => onChange({ ...value, cat })}
              />
              <Avatar profile={{ color: value.color, cat }} size={40} />
              <span class="sr-only">{catName(cat)}</span>
            </label>
          ))}
        </fieldset>
      ) : null}
    </fieldset>
  );
}
