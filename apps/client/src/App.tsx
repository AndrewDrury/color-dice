import { useEffect } from "preact/hooks";
import { ConnectionBanner } from "./components/ConnectionBanner";
import { Toast } from "./components/Toast";
import { useLocale } from "./i18n";
import { getPrefs, onPrefs } from "./prefs";
import { useRoute } from "./router";
import { CreateGame } from "./screens/CreateGame";
import { Game } from "./screens/Game";
import { Home } from "./screens/Home";
import { InviteJoin } from "./screens/InviteJoin";
import { Placeholder } from "./screens/Placeholder";
import { Reclaim } from "./screens/Reclaim";
import { WaitingRoom } from "./screens/WaitingRoom";
import { useAppState } from "./store";
import "./styles/polish.css";

/** Mirror the theme and motion prefs onto <html> (tokens.css and polish.css key off them). */
export function applyPrefs(root: HTMLElement = document.documentElement): void {
  const { theme, motion } = getPrefs();
  if (theme === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);
  if (motion === "reduced") root.setAttribute("data-motion", "reduced");
  else root.removeAttribute("data-motion");
}

export function App() {
  useLocale(); // re-render the whole tree when the language changes
  const route = useRoute();
  const { status } = useAppState();
  useEffect(() => {
    applyPrefs();
    return onPrefs(() => applyPrefs());
  }, []);

  let screen = null;
  switch (route.screen) {
    case "home":
    case "join":
      screen = <Home route={route} />;
      break;
    case "create":
      screen = <CreateGame />;
      break;
    case "invite":
      screen = route.code ? <InviteJoin key={route.code} code={route.code} /> : null;
      break;
    case "reclaim":
      screen = <Reclaim key={route.code ?? ""} code={route.code} />;
      break;
    case "waiting":
      screen = route.code ? <WaitingRoom key={route.code} code={route.code} /> : null;
      break;
    case "game":
      screen = route.code ? <Game key={route.code} code={route.code} /> : null;
      break;
    default:
      screen = <Placeholder route={route} status={status} />;
  }

  return (
    <div class="app">
      {screen}
      <ConnectionBanner />
      <Toast />
    </div>
  );
}
