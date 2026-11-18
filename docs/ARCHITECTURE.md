# Architecture

## Overview

Color Dice is a thin browser client talking to an authoritative server. The server rolls the dice, holds every hidden choice and decides legality; the client only draws the view it receives and sends commands.

```
 Browsers (2-5 players + anonymous visitors)
        |  HTTPS: static files
        v
 +--------------------------------------------------------------+
 | GitHub Pages: Vite + Preact build of apps/client             |
 +--------------------------------------------------------------+
        |  HTTPS /api/*      WSS /ws/lobby      WSS /ws/game/:code
        v
 +--------------------------------------------------------------+
 | Cloudflare Worker (apps/server/src/index.ts)                 |
 |  router, Origin allow-list, CORS, per-IP rate-limit check    |
 |  forwards to a Durable Object; no game logic                 |
 +--------------------------------------------------------------+
        |                    |                      |
        v                    v                      v
 +-------------+     +----------------+     +---------------------------+
 | RateLimiter |     | Lobby          |<----| GameRoom (one per code)   |
 | (per IP)    |     | (single "main")|upsert| meta, password hash,     |
 | fixed window|     | public list,   |remove| seats + token hashes,    |
 | counters    |     | anon sockets   |     | engine state, sockets,    |
 +-------------+     +----------------+     | alarms (cleanup)          |
                                            +---------------------------+
```

Why the server is authoritative: simultaneous Action-1 choices must stay hidden until everyone has decided, dice must come from a source players cannot influence (`crypto.getRandomValues`), a Durable Object handles one event at a time so there are no races, and passwords and sessions can only be checked by something players cannot read.

## Packages

npm workspaces; TypeScript throughout.

| Path                                 | Role                                                                                                                                                                     |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `packages/engine` (`@cd/engine`)     | Pure game rules: state, legal moves, scoring, dice, per-player `view`, JSON (de)serialization. No runtime dependencies, no I/O, fully deterministic given a dice source. |
| `packages/protocol` (`@cd/protocol`) | Shared message types, zod schemas, error codes and every fixed limit (name lengths, rate limits, TTLs). Imported by server and client.                                   |
| `apps/server`                        | Worker plus the `GameRoom`, `Lobby` and `RateLimiter` Durable Objects (`wrangler.jsonc`).                                                                                |
| `apps/client`                        | Vite + Preact single-page app: screens, 3D dice, sound, i18n, local storage. Thin: it never decides legality.                                                            |
| `e2e`                                | Playwright specs that drive several browser contexts against the real dev servers.                                                                                       |
| `scripts`                            | Repo checks: no `innerHTML`, i18n key parity, wrangler config, secret scan, bundle size.                                                                                 |

## Server (Durable Objects)

The Worker only routes: it checks the `Origin` allow-list, applies CORS, asks the `RateLimiter` for the caller's IP, and forwards to the right object. Routes: `GET /health`, `GET|POST /api/games`, `PATCH /api/games/:code`, `POST /api/games/:code/{join,reclaim,start,leave,kick}`, `GET /api/games/:code/{me,invite}`, `POST /api/games/:code/invite/reset`, `WS /ws/lobby`, `WS /ws/game/:code`.

All three classes use SQLite-backed storage (required on the Free plan).

- **GameRoom** (one per 5-character code, `idFromName(code)`): room settings, the PBKDF2 password hash, seats with SHA-256 session-token hashes, per-room record, the serialized engine state, chat, and the player WebSockets (hibernating). It rolls dice, validates every command against the engine, auto-passes players who are away, applies join lockout (10 wrong passwords lock the room for 15 minutes), and increments `version` on every accepted change before broadcasting a fresh per-seat view. Alarms delete idle rooms (7 days), finished rooms (24 hours) and abandoned rooms (no connected seat for 30 minutes) and keep the lobby in sync. A room is also deleted at once when its last lobby player leaves or every seat has left a started game (`leave` during play marks the seat LEFT: its token stops working and it is auto-passed).
- **Lobby** (single instance named `main`): the public list of open rooms (`code`, `roomName`, `players`, `maxPlayers`, `createdAt` only: no player names), fed by GameRoom upsert/remove calls. Anonymous read-only sockets receive `games` messages; stale entries are pruned. It holds no game state.
- **RateLimiter** (one per IP): fixed-window counters for create (5 per 10 min), join and reclaim (5 per minute), list (60 per minute) and WebSocket connects (30 per minute); an alarm drops expired windows.

