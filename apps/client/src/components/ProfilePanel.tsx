import type { Profile } from "@cd/protocol";
import { t, useT } from "../i18n";
import { BottomSheet } from "./BottomSheet";
import { HistoryList } from "./HistoryList";
import { ProfileSummary } from "./ProfileSummary";
import type { Panel } from "./Settings";
import { ThemePicker } from "./ThemePicker";
import "../styles/profile.css";

export function ProfilePanel({
  profile,
  name,
  onClose,
  onPanel,
  editable,
  onProfile,
}: {
  profile: Profile | undefined;
  name: string;
  onClose: () => void;
  onPanel: (panel: Panel) => void;
  editable?: boolean;
  onProfile?: (profile: Profile) => void;
}) {
  useT();
  return (
    <BottomSheet title={t("profile.panelTitle")} onClose={onClose}>
      <ProfileSummary profile={profile} name={name} editable={editable} onProfile={onProfile} />
      <ThemePicker legend={t("settings.theme")} />
      <button type="button" class="btn" onClick={() => onPanel("settings")}>
        {t("profile.settings")}
      </button>
      <HistoryList />
      <p class="muted profile-local">{t("profile.localOnly")}</p>
    </BottomSheet>
  );
}
