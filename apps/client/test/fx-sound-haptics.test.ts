import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { feedback } from "../src/fx/feedback";
import { _resetHapticsForTests, haptic, hapticsSupported, PATTERNS } from "../src/fx/haptics";
import { _resetSoundForTests, play, startRattle, stopRattle, unlockAudio } from "../src/fx/sound";
import { _resetPrefsForTests, setPrefs } from "../src/prefs";

/** Minimal fake Web Audio graph that records context creation and node starts. */
function fakeAudio() {
  const created = vi.fn();
  const started = vi.fn();
  const param = () => ({
    value: 0,
    setValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
  });
  const node = () => ({
    connect: vi.fn(),
    gain: param(),
    frequency: param(),
    Q: param(),
    threshold: param(),
    ratio: param(),
    start: started,
    stop: vi.fn(),
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
  return { FakeAudioContext, created, started };
}

beforeEach(() => {
  localStorage.clear();
  _resetPrefsForTests();
  _resetSoundForTests();
  _resetHapticsForTests();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("sound", () => {
  it("no-ops cleanly without an AudioContext", () => {
    vi.stubGlobal("AudioContext", undefined);
    expect(() => {
      unlockAudio();
      play("land");
      feedback("mark");
      startRattle();
      stopRattle();
    }).not.toThrow();
  });

  it("plays through a shared context when sound is on", () => {
    const fake = fakeAudio();
    vi.stubGlobal("AudioContext", fake.FakeAudioContext);
    play("land");
    play("yourTurn");
    expect(fake.created).toHaveBeenCalledTimes(1);
    expect(fake.started).toHaveBeenCalled();
  });

  it("muted → nothing created or played", () => {
    const fake = fakeAudio();
    vi.stubGlobal("AudioContext", fake.FakeAudioContext);
    setPrefs({ sound: false });
    play("land");
    feedback("lock");
    expect(fake.created).not.toHaveBeenCalled();
    expect(fake.started).not.toHaveBeenCalled();
  });

  it("rattle steps keep running while muted (haptic ticks) and stop on release", () => {
    vi.useFakeTimers();
    setPrefs({ sound: false });
    const onStep = vi.fn();
    startRattle(onStep);
    vi.advanceTimersByTime(500);
    const n = onStep.mock.calls.length;
    expect(n).toBeGreaterThanOrEqual(5);
    stopRattle();
    vi.advanceTimersByTime(500);
    expect(onStep).toHaveBeenCalledTimes(n);
  });
});

describe("haptics", () => {
  it("no-ops without navigator.vibrate", () => {
    expect("vibrate" in navigator && typeof navigator.vibrate === "function").toBe(false);
    expect(() => haptic("land")).not.toThrow();
  });

  it("vibrates with the H9 pattern and throttles to one per 40 ms", () => {
    vi.useFakeTimers();
    const vibrate = vi.fn(() => true);
    vi.stubGlobal("navigator", { ...navigator, userAgent: navigator.userAgent, vibrate });
    expect(hapticsSupported()).toBe(true);
    haptic("land");
    haptic("tick");
    expect(vibrate).toHaveBeenCalledTimes(1);
    expect(vibrate).toHaveBeenCalledWith(PATTERNS.land);
    vi.advanceTimersByTime(41);
    haptic("tick");
    expect(vibrate).toHaveBeenCalledTimes(2);
    expect(vibrate).toHaveBeenLastCalledWith(8);
  });

  it("disabled → never vibrates", () => {
    const vibrate = vi.fn(() => true);
    vi.stubGlobal("navigator", { ...navigator, userAgent: navigator.userAgent, vibrate });
    setPrefs({ haptics: false });
    haptic("heavy");
    feedback("penalty");
    expect(vibrate).not.toHaveBeenCalled();
  });
});
