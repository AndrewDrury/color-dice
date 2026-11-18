import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  _resetSoundForTests,
  JINGLES,
  jingleFor,
  playDrumRoll,
  playJingle,
  playLaugh,
  stopAllSounds,
} from "../src/fx/sound";
import { _resetPrefsForTests, setPrefs } from "../src/prefs";

/** Fake Web Audio graph that records every scheduled start/stop (relative to currentTime 0). */
function fakeAudio() {
  const created = vi.fn();
  const starts: number[] = [];
  const stops: number[] = [];
  const ramps: number[] = [];
  const param = () => ({
    value: 0,
    setValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: (_v: number, t: number) => ramps.push(t),
    cancelScheduledValues: vi.fn(),
  });
  const node = () => ({
    connect: vi.fn(),
    disconnect: vi.fn(),
    gain: param(),
    frequency: param(),
    Q: param(),
    threshold: param(),
    ratio: param(),
    start: (t: number) => starts.push(t),
    stop: (t: number) => stops.push(t),
  });
  class FakeAudioContext {
    state = "running";
    currentTime = 0;
    sampleRate = 8000;
    destination = {};
    constructor() {
      created();
    }
    createGain = node;
    createDynamicsCompressor = node;
    createOscillator = node;
    createBiquadFilter = node;
    createBufferSource = node;
    createWaveShaper = node;
    createBuffer = (_c: number, len: number) => ({ getChannelData: () => new Float32Array(len) });
    resume = () => Promise.resolve();
  }
  return { FakeAudioContext, created, starts, stops, ramps };
}

beforeEach(() => {
  localStorage.clear();
  _resetPrefsForTests();
  _resetSoundForTests();
  setPrefs({ sound: true });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("jingles", () => {
  it.each(JINGLES)("%s is 2-10 s long and schedules nodes inside that window", (name) => {
    const a = fakeAudio();
    vi.stubGlobal("AudioContext", a.FakeAudioContext);
    const h = playJingle(name);
    expect(h).not.toBeNull();
    expect(h?.duration).toBeGreaterThanOrEqual(2);
    expect(h?.duration).toBeLessThanOrEqual(10);
    expect(a.starts.length).toBeGreaterThan(10);
    expect(Math.max(...a.stops)).toBeLessThanOrEqual((h?.duration ?? 0) + 0.1);
  });

  it("the laugh is a few seconds of bursts; the drum roll lasts as asked", () => {
    const a = fakeAudio();
    vi.stubGlobal("AudioContext", a.FakeAudioContext);
    const laugh = playLaugh();
    expect(laugh?.duration).toBeGreaterThanOrEqual(3);
    expect(laugh?.duration).toBeLessThanOrEqual(6);
    const roll = playDrumRoll(3);
    expect(roll?.duration).toBeGreaterThan(2.9);
    expect(roll?.duration).toBeLessThan(3.2);
  });

  it("the same game id always picks the same jingle, and all three get used", () => {
    expect(jingleFor("K7QF2:3")).toBe(jingleFor("K7QF2:3"));
    const seen = new Set(Array.from({ length: 60 }, (_, i) => jingleFor(`ROOM${i}:1`)));
    expect(seen.size).toBe(JINGLES.length);
  });

  it("muted: nothing is created", () => {
    const a = fakeAudio();
    vi.stubGlobal("AudioContext", a.FakeAudioContext);
    setPrefs({ sound: false });
    expect(playJingle("kazoo")).toBeNull();
    expect(playLaugh()).toBeNull();
    expect(playDrumRoll(2)).toBeNull();
    expect(a.created).not.toHaveBeenCalled();
  });

  it("no Web Audio: a silent no-op", () => {
    vi.stubGlobal("AudioContext", undefined);
    expect(playJingle("slide")).toBeNull();
  });

  it("stop fades out within 150 ms and is idempotent", () => {
    vi.useFakeTimers();
    const a = fakeAudio();
    vi.stubGlobal("AudioContext", a.FakeAudioContext);
    const h = playJingle("chiptune");
    a.ramps.length = 0;
    h?.stop();
    h?.stop();
    expect(a.ramps).toHaveLength(1);
    expect(a.ramps[0]).toBeLessThanOrEqual(0.15);
    stopAllSounds();
    expect(a.ramps).toHaveLength(1);
  });
});
