import type { Profile } from "@cd/protocol";
import { historyStats, useHistoryTotals } from "../history";
import { t, useT } from "../i18n";
import { AvatarHover } from "./AvatarHover";
import { ProfileField } from "./ProfileField";

export function ProfileSummary({
  profile,
  name,
  editable,
  onProfile,
}: {
  profile: Profile | undefined;
  name: string;
  editable?: boolean;
  onProfile?: (profile: Profile) => void;
}) {
  useT();
  useHistoryTotals();
  const stats = historyStats();
  return (
    <div class="profile-summary stack">
      <header class="profile-header">
        {profile ? <AvatarHover profile={profile} name={name} size={72} self /> : null}
        <strong class="profile-name name-clip" title={name}>
          {name}
        </strong>
      </header>
      {editable && profile && onProfile ? (
        <ProfileField value={profile} onChange={onProfile} />
      ) : null}
      <section class="profile-record" aria-label={t("profile.recordAria")}>
        <h3>{t("profile.record")}</h3>
        <dl class="profile-stats">
          <div>
            <dt>{t("profile.recordWtl")}</dt>
            <dd>
              {stats.wins}–{stats.ties}–{stats.losses}
            </dd>
          </div>
          <div>
            <dt>{t("profile.winPercent")}</dt>
            <dd>{stats.winPercent}%</dd>
          </div>
          <div>
            <dt>{t("profile.games")}</dt>
            <dd>{stats.gamesPlayed}</dd>
          </div>
          <div>
            <dt>{t("profile.streak")}</dt>
            <dd>{stats.streakResult ? `${stats.streakResult}${stats.streak}` : "—"}</dd>
          </div>
          <div>
            <dt>{t("profile.bestScore")}</dt>
            <dd>{stats.bestScore}</dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
