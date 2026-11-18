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
  | "gameEnd";

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
  ctx = null;
  master = null;
  noiseBuf = null;
  unlockInstalled = false;
}
