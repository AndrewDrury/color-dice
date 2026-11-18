/** Dev-server-only entry for src/lab/index.html (not a build input, so never shipped). */
import "../styles/tokens.css";
import "../styles/app.css";
import { mountLabIfRequested } from "./route";

const root = document.getElementById("app");
if (root && !location.search.includes("lab=")) history.replaceState(null, "", "?lab=dice");
if (root) void mountLabIfRequested(root);
