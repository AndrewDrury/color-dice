/**
 * Synthesised sound (H8): one shared AudioContext, no audio files.
 * voices → master gain (0.6) → compressor (gentle limiter) → destination.
 * Every call is a no-op when muted or when the browser has no Web Audio (tests, old browsers).
 */
import { getPrefs } from "../prefs";

export type SoundName =
  | "rattle"
  | "throw"
  | "land"
  | "pick"
  | "mark"
  | "yourTurn"
  | "reveal"
  | "lock"
  | "penalty"
  | "error"
  | "join"
  | "fanfare"
  | "gameEnd"
  | "chat";

export interface PlayOptions {
  /** Pitch shift in semitones (e.g. per die for `land`). */
  semitones?: number;
}

type AudioCtor = new () => AudioContext;

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
let unlockInstalled = false;
let rattleTimer: ReturnType<typeof setTimeout> | null = null;

function audioCtor(): AudioCtor | null {
  const g = globalThis as unknown as { AudioContext?: AudioCtor; webkitAudioContext?: AudioCtor };
  return g.AudioContext ?? g.webkitAudioContext ?? null;
}

function muted(): boolean {
  return !getPrefs().sound;
}

/** Lazily create the context. Returns null when muted or unsupported. */
function context(): AudioContext | null {
  if (muted()) return null;
  if (ctx) return ctx;
  const AC = audioCtor();
  if (!AC) return null;
  try {
    const c = new AC();
    const gain = c.createGain();
    gain.gain.value = 0.6;
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -12;
    comp.ratio.value = 8;
    gain.connect(comp);
    comp.connect(c.destination);
    ctx = c;
    master = gain;
  } catch {
    ctx = null;
    master = null;
  }
  return ctx;
}

function resume(): void {
  if (ctx && ctx.state === "suspended") ctx.resume().catch(() => {});
}

/**
 * Install one-time listeners: the first pointerdown/keydown (a user gesture, needed on iOS)
 * creates and resumes the context. Returning to the tab resumes it again.
 */
export function unlockAudio(): void {
  if (unlockInstalled || typeof window === "undefined") return;
  unlockInstalled = true;
  const onGesture = () => {
    if (!context()) return; // muted or unsupported: try again on a later gesture
    resume();
    window.removeEventListener("pointerdown", onGesture, true);
    window.removeEventListener("keydown", onGesture, true);
  };
  window.addEventListener("pointerdown", onGesture, true);
  window.addEventListener("keydown", onGesture, true);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") resume();
  });
}

function vary(v: number, amount = 0.06): number {
  return v * (1 + (Math.random() * 2 - 1) * amount);
}

function noise(c: AudioContext): AudioBuffer {
  if (noiseBuf) return noiseBuf;
  const buf = c.createBuffer(1, c.sampleRate, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  noiseBuf = buf;
  return buf;
}

interface ToneSpec {
  freq: number;
  to?: number;
  at?: number;
  dur: number;
  type?: OscillatorType;
  gain?: number;
  attack?: number;
  shaper?: boolean;
}

function tone(c: AudioContext, out: AudioNode, s: ToneSpec): void {
  const t0 = c.currentTime + (s.at ?? 0);
  const osc = c.createOscillator();
  osc.type = s.type ?? "sine";
  osc.frequency.setValueAtTime(s.freq, t0);
  if (s.to) osc.frequency.exponentialRampToValueAtTime(s.to, t0 + s.dur);
  const g = c.createGain();
  const peak = s.gain ?? 0.3;
  const attack = s.attack ?? 0.004;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + s.dur);
  let node: AudioNode = osc;
  if (s.shaper) {
    const ws = c.createWaveShaper();
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) curve[i] = Math.tanh(((i / 255) * 2 - 1) * 2.5);
    ws.curve = curve;
    osc.connect(ws);
    node = ws;
  }
  node.connect(g);
  g.connect(out);
  osc.start(t0);
  osc.stop(t0 + s.dur + 0.02);
}

interface NoiseSpec {
  at?: number;
  dur: number;
  filter: BiquadFilterType;
  freq: number;
  to?: number;
  q?: number;
  gain?: number;
}

