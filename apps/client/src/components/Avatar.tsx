/** Round cat GIF with a ring in the player's profile colour (T-NEW-13). Cosmetic: name stays as text. */
import type { Profile } from "@cd/protocol";
import "../styles/avatar.css";
import { reactionAsset } from "./CatReaction";

export function Avatar({ profile, size = 24 }: { profile: Profile | undefined; size?: number }) {
  if (!profile) return null;
  return (
    <span class={`av pc-${profile.color}`} aria-hidden="true">
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
