import type { DemoScenario } from "../demo-store";
import { t } from "../i18n";
import { Button } from "./Button";

export function ScenarioPanel({
  scenario,
  onScenario,
}: {
  scenario: DemoScenario;
  onScenario: (scenario: DemoScenario) => void;
}) {
  const items: Array<[DemoScenario, string]> = [
    ["roll", t("demo.scenarioRoll")],
    ["turn", t("demo.scenarioTurn")],
    ["game-over", t("demo.scenarioGameOver")],
  ];
  return (
    <fieldset class="demo-scenarios" style={{ border: 0, margin: 0 }}>
      <legend class="sr-only">{t("demo.scenario")}</legend>
      {items.map(([value, label]) => (
        <Button
          key={value}
          type="button"
          variant={scenario === value ? "primary" : undefined}
          onClick={() => onScenario(value)}
        >
          {label}
        </Button>
      ))}
    </fieldset>
  );
}
