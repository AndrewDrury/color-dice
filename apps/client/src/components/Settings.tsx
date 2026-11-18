/** Settings sheet (H12) and the panel host shared by Home and the game screen. */
import { useEffect, useState } from "preact/hooks";
import { hapticsSupported } from "../fx/haptics";
import { clearHistory, exportTransferCode, importTransferCode, useHistoryTotals } from "../history";
import { getPrefs, type MotionPref, onPrefs, type Prefs, setPrefs, type ThemePref } from "../prefs";
import { clearRemembered, getRemembered } from "../remembered";
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

function RecordSection() {
  const record = useHistoryTotals();
  const [note, setNote] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const total = record.wins + record.losses;
  return (
    <section class="stack" aria-label="Your record">
      <div class="st-row">
        <span>
          Your record: {record.wins} W – {record.losses} L
        </span>
        {total > 0 ? (
          <button
            type="button"
            class="btn"
            onClick={() => {
              clearHistory();
              setNote("Record reset.");
            }}
          >
            Reset record
          </button>
        ) : null}
      </div>
      {total > 0 ? (
        <button
          type="button"
          class="btn"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(exportTransferCode());
              setNote("Transfer code copied.");
            } catch {
              setNote("Could not copy. Select and copy the code below instead.");
              setCode(exportTransferCode());
            }
          }}
        >
          Copy transfer code
        </button>
      ) : null}
      <label class="stack">
        <span>Import transfer code</span>
        <input
          class="input"
          value={code}
          autocomplete="off"
          spellcheck={false}
          onInput={(e) => setCode((e.currentTarget as HTMLInputElement).value)}
        />
      </label>
      <button
        type="button"
        class="btn"
        onClick={() => {
          const r = importTransferCode(code);
          if (r.ok) {
            setNote(`Imported ${r.added} new game${r.added === 1 ? "" : "s"}.`);
            setCode("");
          } else setNote(r.reason);
        }}
      >
        Import
      </button>
      {note ? <p role="status">{note}</p> : null}
    </section>
  );
}

function SavedInfoSection() {
  const [saved, setSaved] = useState(getRemembered);
  const [note, setNote] = useState<string | null>(null);
  const hasAny = !!(saved.name || saved.roomName || saved.password || saved.rooms.length);
  return (
    <section class="stack" aria-label="Saved info">
      <h3>Saved info</h3>
      {hasAny ? (
        <ul class="stack" style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {saved.name ? <li>Name: {saved.name}</li> : null}
          {saved.roomName ? <li>Room name: {saved.roomName}</li> : null}
          {saved.password || saved.rooms.length ? <li>Room password: saved</li> : null}
        </ul>
      ) : (
        <p class="muted">Nothing saved on this device.</p>
      )}
      {hasAny ? (
        <button
          type="button"
          class="btn"
          onClick={() => {
            clearRemembered();
            setSaved(getRemembered());
            setNote("Saved info cleared.");
          }}
        >
          Clear saved info
        </button>
      ) : null}
      {note ? <p role="status">{note}</p> : null}
    </section>
  );
}

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
      <Toggle
        label="Show chat messages"
        on={prefs.showChat}
        onChange={(v) => setPrefs({ showChat: v })}
      />
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
      <RecordSection />
      <SavedInfoSection />
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
