import { ConnectionBanner } from "./components/ConnectionBanner";
import { Toast } from "./components/Toast";
import { UpdateToast } from "./components/UpdateToast";
import { useLocale } from "./i18n";
import { getPrefs, onPrefs, THEME_SCHEME } from "./prefs";
import { useRoute } from "./router";
import { CreateGame } from "./screens/CreateGame";
import { Game } from "./screens/Game";
import { Home } from "./screens/Home";
import { InviteJoin } from "./screens/InviteJoin";
import { Placeholder } from "./screens/Placeholder";
import { Reclaim } from "./screens/Reclaim";
import { WaitingRoom } from "./screens/WaitingRoom";
import { useAppState } from "./store";
import { useDocumentTitle } from "./useDocumentTitle";
import "./styles/polish.css";

/**
 * Mirror the theme and motion prefs onto <html> (tokens.css, themes.css and polish.css key off
 * them): data-theme = theme id, data-scheme = its light/dark base. Classic (auto) has no
 * data-scheme, so CSS prefers-color-scheme decides and follows the system live.
 */
export function applyPrefs(root: HTMLElement = document.documentElement): void {
  const { theme, motion } = getPrefs();
  root.dataset.theme = theme;
  const scheme = THEME_SCHEME[theme];
  if (scheme === "auto") delete root.dataset.scheme;
  else root.dataset.scheme = scheme;
  if (motion === "reduced") root.dataset.motion = motion;
  else delete root.dataset.motion;
  const bar = getComputedStyle(root).getPropertyValue("--table").trim();
  document.querySelectorAll('meta[name="theme-color"]').forEach((m, i) => {
    m.setAttribute("content", theme === "classic" ? (["#EFE9DF", "#0E131C"][i] ?? bar) : bar);
  });
}

/** Boot (main.tsx, before the first render so nothing flashes): apply now and on every change. */
export function startPrefs(): void {
  onPrefs(() => applyPrefs());
  applyPrefs();
}

export function App() {
  useLocale(); // re-render the whole tree when the language changes
  const route = useRoute();
  const { status, view } = useAppState();
  useDocumentTitle(route, route.code !== null && view?.code === route.code ? view : null);

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
      <UpdateToast />
    </div>
  );
}
