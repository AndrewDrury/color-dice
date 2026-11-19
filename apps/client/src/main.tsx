import { render } from "preact";
import "./styles/tokens.css";
import "./styles/app.css";
import { App } from "./App";
import { initI18n } from "./i18n";
import { mountLabIfRequested } from "./lab/route";
import { startRouter } from "./router";
import { startUpdates } from "./update";

startRouter();

const root = document.getElementById("app");
if (root) {
  // Dev only (`?lab=dice`): the lab is imported dynamically behind import.meta.env.DEV.
  // Load the active language first so the page never flashes English.
  initI18n().then(() =>
    mountLabIfRequested(root).then((lab) => {
      if (!lab) {
        render(<App />, root);
        startUpdates();
      }
    }),
  );
}
