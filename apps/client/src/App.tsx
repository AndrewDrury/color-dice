import { useRoute } from "./router";
import { CreateGame } from "./screens/CreateGame";
import { Home } from "./screens/Home";
import { Placeholder } from "./screens/Placeholder";
import { Reclaim } from "./screens/Reclaim";
import { WaitingRoom } from "./screens/WaitingRoom";
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
    case "waiting":
      screen = route.code ? <WaitingRoom key={route.code} code={route.code} /> : null;
      break;
    default:
      // The game screen lands in a later task.
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
