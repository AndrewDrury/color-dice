import type { DemoScenario } from "../demo-store";
import { t } from "../i18n";
import { Button } from "./Button";

const groups: ReadonlyArray<readonly [string, readonly (readonly [DemoScenario, string])[]]> = [
  [
    "demo.groupLobby",
    [
      ["waiting", "demo.scenarioWaiting"],
      ["rolloff-initial", "demo.scenarioRollOffInitial"],
      ["rolloff-tie", "demo.scenarioRollOffTie"],
      ["rolloff-winner", "demo.scenarioRollOffWinner"],
      ["rolloff-lets-go", "demo.scenarioRollOffLetsGo"],
    ],
  ],
  [
    "demo.groupTurn",
    [
      ["roll", "demo.scenarioRoll"],
      ["action-1", "demo.scenarioAction1"],
      ["action-2", "demo.scenarioAction2"],
      ["turn-summary", "demo.scenarioTurnSummary"],
    ],
  ],
  [
    "demo.groupLocks",
    [
      ["lock-first", "demo.scenarioLockFirst"],
      ["lock-second", "demo.scenarioLockSecond"],
      ["penalty", "demo.scenarioPenalty"],
    ],
  ],
  [
    "demo.groupResults",
    [
      ["winner", "demo.scenarioWinner"],
      ["tie", "demo.scenarioTie"],
      ["all-tied", "demo.scenarioAllTied"],
      ["winner-celebration", "demo.scenarioCelebration"],
      ["dramatic-reveal", "demo.scenarioDramatic"],
      ["full-score", "demo.scenarioFullScore"],
    ],
  ],
] as const;

export const DEMO_SCENARIOS: readonly DemoScenario[] = groups.flatMap(([, items]) =>
  items.map(([value]) => value),
);

const scenarioKey = (value: DemoScenario) =>
  value === "locked-first" ? "lock-first" : value === "locked-second" ? "lock-second" : value;

export function ScenarioPanel({
  scenario,
  open,
  onToggle,
  onScenario,
  onBack,
  onNext,
  onReset,
}: {
  scenario: DemoScenario;
  open: boolean;
  onToggle: () => void;
  onScenario: (scenario: DemoScenario) => void;
  onBack: () => void;
  onNext: () => void;
  onReset: () => void;
}) {
  return (
    <section class="demo-scenarios" aria-label={t("demo.scenario")} data-testid="scenario-panel">
      <div class="demo-scenario-head">
        <strong>{t("demo.scenario")}</strong>
        <Button
          type="button"
          aria-expanded={open ? "true" : "false"}
          aria-controls="demo-scenario-grid"
          aria-label={open ? t("demo.hidePanel") : t("demo.showPanel")}
          onClick={onToggle}
        >
          {open ? t("demo.hidePanel") : t("demo.showPanel")}
        </Button>
      </div>
      {open ? (
        <div id="demo-scenario-grid">
          <fieldset class="demo-scenario-nav" aria-label={t("demo.navigation")}>
            <Button type="button" aria-label={t("demo.back")} onClick={onBack}>
              {t("common.back")}
            </Button>
            <Button type="button" aria-label={t("demo.next")} onClick={onNext}>
              {t("demo.next")}
            </Button>
            <Button type="button" aria-label={t("demo.reset")} onClick={onReset}>
              {t("demo.reset")}
            </Button>
          </fieldset>
          {groups.map(([group, items]) => (
            <fieldset class="demo-scenario-group" key={group}>
              <legend>{t(group as never)}</legend>
              <div class="demo-scenario-buttons">
                {items.map(([value, label]) => (
                  <span
                    key={value}
                    data-testid={`demo-scenario-${scenarioKey(value)}`}
                    style={{ display: "inline-flex" }}
                  >
                    <Button
                      type="button"
                      variant={scenarioKey(scenario) === value ? "primary" : undefined}
                      aria-label={t(label as never)}
                      onClick={() => onScenario(value)}
                    >
                      {t(label as never)}
                    </Button>
                  </span>
                ))}
              </div>
            </fieldset>
          ))}
        </div>
      ) : null}
    </section>
  );
}
