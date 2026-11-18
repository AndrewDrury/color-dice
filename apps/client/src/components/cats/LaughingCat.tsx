/**
 * Original big laughing cat (K5.7): head bob/shake, open-mouth cycle and tears are CSS
 * keyframes (motion.css). `still` (reduced motion) freezes it. Drawn for this project.
 */
const INK = "#3b2a20";
const FUR = "#f2a65a";

export function LaughingCat({ still = false, label }: { still?: boolean; label?: string }) {
  return (
    <svg
      class={`lcat${still ? " is-still" : ""}`}
      viewBox="0 0 120 120"
      width="200"
      height="200"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : "true"}
    >
      <g
        class="lcat-head"
        stroke={INK}
        stroke-width="3"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M18 52L22 12l32 20zM102 52L98 12L66 32z" fill={FUR} />
        <path d="M27 42l2-18 12 9zM93 42l-2-18-12 9z" fill="#f4a3b4" stroke="none" />
        <ellipse cx="60" cy="66" rx="44" ry="36" fill={FUR} />
        <path d="M60 32v9M48 34l2 8M72 34l-2 8" fill="none" stroke="#c4742b" stroke-width="3" />
        <path d="M30 56l14 6-14 6M90 56l-14 6 14 6" fill="none" />
        <g class="lcat-mouth">
          <path d="M38 76h44q-2 24-22 24t-22-24z" fill={INK} />
          <ellipse cx="60" cy="92" rx="10" ry="6" fill="#f4a3b4" stroke="none" />
        </g>
        <path d="M56 72h8l-4 5z" fill="#f4a3b4" strokeWidth="2" />
        <path d="M20 70l-14-2M20 78l-14 4M100 70l14-2M100 78l14 4" fill="none" strokeWidth="2" />
        <g class="lcat-tears" fill="#6cc4f0" stroke="#2f86c0" stroke-width="2">
          <path class="lcat-tear lcat-tear--l" d="M24 66q-7 10 0 16q7-6 0-16z" />
          <path class="lcat-tear lcat-tear--r" d="M96 66q-7 10 0 16q7-6 0-16z" />
        </g>
      </g>
    </svg>
  );
}
