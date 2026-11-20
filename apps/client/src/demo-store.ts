import { useEffect, useState } from "preact/hooks";

export type DemoScenario = "roll" | "turn" | "game-over";

export interface DemoState {
  active: boolean;
  scenario: DemoScenario;
}

let state: DemoState = { active: false, scenario: "roll" };
const listeners = new Set<(state: DemoState) => void>();

function set(patch: Partial<DemoState>): void {
  state = { ...state, ...patch };
  for (const cb of listeners) cb(state);
}

export function getDemoState(): DemoState {
  return state;
}

export function startDemoStore(scenario: DemoScenario = "roll"): void {
  set({ active: true, scenario });
}

export function setDemoScenario(scenario: DemoScenario): void {
  set({ scenario });
}

export function exitDemoStore(): void {
  set({ active: false, scenario: "roll" });
}

export function subscribeDemo(cb: (state: DemoState) => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useDemoState(): DemoState {
  const [value, setValue] = useState(state);
  useEffect(() => subscribeDemo(setValue), []);
  return value;
}

export function _resetDemoStoreForTests(): void {
  state = { active: false, scenario: "roll" };
  listeners.clear();
}
