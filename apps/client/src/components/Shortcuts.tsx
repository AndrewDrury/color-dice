/** The `?` overlay: desktop keyboard shortcuts (H11). */
import { type MessageKey, t, useT } from "../i18n";
import { BottomSheet } from "./BottomSheet";

/** Key caps (some are named keys, so they come from the catalog too) and what each does. */
export const SHORTCUTS: readonly (readonly [MessageKey, MessageKey])[] = [
  ["keys.cap.roll", "keys.roll"],
  ["keys.cap.pass", "keys.pass"],
  ["keys.cap.passPenalty", "keys.passPenalty"],
  ["keys.cap.move", "keys.move"],
  ["keys.cap.enter", "keys.enter"],
  ["keys.cap.esc", "keys.esc"],
  ["keys.cap.undo", "keys.undo"],
  ["keys.cap.chat", "keys.chat"],
  ["keys.cap.mute", "keys.mute"],
  ["keys.cap.help", "keys.help"],
];

export function Shortcuts({ onClose }: { onClose: () => void }) {
  useT();
  return (
    <BottomSheet title={t("keys.title")} onClose={onClose}>
      <dl class="kb-list">
        {SHORTCUTS.map(([keys, what]) => (
          <div key={keys} class="kb-item">
            <dt>
              <kbd>{t(keys)}</kbd>
            </dt>
            <dd>{t(what)}</dd>
          </div>
        ))}
      </dl>
    </BottomSheet>
  );
}
