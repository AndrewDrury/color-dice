/** Static GIF asset and meme caption for an allow-listed reaction id. */
import type { ProfileCat, Reaction } from "@cd/protocol";
import { type MessageKey, t, useT } from "../i18n";

/** Allow-listed cat GIFs in picker order (grouped by mood): id, file in /reactions. Captions are the catalog keys `cat.<index>` (FR/ES load lazily). */
const CATS: readonly (readonly [Reaction, string])[] = [
  ["happy-black-cat-gif-by-sou-eu-na-vida", "Happy Black Cat GIF by Sou Eu Na Vida.gif"],
  ["in-love-cat-gif", "In Love Cat GIF.gif"],
  ["kitty-cute-cat-gif", "Kitty Cute Cat GIF.gif"],
  ["cat-dancing-gif-by-unscreen", "Cat Dancing GIF by Unscreen.gif"],
  ["dance-cat-gif", "Dance Cat GIF.gif"],
  ["cat-laugh-gif", "Cat Laugh GIF.gif"],
  ["cat-meme-gif", "Cat Meme GIF.gif"],
  ["cat-meme-gif-1", "Cat Meme GIF (1).gif"],
  ["cat-meme-gif-2", "Cat Meme GIF (2).gif"],
  ["cat-reaction-gif-gif", "Cat Reaction Gif GIF.gif"],
  ["surprised-cat-quedado-gif", "Surprised Cat Quedado GIF.gif"],
  ["shocked-cat-gif", "Shocked Cat GIF.gif"],
  ["cat-screaming-gif", "Cat Screaming GIF.gif"],
  ["angry-cat-disgusted-face-gif", "Angry Cat Disgusted Face GIF.gif"],
  ["mad-the-internet-gif-by-moodman", "Mad The Internet GIF by MOODMAN.gif"],
  ["bruce-lee-fighting-gif", "Bruce Lee Fighting GIF.gif"],
  ["cat-holding-sword-gif", "Cat Holding Sword GIF.gif"],
  ["cat-peeking-gif", "Cat Peeking GIF.gif"],
  ["cat-gif", "Cat GIF.gif"],
  ["cat-gif-1", "Cat GIF (1).gif"],
  ["cat-emoji-gif", "Cat Emoji GIF.gif"],
];

export const REACTION_MOOD_ORDER: readonly Reaction[] = CATS.map((c) => c[0]);

const catRow = (id: string) => CATS.find((c) => c[0] === id);

/** Public URL of a file in /reactions, honouring the deploy base path (Pages serves under /color-dice/). */
export function reactionUrl(file: string): string {
  const base = import.meta.env?.BASE_URL ?? "/";
  return `${base.endsWith("/") ? base : `${base}/`}reactions/${encodeURIComponent(file)}`;
}

export const REACTION_BUTTON_IMAGE = "mad-cat.jpg";

export function reactionAsset(id: ProfileCat): string {
  return reactionUrl(catRow(id)?.[1] ?? REACTION_BUTTON_IMAGE);
}

/** Translated caption for a reaction id; unknown ids fall back to the id itself. */
export function catCaption(id: string): string {
  const i = CATS.findIndex((c) => c[0] === id);
  return i < 0 ? id : t(`cat.${i}` as MessageKey);
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
  useT();
  return (
    <span class="cat">
      <img
        class="cat-gif"
        src={reactionAsset(id)}
        alt=""
        aria-hidden="true"
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
      />
      {caption ? <span class="cat-cap">{catCaption(id)}</span> : null}
    </span>
  );
}
