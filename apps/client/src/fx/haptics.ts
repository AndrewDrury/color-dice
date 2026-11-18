/**
 * Haptics (H9). Android: navigator.vibrate patterns. iPhone (iOS 18+): toggling a hidden
 * `<input type="checkbox" switch>` through its label plays a system tick, but only inside a
 * user gesture. Never more than once per 40 ms; never the only signal.
 */
import { getPrefs } from "../prefs";

export type HapticName = "tick" | "medium" | "land" | "success" | "heavy" | "error" | "notify";

export const PATTERNS: Readonly<Record<HapticName, number | number[]>> = {
  tick: 8,
  medium: 18,
  land: [12, 30, 10],
  success: [14, 40, 22],
  heavy: [30, 40, 60],
  error: [40, 30, 40],
  notify: [20, 80, 20],
};

export const THROTTLE_MS = 40;

let last = Number.NEGATIVE_INFINITY;
let switchLabel: HTMLLabelElement | null = null;

function nav(): (Navigator & { userActivation?: { isActive: boolean } }) | null {
  return typeof navigator === "undefined" ? null : navigator;
}

function canVibrate(): boolean {
  const n = nav();
  return !!n && "vibrate" in n && typeof n.vibrate === "function";
}

function isIOS(): boolean {
  const n = nav();
  if (!n || typeof document === "undefined") return false;
  return /iPhone|iPad/.test(n.userAgent) && "ontouchend" in document;
}

export function hapticsSupported(): boolean {
  return canVibrate() || isIOS();
}

/** One visually hidden (not display:none) switch + label, created on first use. */
function iosSwitch(): HTMLLabelElement | null {
  if (switchLabel?.isConnected) return switchLabel;
  if (!document.body) return null;
  const label = document.createElement("label");
  label.setAttribute("aria-hidden", "true");
  const input = document.createElement("input");
  input.type = "checkbox";
  input.setAttribute("switch", "");
  input.tabIndex = -1;
  label.append(input);
  Object.assign(label.style, {
    position: "fixed",
    width: "1px",
    height: "1px",
    overflow: "hidden",
    opacity: "0",
    pointerEvents: "none",
    clipPath: "inset(50%)",
    left: "0",
    top: "0",
  });
  document.body.append(label);
  switchLabel = label;
  return label;
}

export function haptic(name: HapticName): void {
  if (!getPrefs().haptics) return;
  const now = Date.now();
  if (now - last < THROTTLE_MS) return;
  try {
    if (canVibrate()) {
      last = now;
      nav()?.vibrate(PATTERNS[name]);
      return;
    }
    // iPhone: patterns are impossible, every pattern collapses to one tick, gesture only.
    if (isIOS() && nav()?.userActivation?.isActive) {
      const label = iosSwitch();
      if (label) {
        last = now;
        label.click();
      }
    }
  } catch {
    // Unsupported or blocked: haptics are optional.
  }
}

/** Test helper. */
export function _resetHapticsForTests(): void {
  last = Number.NEGATIVE_INFINITY;
  switchLabel?.remove();
  switchLabel = null;
}
