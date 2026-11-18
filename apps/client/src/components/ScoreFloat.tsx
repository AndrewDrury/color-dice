import { useEffect } from "preact/hooks";

/** "+N" rising from a row score for 600 ms, then removed. */
export function ScoreFloat(props: { amount: number; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(props.onDone, 650);
    return () => clearTimeout(t);
  }, [props.onDone]);
  return (
    <span class="g-float num" aria-hidden="true">
      +{props.amount}
    </span>
  );
}