function burst(c: AudioContext, out: AudioNode, s: NoiseSpec): void {
  const t0 = c.currentTime + (s.at ?? 0);
  const src = c.createBufferSource();
  src.buffer = noise(c);
  const f = c.createBiquadFilter();
  f.type = s.filter;
  f.frequency.setValueAtTime(s.freq, t0);
  if (s.to) f.frequency.exponentialRampToValueAtTime(s.to, t0 + s.dur);
  f.Q.value = s.q ?? 1;
  const g = c.createGain();
  g.gain.setValueAtTime(s.gain ?? 0.3, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + s.dur);
  src.connect(f);
  f.connect(g);
  g.connect(out);
  src.start(t0, Math.random() * 0.8);
  src.stop(t0 + s.dur + 0.02);
}

const notes = (c: AudioContext, out: AudioNode, freqs: number[], gap: number, dur: number) =>
  freqs.forEach((freq, i) => {
    tone(c, out, { freq, at: i * gap, dur, type: "triangle", gain: 0.18, attack: 0.008 });
  });

type Recipe = (c: AudioContext, out: AudioNode, k: number) => void;

/** Tuned in the Dice Lab. `k` is the pitch factor (±6 % variance, plus semitones). */
const RECIPES: Record<SoundName, Recipe> = {
  rattle: (c, out, k) => {
    const n = 2 + Math.floor(Math.random() * 2);
    for (let i = 0; i < n; i++) {
      burst(c, out, {
        at: i * vary(0.018, 0.4),
        dur: 0.025,
        filter: "bandpass",
        freq: vary(3200 * k, 0.2),
        q: 6,
        gain: 0.35,
      });
    }
  },
  throw: (c, out, k) =>
    burst(c, out, {
      dur: 0.18,
      filter: "bandpass",
      freq: 800 * k,
      to: 3000 * k,
      q: 1.5,
      gain: 0.25,
    }),
  land: (c, out, k) => {
    tone(c, out, { freq: vary(210) * k, to: 120 * k, dur: 0.06, gain: 0.5, attack: 0.002 });
    burst(c, out, { dur: 0.015, filter: "highpass", freq: 2000, gain: 0.25 });
  },
  pick: (c, out, k) => tone(c, out, { freq: 880 * k, dur: 0.04, gain: 0.15, attack: 0.01 }),
  mark: (c, out, k) => {
    burst(c, out, { dur: 0.07, filter: "bandpass", freq: 3000 * k, q: 2, gain: 0.25 });
    burst(c, out, { at: 0.09, dur: 0.07, filter: "bandpass", freq: 3300 * k, q: 2, gain: 0.25 });
  },
  yourTurn: (c, out, k) => notes(c, out, [660 * k, 990 * k], 0.12, 0.12),
  reveal: (c, out, k) => notes(c, out, [523 * k, 659 * k, 784 * k], 0.05, 0.12),
  lock: (c, out, k) => {
    tone(c, out, { freq: 110 * k, dur: 0.12, gain: 0.5 });
    tone(c, out, { freq: 1320 * k, at: 0.1, dur: 0.3, type: "triangle", gain: 0.15 });
  },
  penalty: (c, out, k) =>
    tone(c, out, { freq: 300 * k, to: 150 * k, dur: 0.22, gain: 0.25, shaper: true }),
  error: (c, out) => {
    tone(c, out, { freq: 220, dur: 0.05, type: "square", gain: 0.05 });
    tone(c, out, { freq: 220, at: 0.08, dur: 0.05, type: "square", gain: 0.05 });
  },
  join: (c, out, k) => tone(c, out, { freq: 740 * k, dur: 0.06, gain: 0.15 }),
  fanfare: (c, out, k) => {
    notes(c, out, [523 * k, 659 * k, 784 * k], 0.09, 0.12);
    tone(c, out, { freq: 1047 * k, at: 0.27, dur: 0.4, type: "triangle", gain: 0.18 });
  },
  gameEnd: (c, out, k) => notes(c, out, [659 * k, 523 * k], 0.16, 0.2),
  /** Very quiet blip for incoming chat text (I3). */
  chat: (c, out, k) => tone(c, out, { freq: 880 * k, dur: 0.05, gain: 0.05 }),
};

export function play(name: SoundName, opts: PlayOptions = {}): void {
  const c = context();
  if (!c || !master) return;
  resume();
  const k = vary(1) * 2 ** ((opts.semitones ?? 0) / 12);
  try {
    RECIPES[name](c, master, k);
  } catch {
    // A failing voice must never break the game.
  }
}

// ---------- Winner jingles, drum-roll and laugh (K5.5, K5.7): original, synthesised, no samples ----------

