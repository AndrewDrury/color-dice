/** Settings sheet (H12) and the panel host shared by Home and the game screen. */
import { useEffect, useState } from "preact/hooks";
import { hapticsSupported } from "../fx/haptics";
import { getPrefs, type MotionPref, onPrefs, type Prefs, setPrefs, type ThemePref } from "../prefs";
import { BottomSheet } from "./BottomSheet";
import { HowToPlay } from "./HowToPlay";
import { GearIcon } from "./icons";
import { Shortcuts } from "./Shortcuts";

export type Panel = "settings" | "help" | "keys" | null;

export function usePrefs(): Prefs {
  const [p, setP] = useState(getPrefs);
  useEffect(() => {
    setP(getPrefs());
    return onPrefs(setP);
  }, []);
  return p;
}

function Toggle({
  label,
  on,
  onChange,
}: {
  label: string;
  on: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div class="st-row">
      <span>{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={on ? "true" : "false"}
        aria-label={label}
        class={`st-switch${on ? " is-on" : ""}`}
        onClick={() => onChange(!on)}
      >
        <span class="st-knob" />
      </button>
    </div>
  );
}

function Segmented<T extends string>(p: {
  label: string;
  value: T;
  options: readonly { value: T; text: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div class="st-row">
      <span aria-hidden="true">{p.label}</span>
      <fieldset class="st-seg" aria-label={p.label}>
        {p.options.map((o) => (
          <button
            key={o.value}
            type="button"
            aria-pressed={p.value === o.value ? "true" : "false"}
            class={p.value === o.value ? "is-on" : ""}
            onClick={() => p.onChange(o.value)}
          >
            {o.text}
          </button>
        ))}
      </fieldset>
    </div>
  );
}

const MOTIONS = [
  { value: "system", text: "System" },
  { value: "reduced", text: "Reduced" },
  { value: "full", text: "Full" },
] as const satisfies readonly { value: MotionPref; text: string }[];
const THEMES = [
  { value: "system", text: "System" },
  { value: "light", text: "Light" },
  { value: "dark", text: "Dark" },
] as const satisfies readonly { value: ThemePref; text: string }[];

export function Settings({
  onClose,
  onPanel,
}: {
  onClose: () => void;
  onPanel: (p: Panel) => void;
}) {
  const prefs = usePrefs();
  return (
    <BottomSheet title="Settings" onClose={onClose}>
      <Toggle label="Sound" on={prefs.sound} onChange={(v) => setPrefs({ sound: v })} />
      {hapticsSupported() ? (
        <Toggle label="Haptics" on={prefs.haptics} onChange={(v) => setPrefs({ haptics: v })} />
      ) : null}
      <Segmented
        label="Motion"
        value={prefs.motion}
        options={MOTIONS}
        onChange={(v) => setPrefs({ motion: v })}
      />
      <Segmented
        label="Theme"
        value={prefs.theme}
        options={THEMES}
        onChange={(v) => setPrefs({ theme: v })}
      />
      <button type="button" class="btn" onClick={() => onPanel("help")}>
        How to play
      </button>
      <button type="button" class="btn only-desktop" onClick={() => onPanel("keys")}>
        Keyboard shortcuts
      </button>
    </BottomSheet>
  );
}

export function GearButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" class="btn st-gear" aria-label="Settings" onClick={onClick}>
      <GearIcon />
    </button>
  );
}

/** Renders whichever panel is open; the owner keeps the `panel` state. */
export function Panels({ panel, onPanel }: { panel: Panel; onPanel: (p: Panel) => void }) {
  if (panel === "settings") return <Settings onClose={() => onPanel(null)} onPanel={onPanel} />;
  if (panel === "help") return <HowToPlay onClose={() => onPanel(null)} />;
  if (panel === "keys") return <Shortcuts onClose={() => onPanel(null)} />;
  return null;
}
