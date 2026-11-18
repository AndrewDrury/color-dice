/** Leaving a room for good: drop the seat, its saved password, and say why (K2.2). */
import { ApiError, getMe } from "./api";
import { t } from "./i18n";
import { dropInvite } from "./invite";
import { removeRoomPassword } from "./remembered";
import { forgetSession } from "./session";
import { showToast } from "./store";

/** Rooms this device is leaving on purpose: the server's "session ended" close is expected. */
const leaving = new Set<string>();

export function markLeaving(code: string, on: boolean): void {
  if (on) leaving.add(code);
  else leaving.delete(code);
}

/** Forget this device's seat and the room's saved password. */
export function forgetRoom(code: string): void {
  forgetSession(code);
  removeRoomPassword(code);
  dropInvite(code);
}

/**
 * The socket ended with "session ended": the room may be gone (404 → "That game has ended.")
 * or this seat was replaced (generic text). Shows one toast.
 */
export async function toastSessionEnded(code: string, token: string): Promise<void> {
  if (leaving.has(code)) return;
  let text = t("toast.sessionEnded");
  try {
    await getMe(code, token);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) text = t("toast.gameEnded");
  }
  if (!leaving.has(code)) showToast(text);
}
