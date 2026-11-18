import type { ViewMessage } from "@cd/protocol";
import { useEffect, useState } from "preact/hooks";
import type { SocketStatus } from "./ws";

export interface Toast {
  id: number;
  text: string;
  kind: "info" | "error";
}

export const SESSION_ENDED_TEXT = "Your session ended (maybe you joined from another device).";

export interface AppState {
  view: ViewMessage | null;
  status: SocketStatus;
  toast: Toast | null;
  /** Bumped on every recovery from "reconnecting": the game board remounts (clears staging). */
  epoch: number;
  /** When (epoch ms, client clock) we first saw each seat offline. */
  offlineSince: Record<string, number>;
}

type Listener = (state: AppState) => void;

const initial: AppState = { view: null, status: "ended", toast: null, epoch: 0, offlineSince: {} };

let state: AppState = initial;
let toastSeq = 0;
const listeners = new Set<Listener>();

function set(patch: Partial<AppState>): void {
  state = { ...state, ...patch };
  for (const cb of listeners) cb(state);
}

export function getState(): AppState {
  return state;
}

export function subscribe(cb: Listener): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/**
 * Apply a server view. Ignored unless its version is higher than the current one (or equal with changed
 * presence/seat data) (out-of-order or duplicate frames after a reconnect). Returns true when applied.
 */
export function applyView(v: ViewMessage): boolean {
  const cur = state.view;
  if (cur && v.version < cur.version) return false;
  // Presence-only changes (socket auth/close) keep the same version: accept an equal-version
  // view for the same game only when its seat data differs. Game.tsx diffs per version, so no
  // dice, sounds or animations replay for it.
  if (cur && v.version === cur.version && !(v.code === cur.code && seatsDiffer(cur.seats, v.seats)))
    return false;
  const offlineSince: Record<string, number> = {};
  const now = Date.now();
  for (const seat of v.seats) {
    if (!seat.online) offlineSince[seat.seatId] = state.offlineSince[seat.seatId] ?? now;
  }
  set({ view: v, offlineSince });
  return true;
}

function seatsDiffer(a: ViewMessage["seats"], b: ViewMessage["seats"]): boolean {
  if (a.length !== b.length) return true;
  return a.some((x, i) => {
    const y = b[i];
    return (
      !y ||
      x.seatId !== y.seatId ||
      x.name !== y.name ||
      x.host !== y.host ||
      x.online !== y.online ||
      x.away !== y.away
    );
  });
}

/** Forget the current view (leaving a game, switching to another code). */
export function clearView(): void {
  set({ view: null, offlineSince: {} });
}

export function setStatus(status: SocketStatus): void {
  if (status === state.status) return;
  const recovered = state.status === "reconnecting" && status === "online";
  set({ status, epoch: recovered ? state.epoch + 1 : state.epoch });
}

export function showToast(text: string, kind: Toast["kind"] = "info"): number {
  toastSeq += 1;
  set({ toast: { id: toastSeq, text, kind } });
  return toastSeq;
}

/** Dismiss the toast; with `id`, only if it is still the one showing. */
export function dismissToast(id?: number): void {
  if (state.toast && (id === undefined || state.toast.id === id)) set({ toast: null });
}

/** Test helper. */
export function _resetStoreForTests(): void {
  state = initial;
  listeners.clear();
}

/** Preact hook: re-render on every store change. */
export function useAppState(): AppState {
  const [s, setS] = useState(state);
  useEffect(() => {
    setS(state);
    return subscribe(setS);
  }, []);
  return s;
}