## Protocol

Defined and validated in `packages/protocol` (strict zod schemas; unknown fields are rejected). The socket's first message must be `auth`; the token never appears in a URL.

| Direction        | Message                  | Purpose                                                           |
| ---------------- | ------------------------ | ----------------------------------------------------------------- |
| client to server | `auth`                   | session token, first message                                      |
|                  | `roll`                   | active player rolls (carries the turn number)                     |
|                  | `action1`                | PASS, or MARK with the sum of the two white dice in a color       |
|                  | `action2`                | PASS, or MARK with one white die and one colored die              |
|                  | `setAway`                | mark a seat away or back                                          |
|                  | `rematch`                | ask for another game in the same room                             |
|                  | `chat`, `react`          | text message (max length, cleaned) or one of a fixed set of emoji |
|                  | `ping`                   | keep-alive (every 25 s)                                           |
| server to client | `view`                   | the full per-seat view, with a `version`                          |
|                  | `error`                  | error code, reason, and the command that failed                   |
|                  | `kicked`, `sessionEnded` | this seat was removed / the room is gone                          |
|                  | `chat`, `chatHistory`    | live message / last messages after auth                           |
|                  | `pong`                   | reply to `ping`                                                   |
| lobby socket     | `games`                  | the whole public list (the only message it sends)                 |

Join, reclaim, start, leave and kick go over HTTP (above) and answer with a seat id and token. Every failed join returns the same `E_BAD_CREDENTIALS` body.

**View privacy rule.** The server builds a separate view per seat. Opponents' sheets and score rows are `null` until `GAME_OVER`, and `you.action1Decision` holds only your own choice; other seats' Action-1 decisions are not sent at all until the reveal. Public information is limited to what a table would show: names, locked rows, penalty counts, dice, the event log and the room record.

**Record.** Each room keeps a wins-ties-losses (W-T-L) record per seat, updated when a game ends (a sole winner gets a win and everyone else a loss; shared top score is a tie). It is public by design. Rematch reuses the room, so the record accumulates.

## Client

Preact + Vite, state in a small store (`store.ts`) fed by `ws.ts` (auth first, reconnect with backoff) and `api.ts` (bearer-token HTTP). Screens: Home, Create, Join, Reclaim, Waiting room, Game, Game over. Game components render the `view` and highlight only the options the server lists in `you.legalAction1/2`.

- **Sessions and device storage**: per-room session tokens, remembered room passwords (opt-out), preferences and history live in `localStorage` under `colorDice:*` keys, always read defensively. A record transfer code moves the record between devices.
- **History**: `history.ts` keeps this device's own results (W, T or L per game, capped at 200, de-duplicated by room code and game number) and never sends them anywhere.
- **i18n**: English, French and Spanish. With the default "auto" setting the language is the first of `navigator.languages` whose primary subtag is en, fr or es (else English); Settings can force one. Catalogs load lazily; `npm run lint:i18n` enforces identical keys in all three.
- **Feel**: CSS 3D dice, WebAudio sound, vibration where supported, wake lock, reduced-motion respected, keyboard shortcuts on desktop. No `innerHTML` is used anywhere (`npm run lint:nohtml`).
- **Config**: `VITE_SERVER_URL` is the Worker origin baked in at build time (default `http://localhost:8787`); `VITE_BASE` is the Pages sub-path.

## Security

Evidence for the security checklist. Each line is: item → how it is enforced → proving test (`file › test name`).
Paths: server tests `apps/server/test/`, client tests `apps/client/test/`, e2e `e2e/`, engine `packages/engine/test/`, protocol `packages/protocol/test/`.

### Server checklist

