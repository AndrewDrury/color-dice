/** Settings sheet (H12) and the panel host shared by Home and the game screen. */
import { useEffect, useState } from "preact/hooks";
import { hapticsSupported } from "../fx/haptics";
import { clearHistory, exportTransferCode, importTransferCode, useHistoryTotals } from "../history";
import { LANGUAGE_NAMES, LOCALES, type MessageKey, setLanguage, t, tn, useT } from "../i18n";
import {
  getPrefs,
  type LanguagePref,
  type MotionPref,
  onPrefs,
  type Prefs,
  setPrefs,
  type ThemePref,
} from "../prefs";
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
  /** Label above the control instead of beside it (the Theme + Language pair). */
  stacked?: boolean;
}) {
  return (
    <div class={p.stacked ? "st-col" : "st-row"}>
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

const MOTIONS: readonly { value: MotionPref; key: MessageKey }[] = [
  { value: "system", key: "settings.system" },
  { value: "reduced", key: "settings.reduced" },
  { value: "full", key: "settings.full" },
];
const THEMES: readonly { value: ThemePref; key: MessageKey }[] = [
  { value: "system", key: "settings.system" },
  { value: "light", key: "settings.light" },
  { value: "dark", key: "settings.dark" },
];
const options = <V extends string>(list: readonly { value: V; key: MessageKey }[]) =>
  list.map((o) => ({ value: o.value, text: t(o.key) }));

/** Auto + each language in its own name (never translated). */
const languageOptions = (): { value: LanguagePref; text: string }[] => [
  { value: "auto", text: t("settings.auto") },
  ...LOCALES.map((l) => ({ value: l, text: LANGUAGE_NAMES[l] })),
];

function RecordSection() {
  useT();
  const record = useHistoryTotals();
  const [note, setNote] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const total = record.wins + record.ties + record.losses;
  return (
    <section class="stack" aria-label={t("settings.recordAria")}>
      <div class="st-row">
        <span>{t("home.record", record)}</span>
        {total > 0 ? (
          <button
            type="button"
            class="btn"
            onClick={() => {
              clearHistory();
              setNote(t("settings.recordCleared"));
            }}
          >
            {t("settings.recordReset")}
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
              setNote(t("settings.copied"));
            } catch {
              setNote(t("settings.copyFailed"));
              setCode(exportTransferCode());
            }
          }}
        >
          {t("settings.copyCode")}
        </button>
      ) : null}
      <label class="stack">
        <span>{t("settings.importLabel")}</span>
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
            setNote(tn("settings.imported", r.added));
            setCode("");
          } else setNote(t(r.reason === "empty" ? "settings.importEmpty" : "settings.importBad"));
        }}
      >
        {t("settings.import")}
      </button>
      {note ? <p role="status">{note}</p> : null}
    </section>
  );
}

function SavedInfoSection() {
  useT();
  const [saved, setSaved] = useState(getRemembered);
  const [note, setNote] = useState<string | null>(null);
  const hasAny = !!(saved.name || saved.roomName || saved.password || saved.rooms.length);
  return (
    <section class="stack" aria-label={t("settings.saved")}>
      <h3>{t("settings.saved")}</h3>
      {hasAny ? (
        <ul class="stack" style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {saved.name ? <li>{t("settings.savedName", { value: saved.name })}</li> : null}
          {saved.roomName ? <li>{t("settings.savedRoom", { value: saved.roomName })}</li> : null}
          {saved.password || saved.rooms.length ? <li>{t("settings.savedPassword")}</li> : null}
        </ul>
      ) : (
        <p class="muted">{t("settings.savedNone")}</p>
      )}
      {hasAny ? (
        <button
          type="button"
          class="btn"
          onClick={() => {
            clearRemembered();
            setSaved(getRemembered());
            setNote(t("settings.savedCleared"));
          }}
        >
          {t("settings.savedClear")}
        </button>
      ) : null}
      {note ? <p role="status">{note}</p> : null}
    </section>
  );
}

/** K4.6: bring the coaching hints back after "Don't show hints" / "Got it". */
function HintsSection() {
  useT();
  const [note, setNote] = useState<string | null>(null);
  return (
    <section class="stack" aria-label={t("settings.hints")}>
      <button
        type="button"
        class="btn"
        onClick={() => {
          setPrefs({ hintsOff: false, seenHints: [] });
          setNote(t("settings.hintsOn"));
        }}
      >
        {t("settings.hintsShow")}
      </button>
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
  useT();
  return (
    <BottomSheet title={t("settings.title")} onClose={onClose}>
      <Toggle
        label={t("settings.sound")}
        on={prefs.sound}
        onChange={(v) => setPrefs({ sound: v })}
      />
      <Toggle
        label={t("settings.showChat")}
        on={prefs.showChat}
        onChange={(v) => setPrefs({ showChat: v })}
      />
      {hapticsSupported() ? (
        <Toggle
          label={t("settings.haptics")}
          on={prefs.haptics}
          onChange={(v) => setPrefs({ haptics: v })}
        />
      ) : null}
      <Segmented
        label={t("settings.motion")}
        value={prefs.motion}
        options={options(MOTIONS)}
        onChange={(v) => setPrefs({ motion: v })}
      />
      <div class="st-pair">
        <Segmented
          stacked
          label={t("settings.theme")}
          value={prefs.theme}
          options={options(THEMES)}
          onChange={(v) => setPrefs({ theme: v })}
        />
        <Segmented
          stacked
          label={t("settings.language")}
          value={prefs.language}
          options={languageOptions()}
          onChange={(v) => void setLanguage(v)}
        />
      </div>
      <RecordSection />
      <HintsSection />
      <SavedInfoSection />
      <button type="button" class="btn" onClick={() => onPanel("help")}>
        {t("settings.help")}
      </button>
      <button type="button" class="btn only-desktop" onClick={() => onPanel("keys")}>
        {t("settings.keys")}
      </button>
    </BottomSheet>
  );
}

export function GearButton({ onClick }: { onClick: () => void }) {
  useT();
  return (
    <button type="button" class="btn st-gear" aria-label={t("settings.gear")} onClick={onClick}>
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
