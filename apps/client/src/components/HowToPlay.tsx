/** How to play (H12): short bullets in our own words, an example row and the scoring table. */
import { BottomSheet } from "./BottomSheet";

const POINTS = Array.from({ length: 12 }, (_, i) => [i + 1, ((i + 1) * (i + 2)) / 2] as const);

const BULLETS = [
  "Each turn one player rolls two white dice and one die per open colour.",
  "Everyone may cross one number in any row using the white sum. Or pass.",
  "Then only the roller may add one white die to one coloured die and cross that number.",
  "Cross numbers left to right. Anything you jump over is gone for good.",
  "After 5 crosses in a row you may cross its last number, which also locks the row.",
  "When a row is locked for someone, the whole table loses that colour's die.",
  "If the roller crosses nothing at all on their turn, they take a −5 penalty.",
  "The game ends at 4 penalties or when 2 rows are locked. Most points wins.",
];

const EXAMPLE = [2, 3, 4, 5, 6, 7, 8];

export function HowToPlay({ onClose }: { onClose: () => void }) {
  return (
    <BottomSheet title="How to play" onClose={onClose}>
      <ol class="htp-list">
        {BULLETS.map((b) => (
          <li key={b}>{b}</li>
        ))}
      </ol>
      <div>
        <h3>Example</h3>
        <p class="muted htp-cap">
          The white sum is 5: cross the 5. The 3 and 4 are skipped for good.
        </p>
        <div
          class="htp-row"
          role="img"
          aria-label="Red row: 2 crossed, 3 and 4 skipped, 5 crossed next"
        >
          {EXAMPLE.map((n) => (
            <span key={n} class={n === 2 || n === 5 ? "is-x" : n === 3 || n === 4 ? "is-skip" : ""}>
              {n === 2 || n === 5 ? "✕" : n}
            </span>
          ))}
        </div>
      </div>
      <div>
        <h3>Scoring</h3>
        <p class="muted htp-cap">Crosses in a row are worth more each time. Each penalty is −5.</p>
        <table class="htp-table">
          <thead>
            <tr>
              <th scope="col">Crosses</th>
              {POINTS.map(([n]) => (
                <th key={n} scope="col">
                  {n}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">Points</th>
              {POINTS.map(([n, pts]) => (
                <td key={n} class="num">
                  {pts}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
        <p class="muted htp-cap">The lock counts as one extra cross.</p>
      </div>
    </BottomSheet>
  );
}