- **Passwords: PBKDF2 + salt, timing-safe, never stored plain, logged or returned** → `crypto.ts` hashes with PBKDF2 and a per-call salt, and verifies against the stored iteration count; stored records hold only the hash → `crypto.test.ts › hash then verify is true; wrong password is false`, `› uses a different salt each call`, `› verifies with the stored iteration count, not the env one`; `room-lobby.test.ts › no plain password or token in any stored value`.
- **Session tokens: 32 random bytes, only SHA-256 stored, never in a URL** → tokens are 32 random bytes (43 base64url chars); the server stores `hashToken`; compared with `tokenHashEquals` → `crypto.test.ts › is 43 chars of base64url and unique across 1000 calls`, `› hashToken is SHA-256 hex and deterministic`, `› tokenHashEquals compares in constant time and handles length mismatch`. Transport: HTTP uses the `Authorization` header (`api.test.ts › sends the bearer token`, which also asserts the exact URL has no token); the socket sends `auth` as its first message (`ws.test.ts › sends auth first, goes online on a valid view, and pings every 25 s`, URL asserted to be `/ws/game/CODE`).
- **Every failed join is `E_BAD_CREDENTIALS`; per-room lockout and per-IP limits** → same 401 body for wrong password and unknown code; 10 wrong attempts lock the room for 15 min; Rate-limiter DO per IP → `room-lobby.test.ts › wrong password → 401 with exactly the same body as an unknown code`, `› 10 wrong → right password still 401; unlocked after 15 min`; `ratelimit.test.ts › 6th join within 60 s is refused; after the window it is ok again`, `› create allows 5 per 10 min`; `e2e/passwords.spec.ts › 10 wrong attempts lock the room: the right password is refused, the host sees the banner`.
- **Public list and lobby socket use an explicit allow-list** → `publicEntry` builds each entry field by field; the lobby DO rejects extra fields → `room-lobby.test.ts › publicEntry uses an explicit allow-list`, `› create → join → me, and the lobby lists public fields only`; `lobby.test.ts › rejects entries with extra fields (e.g. a password)`, `› upsert ×3 → list newest first with public fields only`; `e2e/public-list.spec.ts › public list: listed rooms appear live and vanish on start; unlisted rooms join by code`.
- **Invite link (K2.1)** → threat model: the link `…/#/join/<CODE>/<inviteKey>` is a bearer capability equal to the room password. The key is 32 random bytes (256 bits, base64url), stored in the room's DO storage (a random room-scoped secret, not a human password, and seated players must be able to read it back via `GET …/invite`). It sits in the URL **fragment**, which browsers never send to any server, so it stays out of Pages/Worker logs and Referer headers. `join`/`reclaim` take exactly one of `password` or `invite` (both/neither → 400). The check hashes both sides to SHA-256 and compares with `timingSafeEqual`; a wrong key counts toward the same 10-strike lockout and per-IP join limit and returns the same `401 E_BAD_CREDENTIALS`. The host can rotate it (`POST …/invite/reset`), and changing the password rotates it too; the old key stops working at once. It is never in the lobby list, `view` frames, error bodies or logs → `invite.test.ts › create returns a 256-bit key; joining with it needs no password`, `› both or neither of password/invite → 400, and the 400 body never echoes the key`, `› wrong invite → the same 401 body as a wrong password and an unknown code`, `› host reset rotates the key at once; non-host → 403`, `› changing the password rotates the key`, `› 1,000 random keys are all rejected with the same 401`, `› wrong invites and passwords share the 10-strike lockout`, `› the key is never in a WS frame, the public list, an error body or the logs`; `crypto.test.ts › inviteKeyEquals matches exactly, any length, and never matches an empty stored key`; `protocol/invite.test.ts › join and reclaim take exactly one of password or invite`.
- **Public list carries no player names (K2.3)** → `PublicGame` is `{ code, roomName, players, maxPlayers, createdAt }` (strict); neither the host's nor any player's name is published → `invite.test.ts › GET /api/games carries no player names`; `room-lobby.test.ts › create → join → me, and the lobby lists public fields only`; `protocol/invite.test.ts › entries carry no player names`.
- **Hidden info: no other seat's Action 1 choice before the reveal** → the engine `view` exposes only your own decision and booleans for others → `engine/view.test.ts › never leaks another seat's pending Action 1 decision`, `› is identical for a viewer whatever the other seats chose`; `room-play.test.ts › 5 players: hidden Action 1 decisions are never leaked before the reveal`; `e2e/hidden-info.spec.ts › hidden info: A receives neither B's nor C's Action 1 choice before the reveal` (frame inspection).
- **Opponents' sheet and `score.rows` are `null` until GAME_OVER** → the engine view redacts them in every non-GAME_OVER phase; public total and penalties stay; the protocol schema accepts the null shape → `engine/view.test.ts › redacts other seats' sheet and score rows in every non-GAME_OVER phase`, `› reveals every card to everyone at GAME_OVER`, `› hides opponents again in a fresh game (rematch reset)`; `protocol/view.test.ts › parses hidden opponent cards (sheet and score.rows null)`; `full-game.test.ts › 5 players: opponent cards are never sent before GAME_OVER, all are after, null again after rematch`; `e2e/hidden-info.spec.ts › hidden info: opponent cards are not rendered or sent before game over, all revealed after`.
- **All client input validated with zod; unknown fields rejected; malformed → `E_INVALID_COMMAND`, state unchanged** → strict schemas for HTTP bodies and socket frames → `protocol/schemas.test.ts › rejects extra fields`, `› rejects malformed messages`; `hardening.test.ts › rejects a non-JSON content type with 415`, `› readJson caps the body at 4 KB`; `router.test.ts › readJson accepts valid bodies and rejects bad ones with 400`; `security.test.ts › unknown fields and malformed commands → E_INVALID_COMMAND, state unchanged`; `room-play.test.ts › 5 invalid frames close with 4008; ping → pong`.
- **WebSocket `Origin` check and CORS allow-list** → WS upgrades and POSTs with a missing or disallowed Origin get 403; CORS headers only for `ALLOWED_ORIGINS` → `health.test.ts › WS upgrade with a bad Origin returns 403`, `› WS upgrade with no Origin returns 403`, `› preflight from a disallowed origin gets no ACAO header`; `hardening.test.ts › rejects a present-but-disallowed Origin on POST with 403`.
- **No `innerHTML` / `dangerouslySetInnerHTML`; XSS-name e2e** → `scripts/no-inner-html.mjs` (`npm run lint:nohtml`, part of `check`); all user text is rendered as React text → `e2e/xss.spec.ts › room and player names render as text and never run script`; `client chat.test.tsx › renders markup as literal text`.
- **`ALLOW_TEST_HOOKS` absent from production config** → `scripts/check-wrangler.mjs` (`npm run lint:wrangler`, part of `check`) fails if `ALLOW_TEST_HOOKS` or `PBKDF2_ITERATIONS` is in any wrangler `vars`, or ALLOWED_ORIGINS lists localhost; the hook route also 404s without the flag → `room-play.test.ts › dice route is 404 when ALLOW_TEST_HOOKS is not 1`.
- **Lobby socket takes no commands; game socket cannot act before `auth` and only as its own seat** → lobby closes 4008 on any message; game socket closes 4001 before auth; commands carry no seat (the seat comes from the authenticated socket) → `lobby.test.ts › sends the list on connect, updates after upsert, closes 4008 on any message`; `room-play.test.ts › command before auth closes 4001; bad token → sessionEnded + 4004`, `› passive roll → E_NOT_ACTIVE_PLAYER, version unchanged; stale turn → E_STALE_TURN`; `chat.test.ts › a reclaimed (old) session cannot send`.
- **Host-only actions check the host flag on the server** → `room-lobby.test.ts › non-host start/kick/patch → 403`; `security.test.ts › host-only setAway from a non-host seat → E_NOT_HOST`.
- **Alarms delete idle and finished rooms and remove them from the lobby** → `room-lobby.test.ts › deletes an idle room and removes it from the lobby`; `cleanup.test.ts › no socket for 30 min → deleted and unlisted; 29 min → kept`, `› a reconnect within 30 min pushes the deadline back`, `› the seat becomes LEFT: session ends (4004), auto-passed, host passes on`, `› the last lobby player leaving deletes the room and its public entry`; `room-ttl.test.ts › a finished room is deleted by the alarm after 25 h, but not after 23 h`, `› rematch resets finishedAt and the finished-room TTL no longer applies`; `lobby.test.ts › hides entries idle > 30 min and caps the list at 50`.
- **Chat and reactions: authed seats only, `.strict()`, cleaned and capped at 200, reaction allow-list, per-seat rate limit, text only, never logged, never in the public list** → `chat.test.ts › closes unauthed senders with 4001; extra fields are invalid`, `› rejects empty, control-only and over-long text; echoes HTML verbatim`, `› broadcasts allow-listed reactions; rejects others`, `› rate limits the 6th text to the sender only`, `› never reaches the public list`; `protocol/chat.test.ts › parses chat and react, strictly`; `security.test.ts › chat text is never written to the logs`; client renders as text: `client chat.test.tsx › renders markup as literal text`; `e2e/chat.spec.ts › chat: toast + reaction reach others without blocking input; history survives reload; text is inert`.

