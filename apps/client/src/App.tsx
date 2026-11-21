import type { ComponentType } from "preact";
import { useEffect, useState } from "preact/hooks";
import { ConnectionBanner } from "./components/ConnectionBanner";
import { Toast } from "./components/Toast";
import { UpdateToast } from "./components/UpdateToast";
import { useLocale } from "./i18n";
import { getPrefs, onPrefs, THEME_SCHEME } from "./prefs";
import { useRoute } from "./router";
import { Game } from "./screens/Game";
import { Home } from "./screens/Home";
import { Placeholder } from "./screens/Placeholder";
import { Reclaim } from "./screens/Reclaim";
import { WaitingRoom } from "./screens/WaitingRoom";
import { useAppState } from "./store";
import { useDocumentTitle } from "./useDocumentTitle";
import "./styles/polish.css";

/**
 * Mirror the theme and motion prefs onto <html> (tokens.css, themes.css and polish.css key off
 * them): data-theme = explicit theme id, data-scheme = its light/dark base.
 */
export function applyPrefs(root: HTMLElement = document.documentElement): void {
  const { theme, motion } = getPrefs();
  root.dataset.theme = theme;
  const scheme = THEME_SCHEME[theme];
  root.dataset.scheme = scheme;
  if (motion === "reduced") root.dataset.motion = motion;
  else delete root.dataset.motion;
  const bar = getComputedStyle(root).getPropertyValue("--table").trim();
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => {
    m.setAttribute("content", bar);
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
  const [DemoScreen, setDemoScreen] = useState<ComponentType | null>(null);
  const [CreateScreen, setCreateScreen] = useState<ComponentType | null>(null);
  const [InviteScreen, setInviteScreen] = useState<ComponentType<{ code: string }> | null>(null);
  useDocumentTitle(route, route.code !== null && view?.code === route.code ? view : null);
  useEffect(() => {
    let alive = true;
    if (route.screen === "demo") {
      void import("./demo").then((m) => {
        if (alive) setDemoScreen(() => m.DemoScreen);
      });
    } else if (route.screen === "create") {
      void import("./screens/CreateGame").then((m) => {
        if (alive) setCreateScreen(() => m.CreateGame);
      });
    } else if (route.screen === "invite") {
      void import("./screens/InviteJoin").then((m) => {
        if (alive) setInviteScreen(() => m.InviteJoin);
      });
    }
    return () => {
      alive = false;
    };
  }, [route.screen]);
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
      screen = CreateScreen ? <CreateScreen /> : null;
      break;
    case "invite":
      screen =
        route.code && InviteScreen ? <InviteScreen key={route.code} code={route.code} /> : null;
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
    case "demo":
      screen = DemoScreen ? <DemoScreen /> : null;
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
