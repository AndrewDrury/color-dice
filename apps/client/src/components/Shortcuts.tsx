/** The `?` overlay: desktop keyboard shortcuts (H11). */
import { BottomSheet } from "./BottomSheet";

export const SHORTCUTS: readonly (readonly [string, string])[] = [
  ["Space / R", "Roll the dice"],
  ["P", "Pass (press again to confirm)"],
  ["← → ↑ ↓", "Move between boxes you can mark"],
  ["Enter", "Pick a box, then confirm"],
  ["Esc", "Cancel your pick, close panels"],
  ["M", "Mute or unmute sound"],
  ["?", "Show this list"],
];

export function Shortcuts({ onClose }: { onClose: () => void }) {
  return (
    <BottomSheet title="Keyboard shortcuts" onClose={onClose}>
      <dl class="kb-list">
        {SHORTCUTS.map(([keys, what]) => (
          <div key={keys} class="kb-item">
            <dt>
              <kbd>{keys}</kbd>
            </dt>
            <dd>{what}</dd>
          </div>
        ))}
      </dl>
    </BottomSheet>
  );
}