### Client and data-on-device

- **Remembered room passwords (Q-009)** → stored in plain text in `localStorage` on the device only, capped at 20 rooms, dropped when the session is forgotten, never stored on a failed join, with an opt-out checkbox and Settings › Clear saved info → `remembered.test.tsx › caps per-room passwords at 20, evicting the oldest`, `› drops a room password once the session is forgotten`, `› a wrong password is never stored`, `› checkbox off stores nothing and removes old values`, `› shows no password and Clear saved info wipes everything`.
- **Record transfer code import is strictly validated** → the code is parsed and every field range-checked; garbage or oversized input is ignored without throwing and never double-counts → `client record.test.tsx › ignores garbage and oversized input without throwing`, `› merges and never double-counts`, `› ignores corrupt storage and drops malformed entries`.
- **Win/loss record is public info** → the per-room W-L/T record is part of the public view by design (no secrets); only the opponents' cards are hidden → `server record.test.ts › sole winner gets a win, the rest a loss`, `protocol/view.test.ts › accepts the C7 sample and a lobby view`.
- **Session tokens in `localStorage` (Q-004, accepted risk)** → tokens live under `colorDice:sessions` on the shared `github.io` origin, so another Pages project or an XSS there could read them. Accepted until there is a custom domain. Mitigations: tokens are per-room and are invalidated on reclaim, kick or room deletion; no `innerHTML` anywhere → `session.test.ts › saves, lists, gets and forgets under colorDice:sessions`, `› refuses to save invalid sessions`.
- **Engine state integrity** → `fromJSON` structurally validates stored state (shape, row lengths, seat range, phase) and throws a clear `TypeError` on corruption → `engine/serialize.test.ts › rejects %s with a clear error`, `› round-trips byte-equal`.

