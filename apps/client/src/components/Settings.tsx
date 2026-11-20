/** Settings entry points (H12): the gear, the prefs hook and the panel host shared by Home and the game screen. */

import type { Profile } from "@cd/protocol";
import { useEffect, useState } from "preact/hooks";
import { t, useT } from "../i18n";
import { getPrefs, onPrefs, type Prefs } from "../prefs";
import { HowToPlay } from "./HowToPlay";
import { GearIcon } from "./icons";
import { Shortcuts } from "./Shortcuts";

export type Panel = "settings" | "help" | "keys" | "profile" | null;

export function usePrefs(): Prefs {
  const [p, setP] = useState(getPrefs);
  useEffect(() => {
    setP(getPrefs());
    return onPrefs(setP);
  }, []);
  return p;
}

export function GearButton({ onClick }: { onClick: () => void }) {
  useT();
  return (
    <button type="button" class="btn st-gear" aria-label={t("settings.gear")} onClick={onClick}>
      <GearIcon />
    </button>
  );
}

/**
 * Renders whichever panel is open; the owner keeps the `panel` state. The settings sheet is a lazy
 * chunk (SettingsPanel.tsx) so its code stays out of the initial bundle.
 */
export function Panels({
  panel,
  onPanel,
  profile,
  name,
  editable,
  onProfile,
}: {
  panel: Panel;
  onPanel: (p: Panel) => void;
  profile?: Profile;
  name?: string;
  editable?: boolean;
  onProfile?: (profile: Profile) => void;
}) {
  const [Sheet, setSheet] = useState<typeof import("./SettingsPanel").Settings | null>(null);
  const [ProfileSheet, setProfileSheet] = useState<
    typeof import("./ProfilePanel").ProfilePanel | null
  >(null);
  useEffect(() => {
    if (panel === "settings") import("./SettingsPanel").then((m) => setSheet(() => m.Settings));
    if (panel === "profile")
      import("./ProfilePanel").then((m) => setProfileSheet(() => m.ProfilePanel));
  }, [panel]);
  if (panel === "profile")
    return ProfileSheet ? (
      <ProfileSheet
        profile={profile}
        name={name ?? ""}
        onClose={() => onPanel(null)}
        onPanel={onPanel}
        editable={editable}
        onProfile={onProfile}
      />
    ) : null;
  if (panel === "settings")
    return Sheet ? <Sheet onClose={() => onPanel(null)} onPanel={onPanel} /> : null;
  if (panel === "help") return <HowToPlay onClose={() => onPanel(null)} />;
  if (panel === "keys") return <Shortcuts onClose={() => onPanel(null)} />;
  return null;
}