export const JINGLES = ["kazoo", "slide", "chiptune"] as const;
export type JingleName = (typeof JINGLES)[number];

/** A running composite sound. `duration` is the scheduled length in seconds. */
export interface SoundHandle {
  duration: number;
  /** Fast fade (<=150 ms) and release. Safe to call repeatedly. */
  stop: () => void;
}

/** Deterministic pick (FNV-1a hash) so every player's device chooses the same jingle for a game. */
export function jingleFor(gameKey: string): JingleName {
  let h = 2166136261;
  for (let i = 0; i < gameKey.length; i++) h = Math.imul(h ^ gameKey.charCodeAt(i), 16777619);
  return JINGLES[(h >>> 0) % JINGLES.length] as JingleName;
}

interface Track {
  /** Latest scheduled end, in seconds from now. */
  end: number;
  tone: (s: ToneSpec) => void;
  burst: (s: NoiseSpec) => void;
}

const live = new Set<SoundHandle>();
const FADE_S = 0.12;

/** Run a scheduler on its own gain bus so the whole thing can be faded out at once. */
function composite(
  build: (c: AudioContext, out: AudioNode, track: Track) => void,
): SoundHandle | null {
  const c = context();
  if (!c || !master) return null;
  resume();
  const bus = c.createGain();
  bus.gain.value = 1;
  bus.connect(master);
  const track: Track = {
    end: 0,
    tone: (s) => {
      track.end = Math.max(track.end, (s.at ?? 0) + s.dur);
      tone(c, bus, s);
    },
    burst: (s) => {
      track.end = Math.max(track.end, (s.at ?? 0) + s.dur);
      burst(c, bus, s);
    },
  };
  try {
    build(c, bus, track);
  } catch {
    // A failing voice must never break the game.
  }
  let done = false;
  const handle: SoundHandle = {
    duration: track.end,
    stop: () => {
      if (done) return;
      done = true;
      live.delete(handle);
      try {
        const now = c.currentTime;
        bus.gain.cancelScheduledValues?.(now);
        bus.gain.setValueAtTime(1, now);
        bus.gain.exponentialRampToValueAtTime(0.0001, now + FADE_S);
        setTimeout(() => bus.disconnect?.(), FADE_S * 1000 + 50);
      } catch {
        // Already torn down.
      }
    },
  };
  live.add(handle);
  return handle;
}

/** Fade out everything started by the helpers below (skip, leaving the screen, mute). */
export function stopAllSounds(): void {
  for (const h of [...live]) h.stop();
}

const KAZOO = [
  523, 659, 784, 659, 784, 1047, 988, 880, 784, 880, 988, 1175, 1047, 988, 784, 659, 784, 1047,
];

const JINGLE_BUILDERS: Record<JingleName, (t: Track) => void> = {
  /** Buzzy kazoo-ish tune with a "ta-da" ending, ~4.9 s. */
  kazoo: (t) => {
    KAZOO.forEach((f, i) => {
      const spec = { at: i * 0.2, dur: 0.18, type: "sawtooth" as const, gain: 0.09, attack: 0.02 };
      t.tone({ ...spec, freq: f, shaper: true });
      t.tone({ ...spec, freq: f * 1.012, gain: 0.05 });
    });
    for (const [i, f] of [784, 988, 1175].entries())
      t.tone({ freq: f, at: 3.7 + i * 0.13, dur: 0.12, type: "sawtooth", gain: 0.1, shaper: true });
    for (const f of [1047, 1319, 1568])
      t.tone({ freq: f, at: 4.15, dur: 0.8, type: "sawtooth", gain: 0.07, shaper: true });
  },
  /** Slide whistles, party-horn blats, drum-roll and a cymbal crash, ~5.4 s. */
  slide: (t) => {
    t.tone({ freq: 300, to: 1800, dur: 0.9, gain: 0.2, attack: 0.05 });
    t.tone({ freq: 400, to: 2200, at: 1, dur: 0.7, gain: 0.2, attack: 0.05 });
    t.tone({ freq: 233, to: 220, at: 1.9, dur: 0.35, type: "sawtooth", gain: 0.14, shaper: true });
    t.tone({ freq: 311, to: 300, at: 2.3, dur: 0.6, type: "sawtooth", gain: 0.14, shaper: true });
    for (let i = 0; i < 26; i++)
      t.burst({
        at: 2.9 + i * 0.05,
        dur: 0.045,
        filter: "bandpass",
        freq: 250,
        q: 1.5,
        gain: 0.12 + i * 0.01,
      });
    t.burst({ at: 4.2, dur: 1.2, filter: "highpass", freq: 6000, gain: 0.3 });
    t.tone({ freq: 130, at: 4.2, dur: 0.4, gain: 0.4 });
  },
  /** 8-bit victory arpeggio with a silly pitch-bend finish, ~4.2 s. */
  chiptune: (t) => {
    const arp = [523, 659, 784, 1047];
    for (let i = 0; i < 24; i++)
      t.tone({
        freq: arp[i % 4] as number,
        at: i * 0.1,
        dur: 0.09,
        type: "square",
        gain: 0.07,
        attack: 0.005,
      });
    t.tone({ freq: 1047, to: 2093, at: 2.5, dur: 0.3, type: "square", gain: 0.08 });
    t.tone({ freq: 1047, to: 262, at: 2.85, dur: 0.6, type: "square", gain: 0.08 });
    for (const [i, f] of [784, 784, 1047].entries())
      t.tone({ freq: f, at: 3.5 + i * 0.12, dur: i === 2 ? 0.7 : 0.1, type: "square", gain: 0.08 });
  },
};

