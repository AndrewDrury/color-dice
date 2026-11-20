/** Round cat GIF with a ring in the player's profile colour (T-NEW-13, T-NEW-15). Cosmetic: name stays as text. */
import type { Profile } from "@cd/protocol";
import "../styles/avatar.css";
import { reactionAsset } from "./CatReaction";

/** Ring width for an avatar of `size` px: ~5.5 % of the size, never under 2 px (4 px at 80 px). */
export function ringWidth(size: number): number {
  return Math.max(2, Math.round(size * 0.055));
}

export function Avatar({
  profile,
  size = 24,
  class: cls,
}: {
  profile: Profile | undefined;
  size?: number;
  class?: string;
}) {
  if (!profile) return null;
  return (
    <span
      class={`av pc-${profile.color}${cls ? ` ${cls}` : ""}`}
      style={{ "--av-ring": `${ringWidth(size)}px` }}
      aria-hidden="true"
    >
      <img
        src={reactionAsset(profile.cat)}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
      />
    </span>
  );
}
