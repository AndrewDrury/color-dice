# Color Dice

An online dice game for 2 to 5 players. Create a room, share the 5-character code (or let it show up in the public room list), and play in real time from any browser. Rooms can be password protected. No accounts.

Play: https://andrewdrury.github.io/qwixx/

## Features

- 3D dice with sound and haptics (mute from the keyboard or Settings).
- Public room list, plus private rooms behind a password.
- Works on iPhone: open the page in Safari and use Add to Home Screen.
- Desktop keyboard shortcuts: Space or R rolls, P passes, M mutes, / or C opens chat, ? shows help, arrow keys move between boxes.
- English, French and Spanish. The language follows your browser and can be changed in Settings.
- Rejoin after a refresh or a lost connection; a win/tie/loss record per room and a history on your device.

## How to play

- Each player has a sheet with four colored rows. Two rows count up from 2 to 12, two count down from 12 to 2.
- On your turn you roll two white dice and four colored dice.
- Step 1, everyone at once: pick the sum of the two white dice and cross that number in any row, or pass. Choices stay hidden until all players have decided.
- Step 2, only the roller: add one white die to one colored die and cross the sum in that color's row, or pass.
- You may only cross to the right of your last cross, skipping boxes if you like (skipped boxes are lost for good).
- A row's final box needs at least 5 crosses in that row first. Crossing it locks the row for everybody.
- A roller who crosses nothing at all takes a penalty. Each penalty costs points.
- The game ends when two rows are locked or one player has taken four penalties.
- Score: every row is worth more the more crosses it has (it grows quickly), then penalties are subtracted. Highest total wins; ties are possible.

## Local development

Prerequisite: Node as pinned in `.nvmrc` (for example with `nvm use`).

```sh
npm ci
npm run dev:server    # Worker + Durable Objects on http://localhost:8787
npm run dev:client    # in a second terminal; Vite on http://localhost:5173
```

Open http://localhost:5173. Open a second browser profile or a private window to play against yourself.

Local-only settings (allowed origins, test hooks) live in a git-ignored `apps/server/.dev.vars`. Copy `apps/server/.dev.vars.example` to `apps/server/.dev.vars`; never commit it.

## Tests

```sh
npm run check   # typecheck, lint, i18n and wrangler checks, all unit tests, secret scan
npm run e2e     # Playwright end to end (starts both dev servers itself)
```

The first `npm run e2e` may need the Playwright browsers installed (`npx playwright install chromium`).

## Deploy

- Server (Cloudflare Worker with Durable Objects): sign in once with `npx wrangler login`, then `npm run deploy -w apps/server`.
- Client (static files): `npm run build` produces `apps/client/dist`, which is published to GitHub Pages. At build time it reads `VITE_SERVER_URL` (the deployed Worker URL, no trailing slash). Set it as a repository variable in GitHub: Settings, Secrets and variables, Actions, Variables. `VITE_BASE` sets the Pages sub-path (for example `/color-dice/`).
- Set the Worker's `ALLOWED_ORIGINS` in `apps/server/wrangler.jsonc` to the Pages origin so browsers may connect.

## Free-plan limits

The app is built to fit the Cloudflare Free plan (limits checked November 2026; re-check before launch):

| Resource                | Free limit per day |
| ----------------------- | ------------------ |
| Worker requests         | 100,000            |
| Durable Object requests | 100,000            |
| Durable Object duration | 13,000 GB-s        |
| SQLite rows written     | 100,000            |
| SQLite rows read        | 5 million          |

WebSocket messages count 1 request per 20 messages. Over a limit, the affected operations fail until 00:00 UTC (Workers reply with an error page); players would see connection or action errors, and games resume afterwards because state is stored. Casual use stays far below these numbers; row writes are the tightest limit, so each action writes a small amount.

## More

Design, protocol and security notes: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
