import { render } from "preact";
import "./styles/tokens.css";
import "./styles/themes.css";
import "./styles/app.css";
import { App, startPrefs } from "./App";
import { initI18n } from "./i18n";
import { startRouter } from "./router";
import { startUpdates } from "./update";

startPrefs(); // theme before anything paints
startRouter();

const root = document.getElementById("app");
if (root) {
  // Dev only (`?lab=dice`): the lab is imported dynamically behind import.meta.env.DEV.
  // Load the active language first so the page never flashes English.
  initI18n().then(() => {
    const mountLab = import.meta.env.DEV
      ? import("./lab/route").then((m) => m.mountLabIfRequested(root))
      : Promise.resolve(false);
    mountLab.then((lab) => {
      if (!lab) {
        render(<App />, root);
        startUpdates();
      }
    });
  });
}
