/** Dev-only Dice Lab (H4): tune the roll feel and take screenshots. Never in production builds. */
import type { Color } from "@cd/engine";
import { useEffect, useRef, useState } from "preact/hooks";
import { DiceTray, type TrayRoll } from "../components/DiceTray";
import type { Face } from "../fx/dice-math";
import { useReducedMotion } from "../fx/motion";
import { unlockAudio } from "../fx/sound";
import { getPrefs, onPrefs, setPrefs } from "../prefs";
import "../styles/dice.css";

const COLORS: Color[] = ["RED", "YELLOW", "GREEN", "BLUE"];
const d6 = (): Face => (1 + Math.floor(Math.random() * 6)) as Face;

function randomRoll(locked: Color[]): TrayRoll {
  const colored: Partial<Record<Color, Face>> = {};
  for (const c of COLORS) if (!locked.includes(c)) colored[c] = d6();
  return { white: [d6(), d6()], colored };
}

export function DiceLab() {
  const [turn, setTurn] = useState(1);
  const [roll, setRoll] = useState<TrayRoll | null>(null);
  const [locked, setLocked] = useState<Color[]>([]);
  const [latency, setLatency] = useState(10);
  const [failNext, setFailNext] = useState(false);
  const [failed, setFailed] = useState(0);
  const [highlight, setHighlight] = useState(false);
  const [prefs, setP] = useState(getPrefs);
  const [log, setLog] = useState<string[]>([]);
  const reduced = useReducedMotion();
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    unlockAudio();
    const off = onPrefs(setP);
    return () => {
      off();
      if (pending.current) clearTimeout(pending.current);
    };
  }, []);

  const note = (s: string) =>
    setLog((l) => [`${new Date().toLocaleTimeString()} ${s}`, ...l].slice(0, 8));

  /** Fake server: answer the roll after `latency` ms (or fail). */
  const onRoll = () => {
    const t0 = performance.now();
    note(`roll sent (latency ${latency} ms${failNext ? ", will fail" : ""})`);
    pending.current = setTimeout(() => {
      if (failNext) {
        setFailNext(false);
        setFailed((n) => n + 1);
        note("error: dice ease back");
        return;
      }
      setTurn((t) => t + 1);
      setRoll(randomRoll(locked));
      note(`result after ${Math.round(performance.now() - t0)} ms`);
    }, latency);
  };

  /** Someone else rolled: the view arrives with no local throw. */
  const otherRoll = () => {
    setTurn((t) => t + 1);
    setRoll(randomRoll(locked));
    note("another player rolled");
  };

  const lockNext = () => {
    const next = COLORS.find((c) => !locked.includes(c));
    if (next) setLocked([...locked, next]);
    else setLocked([]);
  };

  const toggleTheme = () => {
    const html = document.documentElement;
    const dark =
      html.dataset.scheme === "dark" ||
      (!html.dataset.scheme && matchMedia("(prefers-color-scheme: dark)").matches);
    html.dataset.scheme = dark ? "light" : "dark";
  };

  const hl =
    highlight && roll ? { white: 0 as const, color: COLORS.find((c) => roll.colored[c]) } : null;

  return (
    <main
      class="lab"
      style={{ display: "grid", gap: "16px", padding: "16px", maxWidth: "760px", margin: "0 auto" }}
    >
      <h1>Dice Lab</h1>
      <DiceTray
        roll={roll}
        lockedColors={locked}
        canRoll={true}
        onRoll={onRoll}
        turnKey={{ code: "LAB00", turnNumber: roll ? turn : null }}
        highlight={hl}
        rollFailed={failed}
        onLanded={() => note("landed")}
      />
      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
        <button type="button" onClick={() => setLatency(10)}>
          Latency 10 ms
        </button>
        <button type="button" onClick={() => setLatency(400)}>
          Latency 400 ms
        </button>
        <button type="button" onClick={() => setLatency(1500)}>
          Latency 1500 ms
        </button>
        <button type="button" onClick={() => setLatency(4000)}>
          Latency 4 s
        </button>
        <button type="button" onClick={() => setFailNext(true)}>
          Fail next roll
        </button>
        <button type="button" onClick={otherRoll}>
          Other player rolls
        </button>
        <button type="button" onClick={lockNext}>
          Lock a colour
        </button>
        <button type="button" onClick={() => setHighlight(!highlight)}>
          Toggle helper highlight
        </button>
        <button type="button" onClick={() => setPrefs({ motion: reduced ? "full" : "reduced" })}>
          Motion: {reduced ? "reduced" : "full"}
        </button>
        <button type="button" onClick={toggleTheme}>
          Toggle theme
        </button>
        <button type="button" onClick={() => setPrefs({ sound: !prefs.sound })}>
          {prefs.sound ? "Mute" : "Unmute"}
        </button>
        <button type="button" onClick={() => setPrefs({ haptics: !prefs.haptics })}>
          Haptics {prefs.haptics ? "on" : "off"}
        </button>
      </div>
      <p>
        Latency {latency} ms. Hold Roll (or Space) to shake. Locked: {locked.join(", ") || "none"}.
      </p>
      <ol style={{ fontSize: "14px", margin: 0 }}>
        {log.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ol>
    </main>
  );
}
