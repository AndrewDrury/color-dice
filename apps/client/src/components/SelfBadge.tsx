import type { Profile } from "@cd/protocol";
import { t, useT } from "../i18n";
import { AvatarHover } from "./AvatarHover";

export function SelfBadge({
  profile,
  name,
  onClick,
}: {
  profile: Profile | undefined;
  name: string;
  onClick?: () => void;
}) {
  useT();
  if (!profile) return null;
  return (
    <span class="self-badge" title={t("waiting.you")}>
      <AvatarHover profile={profile} name={name} size={38} self onActivate={onClick} />
    </span>
  );
}
