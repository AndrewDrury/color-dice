import { render } from "preact";
import "./styles/tokens.css";
import "./styles/app.css";
import { App } from "./App";
import { mountLabIfRequested } from "./lab/route";
import { startRouter } from "./router";

startRouter();

const root = document.getElementById("app");
if (root) {
  // Dev only (`?lab=dice`): the lab is imported dynamically behind import.meta.env.DEV.
  mountLabIfRequested(root).then((lab) => {
    if (!lab) render(<App />, root);
  });
}
