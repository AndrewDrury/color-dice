import { common } from "./common";
import { game } from "./game";
import { help } from "./help";
import { home } from "./home";
import { settings } from "./settings";
import { waiting } from "./waiting";

export const en = { ...common, ...home, ...waiting, ...game, ...settings, ...help } as const;
