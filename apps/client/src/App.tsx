import { useRoute } from "./router";
import { CreateGame } from "./screens/CreateGame";
import { Home } from "./screens/Home";
import { Placeholder } from "./screens/Placeholder";
import { Reclaim } from "./screens/Reclaim";
import { useAppState } from "./store";

export function App() {
  const route = useRoute();
  const { status, toast } = useAppState();

  let screen = null;
  switch (route.screen) {
    case "home":
    case "join":
      screen = <Home route={route} />;
      break;
    case "create":
      screen = <CreateGame />;
      break;
    case "reclaim":
      screen = <Reclaim key={route.code ?? ""} code={route.code} />;
      break;
    default:
      // Waiting room and game screens land in later tasks.
      screen = <Placeholder route={route} status={status} />;
  }

  return (
    <div class="app">
      {screen}
      <div class="sr-only" role="status" aria-live="polite">
        {toast?.text ?? ""}
      </div>
    </div>
  );
}