/** Play one of the three winner jingles (2-10 s). Null when muted or without Web Audio. */
export function playJingle(name: JingleName): SoundHandle | null {
  return composite((_c, _out, t) => JINGLE_BUILDERS[name](t));
}

/** Drum-roll with a crescendo for the suspense build-up. */
export function playDrumRoll(seconds: number): SoundHandle | null {
  return composite((_c, _out, t) => {
    const n = Math.max(1, Math.round(seconds / 0.045));
    for (let i = 0; i < n; i++)
      t.burst({
        at: i * 0.045,
        dur: 0.04,
        filter: "bandpass",
        freq: 200,
        q: 1.5,
        gain: 0.06 + (0.3 * i) / n,
      });
  });
}

/** Laughing cat (K5.7): rapid formant-filtered "ha-ha-ha" bursts with pitch wobble, then a wheeze, ~4 s. */
export function playLaugh(): SoundHandle | null {
  return composite((c, out, t) => {
    const n = 15;
    let at = 0.05;
    for (let i = 0; i < n; i++) {
      const f0 = 300 + (i % 2 ? -35 : 25) + Math.sin(i * 1.7) * 28 + (i < 4 ? i * 14 : 0);
      const t0 = c.currentTime + at;
      const dur = 0.15;
      const osc = c.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(f0, t0);
      osc.frequency.exponentialRampToValueAtTime(f0 * 0.78, t0 + dur);
      const env = c.createGain();
      const peak = 0.34 * (i > 9 ? 1 - (i - 9) * 0.12 : 1);
      env.gain.setValueAtTime(0.0001, t0);
      env.gain.exponentialRampToValueAtTime(peak, t0 + 0.015);
      env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      for (const [freq, q, g] of [
        [850, 4, 1],
        [1500, 5, 0.6],
      ] as const) {
        const f = c.createBiquadFilter();
        f.type = "bandpass";
        f.frequency.value = freq;
        f.Q.value = q;
        const mix = c.createGain();
        mix.gain.value = g;
        osc.connect(f);
        f.connect(mix);
        mix.connect(env);
      }
      env.connect(out);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
      t.end = Math.max(t.end, at + dur + 0.02);
      at += 0.24 - i * 0.005;
    }
    t.tone({ freq: 1200, to: 1900, at: at + 0.05, dur: 0.35, gain: 0.05, attack: 0.05 });
  });
}

/**
 * Rattle while the Roll button is held: a cluster every 50–90 ms. `onStep` runs on every
 * step even when muted (haptic ticks use it).
 */
export function startRattle(onStep?: () => void): void {
  stopRattle();
  const step = () => {
    play("rattle");
    onStep?.();
    rattleTimer = setTimeout(step, 50 + Math.random() * 40);
  };
  step();
}

export function stopRattle(): void {
  if (rattleTimer !== null) clearTimeout(rattleTimer);
  rattleTimer = null;
}

/** Test helper. */
export function _resetSoundForTests(): void {
  stopRattle();
  live.clear();
  ctx = null;
  master = null;
  noiseBuf = null;
  unlockInstalled = false;
}
