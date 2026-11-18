/** Status line in an aria-live region, plus the H13 roll / reveal announcements. */
export function StatusBar(props: { text: string; announce: string }) {
  return (
    <div class="g-status">
      <p role="status" aria-live="polite" class="g-status-text">
        {props.text}
      </p>
      <p class="sr-only" role="status" aria-live="polite" data-testid="announce">
        {props.announce}
      </p>
    </div>
  );
}
