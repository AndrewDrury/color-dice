import type { Color } from "@cd/engine";
import type { ViewMessage, ViewRow } from "@cd/protocol";
import { h } from "preact";
import { useEffect, useState } from "preact/hooks";
import { DemoBanner } from "./components/DemoBanner";
import { LockPopup } from "./components/LockPopup";
import { ResultsReveal } from "./components/ResultsReveal";
import { RollOff } from "./components/RollOff";
import { DEMO_SCENARIOS, ScenarioPanel } from "./components/ScenarioPanel";
import { SeatList } from "./components/SeatList";
import { TurnSummary } from "./components/TurnSummary";
import {
  type DemoScenario,
  exitDemoStore,
  setDemoScenario,
  startDemoStore,
  useDemoState,
} from "./demo-store";
import { colorName, t } from "./i18n";
import { navigate } from "./router";
import { Board } from "./screens/Game";
import { applyView, clearView, useAppState } from "./store";

export const DEMO_CODE = "DEMO";

export function createDemoView(scenario: DemoScenario = "roll"): ViewMessage {
  const canonical =
    scenario === "initial-roll" || scenario === "await-roll"
      ? "roll"
      : scenario === "lock-second" || scenario === "locked-second"
        ? "locked-second"
        : scenario === "lock-first" || scenario === "locked-first"
          ? "locked-first"
          : scenario === "game-over"
            ? "winner"
            : scenario === "turn"
              ? "action-1"
              : scenario;
  const result =
    canonical === "winner" ||
    canonical === "tie" ||
    canonical === "all-tied" ||
    canonical === "winner-celebration" ||
    canonical === "dramatic-reveal" ||
    canonical === "full-score";
  const phase =
    canonical === "roll" || canonical === "rolloff-lets-go"
      ? "AWAIT_ROLL"
      : result
        ? "GAME_OVER"
        : canonical === "action-2"
          ? "ACTION_2"
          : "ACTION_1";
  const action2 = canonical === "action-2";
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
  const markedRow = (count: number): ViewRow => ({
    marked: Array.from({ length: 11 }, (_, i) => i < count),
    lockCrossed: count === 11,
  });
  const full = [0, 1].map((seat) => {
    const tied = canonical === "tie" || canonical === "all-tied";
    const winner =
      canonical === "winner" ||
      canonical === "winner-celebration" ||
      canonical === "dramatic-reveal";
    const red: number =
      canonical === "full-score"
        ? 11
        : tied
          ? 7
          : winner
            ? seat === 0
              ? 8
              : 6
            : seat === 0
              ? 6
              : 8;
    const yellow: number =
      canonical === "full-score"
        ? 10
        : tied
          ? 7
          : winner
            ? seat === 0
              ? 7
              : 5
            : seat === 0
              ? 5
              : 7;
    const green: number =
      canonical === "full-score"
        ? 9
        : tied
          ? 6
          : winner
            ? seat === 0
              ? 6
              : 4
            : seat === 0
              ? 4
              : 6;
    const blue: number =
      canonical === "full-score"
        ? 8
        : tied
          ? 5
          : winner
            ? seat === 0
              ? 5
              : 3
            : seat === 0
              ? 3
              : 5;
    const penalties = canonical === "penalty" && seat === 0 ? -4 : 0;
    const rows = {
      RED: markedRow(red),
      YELLOW: markedRow(yellow),
      GREEN: markedRow(green),
      BLUE: markedRow(blue),
    };
    const rowScores = {
      RED: red === 11 ? 21 : (red * (red + 1)) / 2,
      YELLOW: yellow === 11 ? 21 : (yellow * (yellow + 1)) / 2,
      GREEN: green === 11 ? 21 : (green * (green + 1)) / 2,
      BLUE: blue === 11 ? 21 : (blue * (blue + 1)) / 2,
    };
    const total = Object.values(rowScores).reduce((sum, n) => sum + n, 0) + penalties;
    return {
      seat,
      seatId: seat === 0 ? "demo-you" : "demo-cpu",
      sheet: { rows, penalties },
      score: { rows: rowScores, penalties, total },
      action1Submitted: false,
    };
  });
  const players = full.map((player, seat) =>
    phase === "GAME_OVER" || seat === you
      ? player
      : { ...player, sheet: null, score: { ...player.score, rows: null } },
  );
  let lockedColors: Color[] = [];
  if (canonical === "locked-first" || canonical === "locked-second") lockedColors = ["RED"];
  if (canonical === "locked-second") lockedColors = ["RED", "YELLOW"];

  const rollOffRounds =
    canonical === "rolloff-initial"
      ? [[3, 5]]
      : canonical === "rolloff-tie"
        ? [
            [3, 3],
            [5, 5],
            [4, 4],
          ]
        : canonical === "rolloff-winner"
          ? [
              [3, 6],
              [4, 2],
            ]
          : canonical === "rolloff-lets-go"
            ? [[6, 2]]
            : null;
  const events: never[] = rollOffRounds
    ? ([
        {
          type: "FIRST_PLAYER_CHOSEN",
          method: "ROLL_OFF",
          rounds: rollOffRounds,
          seatId: "demo-you",
        },
      ] as never[])
    : ([] as never[]);

  return {
    type: "view",
    version: DEMO_SCENARIOS.indexOf(scenario) >= 0 ? DEMO_SCENARIOS.indexOf(scenario) + 1 : 100,
    code: DEMO_CODE,
    room:
      canonical === "waiting"
        ? {
            name: t("demo.roomName"),
            listed: false,
            maxPlayers: 2,
            cpuCount: 1,
            status: "lobby",
            joinLockedUntil: null,
          }
        : {
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
    game:
      canonical === "waiting"
        ? null
        : {
            phase,
            turn: { number: 1, activeSeat: 0 },
            roll,
            lockedColors,
            players,
            events,
            endReason: null,
            winners:
              phase === "GAME_OVER"
                ? canonical === "tie"
                  ? ["demo-you", "demo-cpu"]
                  : canonical === "all-tied"
                    ? ["demo-you", "demo-cpu"]
                    : ["demo-you"]
                : null,
          },
    you: {
      seatId: "demo-you",
      host: true,
      seat: 0,
      action1Decision: null,
      pendingAction2: null,
      legalAction1:
        phase === "ACTION_1" && !action2 ? [{ kind: "MARK", color: "RED" }, { kind: "PASS" }] : [],
      legalAction2: action2
        ? [{ kind: "MARK", whiteDie: 0, color: "RED", number: 8 }, { kind: "PASS" }]
        : [],
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
  const { status, toast } = useAppState();
  const [panelOpen, setPanelOpen] = useState(false);

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
  const index = DEMO_SCENARIOS.indexOf(demo.scenario);
  const back = () =>
    setDemoScenario(
      DEMO_SCENARIOS[(index - 1 + DEMO_SCENARIOS.length) % DEMO_SCENARIOS.length] as DemoScenario,
    );
  const next = () =>
    setDemoScenario(DEMO_SCENARIOS[(index + 1) % DEMO_SCENARIOS.length] as DemoScenario);
  const reset = () => setDemoScenario("roll");

  const canonical =
    demo.scenario === "initial-roll" || demo.scenario === "await-roll"
      ? "roll"
      : demo.scenario === "locked-first"
        ? "lock-first"
        : demo.scenario === "locked-second"
          ? "lock-second"
          : demo.scenario === "game-over"
            ? "winner"
            : demo.scenario === "turn"
              ? "action-1"
              : demo.scenario;

  const rollOffView = (rounds: readonly (readonly number[])[]) =>
    h(RollOff, {
      key: canonical,
      view: view as ViewMessage,
      rounds,
      onDone: () => setDemoScenario("rolloff-lets-go"),
    });
  const board =
    view?.code === DEMO_CODE
      ? h(Board, {
          key: `${demo.scenario}-${demo.scenario}`,
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
      : null;

  return h(
    "main",
    {
      class: "stack",
      style: { paddingBlock: "var(--s2)" },
      "data-testid": "demo-view",
      "data-scenario": demo.scenario,
    },
    h(DemoBanner, { onExit: exitDemo }),
    h(ScenarioPanel, {
      scenario: demo.scenario,
      open: panelOpen,
      onToggle: () => setPanelOpen((v) => !v),
      onScenario: changeScenario,
      onBack: back,
      onNext: next,
      onReset: reset,
    }),
    canonical === "waiting" && view
      ? h(
          "section",
          { class: ["card", "stack"].join(" "), "data-testid": "demo-view-waiting" },
          h("h1", null, t("demo.scenarioWaiting")),
          h(SeatList, {
            seats: view.seats,
            youSeatId: view.you.seatId,
            isHost: true,
          }),
        )
      : canonical === "rolloff-initial" && view
        ? rollOffView([[3, 5]])
        : canonical === "rolloff-tie" && view
          ? rollOffView([
              [3, 3],
              [5, 5],
              [4, 4],
            ])
          : canonical === "rolloff-winner" && view
            ? rollOffView([
                [3, 6],
                [4, 2],
              ])
            : canonical === "rolloff-lets-go" && view
              ? rollOffView([[6, 2]])
              : canonical === "turn-summary" && view
                ? h(
                    "div",
                    { "data-testid": "demo-view-turn-summary" },
                    board,
                    h(TurnSummary, {
                      key: "demo-turn-summary",
                      summary: {
                        turn: 1,
                        players: [
                          {
                            seat: 0,
                            name: t("demo.you"),
                            marks: [
                              {
                                action: 1,
                                color: "RED",
                                number: 8,
                                index: 7,
                                dice: [
                                  { color: "WHITE", face: 3 },
                                  { color: "WHITE", face: 5 },
                                ],
                              },
                            ],
                            penalty: false,
                            locks: ["RED"],
                          },
                          {
                            seat: 1,
                            name: t("demo.cpu"),
                            marks: [],
                            penalty: true,
                            locks: [],
                          },
                        ],
                      },
                      onClose: () => setDemoScenario("turn-summary"),
                    }),
                  )
                : canonical === "lock-first" && view
                  ? h(
                      "div",
                      { "data-testid": "demo-view-lock-first" },
                      h(LockPopup, {
                        queue: [
                          {
                            id: 1,
                            color: "RED",
                            text: t("lock.byYou", { color: colorName("RED") }),
                          },
                        ],
                        shift: () => undefined,
                      }),
                    )
                  : canonical === "lock-second" && view
                    ? h(
                        "div",
                        { "data-testid": "demo-view-lock-second" },
                        h(LockPopup, {
                          queue: [
                            {
                              id: 2,
                              color: "YELLOW",
                              text: t("lock.byYou", { color: colorName("YELLOW") }),
                            },
                          ],
                          shift: () => undefined,
                        }),
                      )
                    : canonical === "penalty" && view
                      ? h(
                          "div",
                          { "data-testid": "demo-view-penalty" },
                          board,
                          h(TurnSummary, {
                            key: "demo-penalty",
                            summary: {
                              turn: 1,
                              players: [
                                {
                                  seat: 0,
                                  name: t("demo.you"),
                                  marks: [],
                                  penalty: true,
                                  locks: [],
                                },
                                {
                                  seat: 1,
                                  name: t("demo.cpu"),
                                  marks: [],
                                  penalty: false,
                                  locks: [],
                                },
                              ],
                            },
                            onClose: () => setDemoScenario("penalty"),
                          }),
                        )
                      : canonical === "winner-celebration" && view
                        ? h(ResultsReveal, {
                            key: "demo-celebration",
                            view,
                            onDone: () => setDemoScenario("winner"),
                            actions: null,
                          })
                        : canonical === "dramatic-reveal" && view
                          ? h(ResultsReveal, {
                              key: "demo-dramatic",
                              view,
                              onDone: () => setDemoScenario("winner"),
                              actions: null,
                            })
                          : board,
  );
}
