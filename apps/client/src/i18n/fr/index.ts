import type { Messages } from "..";
import { cats } from "./cats";
import { common } from "./common";
import { game } from "./game";
import { help } from "./help";
import { home } from "./home";
import { settings } from "./settings";
import { waiting } from "./waiting";

export const fr: Messages = {
  ...common,
  ...home,
  ...waiting,
  ...game,
  ...settings,
  ...help,
  ...cats,
};