### Public repository

- **`lint:secrets:history` passes; new commits use the noreply address** → `scripts/secret-scan.mjs --history` scans every file of every commit for secrets, keys, `.dev.vars`/`.env`, `.plan/`, `CLAUDE.md`, home paths and personal emails (older commits allow-listed by human decision, T-SEC-1). Evidence: running `npm run lint:secrets:history`.
- **`.gitignore` covers `.env*`, `.dev.vars*`, `*.pem`, `*.key`, `.plan/`, `CLAUDE.md`** → `protocol/repo-hygiene.test.ts › .gitignore covers env files, dev vars, keys, .plan/ and CLAUDE.md (examples stay tracked)`.
- **CI runs `lint:secrets`; the built bundle has no secrets; no secrets in logs or artifacts** → `lint:secrets` is the last step of `npm run check`; `npm run lint:secrets:dist` scans the client build; workflows never echo secrets and upload no artifacts containing them. Evidence: the scripts above (no unit tests; the scanner is the test).

## Testing

Pyramid, cheapest at the bottom. `npm run check` runs everything except e2e.

1. **Engine** (`packages/engine/test`): unit tests for rules, scoring, dice and edge cases, determinism, serialization, plus property-based fuzzing (fast-check) that plays random games and asserts invariants after every step.
2. **Protocol** (`packages/protocol/test`): schema accept/reject tests, view fixtures, repo-hygiene checks.
3. **Server** (`apps/server/test`): vitest with the Cloudflare vitest plugin, running inside the real Workers runtime with real Durable Objects: lobby, rooms, lockout, rate limits, TTLs, full games over sockets, privacy and security tests.
4. **Client** (`apps/client/test`): vitest with happy-dom and Testing Library: components, store, i18n, session, record and history logic.
5. **End to end** (`e2e`): Playwright against the real worker and Vite dev servers, with several browser contexts standing in for several computers (two- and five-player games, hidden information, passwords, reconnects, mobile viewport, three languages, XSS). Run with `npm run e2e`.

Static checks in `npm run check`: `tsc -b`, Biome, `lint:nohtml`, `lint:i18n`, `lint:wrangler` and `lint:secrets`.

## Deploy
