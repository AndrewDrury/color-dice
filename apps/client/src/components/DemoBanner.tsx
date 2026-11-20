import { t } from "../i18n";
import { Button } from "./Button";

export function DemoBanner({ onExit }: { onExit: () => void }) {
  return (
    <div class="demo-banner" role="status" aria-label={t("demo.badge")}>
      <strong>{t("demo.badge")}</strong>
      <Button type="button" onClick={onExit}>
        {t("demo.exit")}
      </Button>
    </div>
  );
}
