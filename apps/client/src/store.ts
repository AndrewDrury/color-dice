import type { ViewMessage } from "@cd/protocol";
import { useEffect, useState } from "preact/hooks";
import type { SocketStatus } from "./ws";

export interface Toast {
  id: number;
  text: string;
  kind: "info" | "error";
}

export interface AppState {
  view: ViewMessage | null;
  status: SocketStatus;
  toast: Toast | null;
}

type Listener = (state: AppState) => void;

const initial: AppState = { view: null, status: "ended", toast: null };

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
 * Apply a server view. Ignored unless its version is strictly higher than the current
 * one (out-of-order or duplicate frames after a reconnect). Returns true when applied.
 */
export function applyView(v: ViewMessage): boolean {
  if (state.view && v.version <= state.view.version) return false;
  set({ view: v });
  return true;
}

/** Forget the current view (leaving a game, switching to another code). */
export function clearView(): void {
  set({ view: null });
}

export function setStatus(status: SocketStatus): void {
  if (status !== state.status) set({ status });
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
