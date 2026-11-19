/** Static GIF asset and meme caption for an allow-listed reaction id. */
import type { Reaction } from "@cd/protocol";

const REACTION_ASSETS: Partial<Record<Reaction, string>> = {
  "angry-cat-disgusted-face-gif": "Angry Cat Disgusted Face GIF.gif",
  "bruce-lee-fighting-gif": "Bruce Lee Fighting GIF.gif",
  "cat-dancing-gif-by-unscreen": "Cat Dancing GIF by Unscreen.gif",
  "cat-emoji-gif": "Cat Emoji GIF.gif",
  "cat-gif-1": "Cat GIF (1).gif",
  "cat-gif": "Cat GIF.gif",
  "cat-holding-sword-gif": "Cat Holding Sword GIF.gif",
  "cat-laugh-gif": "Cat Laugh GIF.gif",
  "cat-meme-gif-1": "Cat Meme GIF (1).gif",
  "cat-meme-gif-2": "Cat Meme GIF (2).gif",
  "cat-meme-gif": "Cat Meme GIF.gif",
  "cat-peeking-gif": "Cat Peeking GIF.gif",
  "cat-reaction-gif-gif": "Cat Reaction Gif GIF.gif",
  "cat-screaming-gif": "Cat Screaming GIF.gif",
  "dance-cat-gif": "Dance Cat GIF.gif",
  "happy-black-cat-gif-by-sou-eu-na-vida": "Happy Black Cat GIF by Sou Eu Na Vida.gif",
  "in-love-cat-gif": "In Love Cat GIF.gif",
  "kitty-cute-cat-gif": "Kitty Cute Cat GIF.gif",
  "mad-the-internet-gif-by-moodman": "Mad The Internet GIF by MOODMAN.gif",
  "shocked-cat-gif": "Shocked Cat GIF.gif",
  "surprised-cat-quedado-gif": "Surprised Cat Quedado GIF.gif",
};

export const REACTION_LABELS: Record<Reaction, string> = {
  "angry-cat-disgusted-face-gif": "angry cat",
  "bruce-lee-fighting-gif": "fighting",
  "cat-dancing-gif-by-unscreen": "dancing cat",
  "cat-emoji-gif": "cat emoji",
  "cat-gif-1": "cat",
  "cat-gif": "cat gif",
  "cat-holding-sword-gif": "sword cat",
  "cat-laugh-gif": "laugh",
  "cat-meme-gif-1": "cat meme",
  "cat-meme-gif-2": "cat meme two",
  "cat-meme-gif": "cat meme",
  "cat-peeking-gif": "peeking",
  "cat-reaction-gif-gif": "cat reaction",
  "cat-screaming-gif": "screaming",
  "dance-cat-gif": "dance cat",
  "happy-black-cat-gif-by-sou-eu-na-vida": "happy cat",
  "in-love-cat-gif": "in love",
  "kitty-cute-cat-gif": "cute kitty",
  "mad-the-internet-gif-by-moodman": "mad the internet",
  "shocked-cat-gif": "shocked",
  "surprised-cat-quedado-gif": "surprised",
};

export function reactionAsset(id: Reaction): string {
  const asset = REACTION_ASSETS[id];
  return asset ? `/reactions/${encodeURIComponent(asset)}` : "/reactions/mad-cat.jpg";
}

/** Translated caption for a reaction id; unknown ids fall back to the id itself. */
export function catCaption(id: string): string {
  const labels: Record<string, string> = REACTION_LABELS;
  if (labels[id]) return labels[id];
  return id;
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
