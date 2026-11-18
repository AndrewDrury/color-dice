/** A cat reaction (SVG + meme caption below). Captions come from i18n (K5.1). */
import type { Reaction } from "@cd/protocol";
import { type MessageKey, t } from "../i18n";
import { Cat } from "./cats/Cat";

/** Translated caption for a reaction id; unknown ids fall back to the id itself. */
export function catCaption(id: string): string {
  const key = `cat.${id.replace(/^cat_/, "")}` as MessageKey;
  const text = t(key);
  return text === key ? id : text;
}

export function CatReaction({
  id,
  size = 48,
  caption = true,
}: {
  id: Reaction;
  size?: number;
  caption?: boolean;
}) {
  return (
    <span class="cat">
      <Cat id={id} size={size} />
      {caption ? <span class="cat-cap">{catCaption(id)}</span> : null}
    </span>
  );
}
