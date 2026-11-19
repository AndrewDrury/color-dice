/** Static GIF asset and meme caption for an allow-listed reaction id. */
import type { ProfileCat, Reaction } from "@cd/protocol";

/** Allow-listed cat GIFs in picker order (grouped by mood): id, file in /reactions, caption. */
const CATS: readonly (readonly [Reaction, string, string])[] = [
  [
    "happy-black-cat-gif-by-sou-eu-na-vida",
    "Happy Black Cat GIF by Sou Eu Na Vida.gif",
    "happy cat",
  ],
  ["in-love-cat-gif", "In Love Cat GIF.gif", "in love"],
  ["kitty-cute-cat-gif", "Kitty Cute Cat GIF.gif", "cute kitty"],
  ["cat-dancing-gif-by-unscreen", "Cat Dancing GIF by Unscreen.gif", "dancing cat"],
  ["dance-cat-gif", "Dance Cat GIF.gif", "dance cat"],
  ["cat-laugh-gif", "Cat Laugh GIF.gif", "laugh"],
  ["cat-meme-gif", "Cat Meme GIF.gif", "cat meme"],
  ["cat-meme-gif-1", "Cat Meme GIF (1).gif", "cat meme"],
  ["cat-meme-gif-2", "Cat Meme GIF (2).gif", "cat meme two"],
  ["cat-reaction-gif-gif", "Cat Reaction Gif GIF.gif", "cat reaction"],
  ["surprised-cat-quedado-gif", "Surprised Cat Quedado GIF.gif", "surprised"],
  ["shocked-cat-gif", "Shocked Cat GIF.gif", "shocked"],
  ["cat-screaming-gif", "Cat Screaming GIF.gif", "screaming"],
  ["angry-cat-disgusted-face-gif", "Angry Cat Disgusted Face GIF.gif", "angry cat"],
  ["mad-the-internet-gif-by-moodman", "Mad The Internet GIF by MOODMAN.gif", "mad the internet"],
  ["bruce-lee-fighting-gif", "Bruce Lee Fighting GIF.gif", "fighting"],
  ["cat-holding-sword-gif", "Cat Holding Sword GIF.gif", "sword cat"],
  ["cat-peeking-gif", "Cat Peeking GIF.gif", "peeking"],
  ["cat-gif", "Cat GIF.gif", "cat gif"],
  ["cat-gif-1", "Cat GIF (1).gif", "cat"],
  ["cat-emoji-gif", "Cat Emoji GIF.gif", "cat emoji"],
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
  return catRow(id)?.[2] ?? id;
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
