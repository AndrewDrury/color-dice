/** One call per H6 moment: the matching sound (H8) and haptic (H9). */
import { type HapticName, haptic } from "./haptics";
import { play, type SoundName } from "./sound";

export type Moment =
  | "yourTurn"
  | "rollPress"
  | "rattleStep"
  | "rollRelease"
  | "land"
  | "pick"
  | "mark"
  | "reveal"
  | "penalty"
  | "lock"
  | "error"
  | "win"
  | "gameEnd"
  | "join";

export const MOMENTS: Readonly<Record<Moment, { sound?: SoundName; haptic?: HapticName }>> = {
  yourTurn: { sound: "yourTurn", haptic: "notify" },
  rollPress: { haptic: "tick" },
  rattleStep: { haptic: "tick" },
  rollRelease: { sound: "throw", haptic: "medium" },
  land: { sound: "land", haptic: "land" },
  pick: { sound: "pick", haptic: "tick" },
  mark: { sound: "mark", haptic: "success" },
  reveal: { sound: "reveal" },
  penalty: { sound: "penalty", haptic: "error" },
  lock: { sound: "lock", haptic: "heavy" },
  error: { sound: "error", haptic: "error" },
  win: { sound: "fanfare", haptic: "success" },
  gameEnd: { sound: "gameEnd", haptic: "success" },
  join: { sound: "join" },
};

/** `semitones` shifts the pitch (e.g. a different land click per die). */
export function feedback(moment: Moment, opts: { semitones?: number } = {}): void {
  const m = MOMENTS[moment];
  if (m.sound) play(m.sound, opts);
  if (m.haptic) haptic(m.haptic);
}
