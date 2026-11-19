/**
 * Eight original cartoon cats for reactions (K5.1): one shared head (same ears, muzzle and
 * whiskers) with a different face, paws and prop each. Drawn for this project, no meme imagery.
 */

import type { Reaction } from "@cd/protocol";
import type { ComponentChildren } from "preact";

const INK = "#3b2a20";
const FUR = "#f2a65a";
const PINK = "#f4a3b4";
const stroke = {
  stroke: INK,
  "stroke-width": 2,
  "stroke-linecap": "round",
  "stroke-linejoin": "round",
} as const;

/** Eyes + mouth per cat. Coordinates are in the 64×64 viewBox. */
const FACES: Record<string, ComponentChildren> = {
  cat_thumbs: (
    <>
      <path d="M17 30q4-5 8 0M39 30q4-5 8 0" fill="none" {...stroke} />
      <path d="M26 42q6 6 12 0" fill="none" {...stroke} />
    </>
  ),
  cat_lol: (
    <>
      <path d="M17 27l8 3-8 3M47 27l-8 3 8 3" fill="none" {...stroke} />
      <path d="M24 40h16q-1 11-8 11t-8-11z" fill={INK} stroke={INK} stroke-width="2" />
      <ellipse cx="32" cy="48" rx="4" ry="2.5" fill={PINK} />
      <path
        d="M12 36q-2 6 0 10M52 36q2 6 0 10"
        fill="none"
        stroke="#4aa8e8"
        stroke-width="3"
        stroke-linecap="round"
      />
    </>
  ),
  cat_shock: (
    <>
      <circle cx="22" cy="30" r="6" fill="#fff" {...stroke} />
      <circle cx="42" cy="30" r="6" fill="#fff" {...stroke} />
      <circle cx="22" cy="30" r="1.8" fill={INK} />
      <circle cx="42" cy="30" r="1.8" fill={INK} />
      <ellipse cx="32" cy="46" rx="4" ry="5" fill={INK} />
      <path d="M54 8v8M54 20v2" {...stroke} stroke="#e23b3b" stroke-width="3" />
    </>
  ),
  cat_cringe: (
    <>
      <path d="M17 31h9M38 31h9" fill="none" {...stroke} />
      <path d="M22 45h20v5H22z" fill="#fff" {...stroke} />
      <path d="M27 45v5M32 45v5M37 45v5" fill="none" stroke={INK} stroke-width="1.5" />
      <path d="M50 16q3 4 0 7q-3-3 0-7z" fill="#6cc4f0" />
    </>
  ),
  cat_fire: (
    <>
      <path d="M14 27h36v4q0 5-8 5t-8-4h-4q0 4-8 4t-8-5z" fill={INK} />
      <path d="M26 44q6 4 12 0" fill="none" {...stroke} />
      <path
        d="M32 2q8 8 4 14q4-1 5 4q-9 4-18 0q1-5 5-4q-3-6 4-14z"
        fill="#ff6a1a"
        stroke="#c43c00"
        stroke-width="1.5"
      />
      <path d="M32 9q4 5 1 9h-4q-2-4 3-9z" fill="#ffd23f" />
    </>
  ),
  cat_party: (
    <>
      <path d="M17 30q4-5 8 0M39 30q4-5 8 0" fill="none" {...stroke} />
      <path d="M24 40h16q-1 9-8 9t-8-9z" fill={INK} />
      <path d="M32 1l-9 15h18z" fill="#6c5ce7" {...stroke} stroke-width="1.5" />
      <circle cx="32" cy="1.5" r="2.5" fill="#ffd23f" />
      <path d="M26 11h12" stroke="#ffd23f" stroke-width="2" />
      <circle cx="8" cy="14" r="2" fill="#e23b3b" />
      <circle cx="56" cy="22" r="2" fill="#2e9e5b" />
      <circle cx="54" cy="8" r="1.8" fill="#4aa8e8" />
    </>
  ),
  cat_cry: (
    <>
      <path d="M17 29q4 4 8 0M39 29q4 4 8 0" fill="none" {...stroke} />
      <path d="M26 47q6-6 12 0" fill="none" {...stroke} />
      <path
        d="M21 33q-2 8-1 14M43 33q2 8 1 14"
        fill="none"
        stroke="#4aa8e8"
        stroke-width="3.5"
        stroke-linecap="round"
      />
    </>
  ),
  cat_clap: (
    <>
      <path d="M17 30q4-5 8 0M39 30q4-5 8 0" fill="none" {...stroke} />
      <path d="M26 41q6 6 12 0" fill="none" {...stroke} />
      <path d="M8 44l3 3M5 52l4 0M56 44l-3 3M59 52l-4 0" {...stroke} stroke-width="2" />
    </>
  ),
};

/** Paws drawn in front of the face (thumbs up, clapping). */
const PAWS: Record<string, ComponentChildren> = {
  cat_thumbs: (
    <>
      <rect x="38" y="50" width="16" height="12" rx="5" fill={FUR} {...stroke} />
      <rect x="43" y="40" width="6" height="14" rx="3" fill={FUR} {...stroke} />
    </>
  ),
  cat_clap: (
    <>
      <ellipse cx="25" cy="58" rx="8" ry="5" fill={FUR} {...stroke} />
      <ellipse cx="39" cy="58" rx="8" ry="5" fill={FUR} {...stroke} />
    </>
  ),
};

export function Cat({ id, size = 48 }: { id: Reaction; size?: number }) {
  return (
    <svg
      class="cat-svg"
      width={size}
      height={size}
      viewBox="0 0 64 64"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M10 28L12 6l17 11zM54 28L52 6L35 17z" fill={FUR} {...stroke} />
      <path d="M15 22l1-9 7 5zM49 22l-1-9-7 5z" fill={PINK} />
      <ellipse cx="32" cy="36" rx="23" ry="19" fill={FUR} {...stroke} />
      <path
        d="M32 18v5M26 19l1 4M38 19l-1 4"
        fill="none"
        stroke="#c4742b"
        stroke-width="2"
        stroke-linecap="round"
      />
      {FACES[id]}
      <path
        d="M30 37h4l-2 3z"
        fill={PINK}
        stroke={INK}
        stroke-width="1.2"
        stroke-linejoin="round"
      />
      <path
        d="M9 36l-6-1M9 40l-6 2M55 36l6-1M55 40l6 2"
        fill="none"
        stroke={INK}
        stroke-width="1.2"
        stroke-linecap="round"
      />
      {PAWS[id]}
    </svg>
  );
}
