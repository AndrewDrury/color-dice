import { z } from "zod";
import { REACTIONS } from "./chat";

/**
 * Player profile (T-NEW-13): public cosmetic data only, an outline colour plus a cat GIF avatar.
 * Allow-lists only; ids never carry filenames or free text.
 */
export const PROFILE_COLORS = [
  "coral",
  "amber",
  "lime",
  "teal",
  "sky",
  "indigo",
  "violet",
  "pink",
  "slate",
  "brown",
] as const;
export type ProfileColor = (typeof PROFILE_COLORS)[number];

/** The default avatar (the cat button image) and every reaction GIF id. */
export const DEFAULT_PROFILE_CAT = "mad-cat";
export const PROFILE_CATS = [...REACTIONS, DEFAULT_PROFILE_CAT] as const;
export type ProfileCat = (typeof PROFILE_CATS)[number];

export const ProfileSchema = z
  .object({ color: z.enum(PROFILE_COLORS), cat: z.enum(PROFILE_CATS) })
  .strict();
export type Profile = z.infer<typeof ProfileSchema>;

/** Public room info for the join dialogs: colours only (no names). `GET /api/games/:code/colors`. */
export const TakenColorsResSchema = z.object({ taken: z.array(z.enum(PROFILE_COLORS)) }).strict();
export type TakenColorsRes = z.infer<typeof TakenColorsResSchema>;

/** Colour for the n-th seat (1-based join order) when the client sent no profile. */
export function defaultProfile(order: number): Profile {
  const i = (Math.max(1, Math.floor(order)) - 1) % PROFILE_COLORS.length;
  return { color: PROFILE_COLORS[i] as ProfileColor, cat: DEFAULT_PROFILE_CAT };
}
