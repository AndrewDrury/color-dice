import type { Color } from "@cd/engine";
import type { ViewMessage, ViewRow } from "@cd/protocol";
import { h } from "preact";
import { useEffect } from "preact/hooks";
import { DemoBanner } from "./components/DemoBanner";
import { ScenarioPanel } from "./components/ScenarioPanel";
import {
  type DemoScenario,
  exitDemoStore,
  setDemoScenario,
  startDemoStore,
  useDemoState,
} from "./demo-store";
import { t } from "./i18n";
import { navigate } from "./router";
import { Board } from "./screens/Game";
import { applyView, clearView, useAppState } from "./store";

export const DEMO_CODE = "DEMO";

const emptyRow = (): ViewRow => ({
  marked: Array(11).fill(false),
  lockCrossed: false,
});

export function createDemoView(scenario: DemoScenario = "roll"): ViewMessage {
  const phase =
    scenario === "roll" ? "AWAIT_ROLL" : scenario === "game-over" ? "GAME_OVER" : "ACTION_1";
  const you = 0;
  const roll =
    phase === "AWAIT_ROLL"
      ? null
      : {
          white: [3, 5] as [3, 5],
          colored: { RED: 2, YELLOW: 4, GREEN: 6, BLUE: 1 } as Partial<
            Record<Color, 1 | 2 | 3 | 4 | 5 | 6>
          >,
          whiteSum: 8,
        };
  const full = [0, 1].map((seat) => ({
    seat,
    seatId: seat === 0 ? "demo-you" : "demo-cpu",
    sheet: {
      rows: { RED: emptyRow(), YELLOW: emptyRow(), GREEN: emptyRow(), BLUE: emptyRow() },
      penalties: 0,
    },
    score: { rows: { RED: 0, YELLOW: 0, GREEN: 0, BLUE: 0 }, penalties: 0, total: 0 },
    action1Submitted: false,
  }));
  const players = full.map((player, seat) =>
    phase === "GAME_OVER" || seat === you ? player : { ...player, sheet: null },
  );

  return {
    type: "view",
    version: scenario === "roll" ? 1 : scenario === "turn" ? 2 : 3,
    code: DEMO_CODE,
    room: {
      name: t("demo.roomName"),
      listed: false,
      maxPlayers: 2,
      cpuCount: 1,
      status: "playing",
      joinLockedUntil: null,
    },
    seats: [
      {
        seatId: "demo-you",
        name: t("demo.you"),
        host: true,
        kind: "human",
        online: true,
        away: false,
        left: false,
        record: { wins: 0, ties: 0, losses: 0 },
      },
      {
        seatId: "demo-cpu",
        name: t("demo.cpu"),
        host: false,
        kind: "cpu",
        online: true,
        away: false,
        left: false,
        record: { wins: 0, ties: 0, losses: 0 },
      },
    ],
    game: {
      phase,
      turn: { number: 1, activeSeat: 0 },
      roll,
      lockedColors: [],
      players,
      events: [],
      endReason: null,
      winners: phase === "GAME_OVER" ? ["demo-you"] : null,
    },
    you: {
      seatId: "demo-you",
      host: true,
      seat: 0,
      action1Decision: null,
      pendingAction2: null,
      legalAction1: phase === "ACTION_1" ? [{ kind: "MARK", color: "RED" }, { kind: "PASS" }] : [],
      legalAction2: [],
      canRoll: phase === "AWAIT_ROLL",
      canUndo: false,
    },
  };
}

export function startDemo(scenario: DemoScenario = "roll"): void {
  startDemoStore(scenario);
  applyView(createDemoView(scenario));
}

export function exitDemo(): void {
  exitDemoStore();
  clearView();
  navigate("home");
}

export function DemoScreen() {
  const demo = useDemoState();
  const { status, toast, offlineSince } = useAppState();

  useEffect(() => {
    applyView(createDemoView(demo.scenario));
  }, [demo.scenario]);

  const view = useAppState().view;
  const conn = {
    send: () => false,
    resyncNext: { current: true },
  };

  const changeScenario = (scenario: DemoScenario) => {
    setDemoScenario(scenario);
  };

  return h(
    "main",
    { class: "stack", style: { paddingBlock: "var(--s2)" } },
    h(DemoBanner, { onExit: exitDemo }),
    h(ScenarioPanel, { scenario: demo.scenario, onScenario: changeScenario }),
    view?.code === DEMO_CODE
      ? h(Board, {
          offlineSince,
          view,
          status: status === "ended" ? "online" : status,
          toast: toast?.kind === "error" ? toast.text : null,
          conn,
          rollFailed: 0,
          failSignal: 0,
          leaving: false,
          setLeaving: () => undefined,
          liveRollOff: false,
        })
      : null,
  );
}
