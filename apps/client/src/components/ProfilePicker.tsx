/** Colour swatches + cat grid (T-NEW-13, T-NEW-15: both always open). Lazy chunk: only create/join/waiting load it. */
import {
  DEFAULT_PROFILE_CAT,
  PROFILE_COLORS,
  type Profile,
  type ProfileCat,
  type Reaction,
} from "@cd/protocol";
import { t, useT } from "../i18n";
import { Avatar } from "./Avatar";
import "../styles/profile.css";
import { catCaption, REACTION_MOOD_ORDER } from "./CatReaction";
import { ThemePicker } from "./ThemePicker";

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
  const names = t("profile.colors").split(",");
  return (
    <div class="pp stack">
      <fieldset class="pp-colors">
        <legend class="pp-legend">{t("profile.chooseColor")}</legend>
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
      <fieldset class="pp-cats">
        <legend class="pp-legend">{t("profile.chooseAvatar")}</legend>
        {CATS.map((cat) => (
          <label key={cat} class="pp-cat">
            <input
              type="radio"
              name="profile-cat"
              class="pp-input"
              checked={cat === value.cat}
              onChange={() => onChange({ ...value, cat })}
            />
            <Avatar profile={{ color: value.color, cat }} size={56} />
            <span class="sr-only">{catName(cat)}</span>
          </label>
        ))}
      </fieldset>
      <ThemePicker legend={t("profile.chooseTheme")} />
    </div>
  );
}
