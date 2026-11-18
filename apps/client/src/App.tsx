import { useRoute } from "./router";
import { Placeholder } from "./screens/Placeholder";
import { useAppState } from "./store";

export function App() {
  const route = useRoute();
  const { status, toast } = useAppState();
  return (
    <div class="app">
      <Placeholder route={route} status={status} />
      <div class="sr-only" role="status" aria-live="polite">
        {toast?.text ?? ""}
      </div>
    </div>
  );
}
