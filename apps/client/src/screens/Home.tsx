import {
  CODE_LENGTH,
  GameCodeSchema,
  MAX_PLAYERS,
  MIN_PLAYERS,
  type PublicGame,
  type RoomStatus,
} from "@cd/protocol";
import { useEffect, useState } from "preact/hooks";
import { ApiError, getMe } from "../api";
import { Button } from "../components/Button";
import { Field } from "../components/Field";
import { GameList } from "../components/GameList";
import { SelfBadge } from "../components/SelfBadge";
import { GearButton, type Panel, Panels } from "../components/Settings";
import { type MessageKey, t, useT } from "../i18n";
import {
  getRemembered,
  removeRoomPassword,
  rememberMaxPlayers,
} from "../remembered";
import { navigate, type Route } from "../router";
import { forgetSession, getSession, listSessions, type Session } from "../session";
import { LobbySocket, type SocketStatus } from "../ws";
import { JoinDialog } from "./JoinDialog";
import { cleanCode } from "./Reclaim";

type MySession = { code: string } & Session;

const STATUS_KEY: Record<RoomStatus, MessageKey> = {
  lobby: "home.status.lobby",
  playing: "home.status.playing",
  finished: "home.status.finished",
};

function resume(code: string, status: RoomStatus | undefined): void {
  navigate(status === "playing" || status === "finished" ? "game" : "waiting", code);
}

/** "Your games": saved seats, each checked with `GET /me`; dropped on 401. */
function YourGames() {
  useT();
  const [sessions, setSessions] = useState<MySession[]>(() => listSessions());
  const [status, setStatus] = useState<Record<string, RoomStatus>>({});

  useEffect(() => {
    let alive = true;
    for (const s of listSessions()) {
      getMe(s.code, s.token).then(
        (me) => {
          if (alive) setStatus((cur) => ({ ...cur, [s.code]: me.status }));
        },
        (err: unknown) => {
          // 401 = session revoked; 404 = room deleted. Either way the seat is gone.
          if (err instanceof ApiError && (err.status === 401 || err.status === 404)) {
            forgetSession(s.code);
            removeRoomPassword(s.code);
            if (alive) setSessions((cur) => cur.filter((x) => x.code !== s.code));
          }
        },
      );
    }
    return () => {
      alive = false;
    };
  }, []);

  if (sessions.length === 0) return null;
  return (
    <section class="card stack" aria-labelledby="your-games">
      <h2 id="your-games">{t("home.yourGames")}</h2>
      <ul class="stack" style={{ listStyle: "none", margin: 0, padding: 0, gap: "var(--s2)" }}>
        {sessions.map((s) => {
          const st = status[s.code];
          return (
            <li key={s.code} class="row" style={{ flexWrap: "wrap" }}>
              <span class="stack" style={{ gap: 0, flex: "1 1 10rem", minWidth: 0 }}>
                <strong style={{ overflowWrap: "anywhere" }}>{s.roomName || s.code}</strong>
                <span class="muted" style={{ fontSize: "var(--fs-small)" }}>
                  {t("home.asName", { name: s.name })}
                  {st ? ` · ${t(STATUS_KEY[st])}` : ""}
                </span>
              </span>
              <Button onClick={() => resume(s.code, st)}>{t("home.resume")}</Button>
              <Button
                aria-label={t("home.forgetAria", { room: s.roomName || s.code })}
                onClick={() => {
                  forgetSession(s.code);
                  removeRoomPassword(s.code);
                  setSessions((cur) => cur.filter((x) => x.code !== s.code));
                }}
              >
                {t("home.forget")}
              </Button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** "Your record: 12 W – 2 T – 7 L" from this device's history; hidden while empty. */
function YourRecord() {
  useT();
  const [totals, setTotals] = useState({ wins: 0, ties: 0, losses: 0 });
  useEffect(() => {
    let off = () => {};
    let alive = true;
    void import("../history").then((m) => {
      if (!alive) return;
      const update = () => setTotals(m.historyTotals());
      update();
      off = m.onHistory(update);
    });
    return () => {
      alive = false;
      off();
    };
  }, []);
  const { wins, ties, losses } = totals;
  if (wins + ties + losses === 0) return null;
  return (
    <p class="muted" data-testid="your-record" style={{ margin: 0 }}>
      {t("home.record", { wins, ties, losses })}
    </p>
  );
}

/** Open a code: resume a saved seat, otherwise show the Join dialog. */
export function openCode(code: string): void {
  if (getSession(code)) navigate("waiting", code);
  else navigate("join", code);
}

function InviteCode() {
  useT();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | undefined>(undefined);
  return (
    <form
      class="card stack"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (!GameCodeSchema.safeParse(code).success) {
          setError(t("field.gameCode"));
          return;
        }
        setError(undefined);
        openCode(code);
      }}
    >
      <Field
        label={t("home.inviteLabel")}
        name="code"
        value={code}
        onValue={setCode}
        filter={cleanCode}
        error={error}
        maxLength={CODE_LENGTH}
        autocapitalize="characters"
        autocomplete="off"
        autocorrect="off"
        spellcheck={false}
        inputmode="text"
        enterkeyhint="go"
        addon={<Button type="submit">{t("common.join")}</Button>}
      />
    </form>
  );
}

const LOBBY_STATUS_KEY: Partial<Record<SocketStatus, MessageKey>> = {
  connecting: "conn.connecting",
  reconnecting: "conn.reconnecting",
};

export interface HomeProps {
  route: Route;
}

export function Home({ route }: HomeProps) {
  useT();
  const remembered = getRemembered();
  const [games, setGames] = useState<PublicGame[] | null>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [lobbyStatus, setLobbyStatus] = useState<SocketStatus>("connecting");
  const [setupPlayers, setSetupPlayers] = useState(remembered.maxPlayers);

  useEffect(() => {
    const lobby = new LobbySocket();
    const offGames = lobby.onGames(setGames);
    const offStatus = lobby.onStatus((s) => setLobbyStatus(s));
    lobby.connect();
    return () => {
      offGames();
      offStatus();
      lobby.close();
    };
  }, []);

  const joinCode = route.screen === "join" ? route.code : null;
  const statusKey = LOBBY_STATUS_KEY[lobbyStatus];
  const statusText = statusKey ? t(statusKey) : undefined;

  return (
    <main class="stack" style={{ paddingBlock: "var(--s6)" }}>
      <header class="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
        <h1 style={{ fontSize: "var(--fs-title)" }}>Color Dice</h1>
        <div class="row">
          <SelfBadge
            profile={remembered.profile}
            name={remembered.name || t("waiting.you")}
            onClick={() => setPanel("profile")}
          />
          <GearButton onClick={() => setPanel("settings")} />
        </div>
      </header>
      <Panels
        panel={panel}
        onPanel={setPanel}
        profile={remembered.profile}
        name={remembered.name || t("waiting.you")}
      />
      <div class="cols-2 stack">
        <div class="stack">
          <YourRecord />
          <YourGames />
          <InviteCode />
        </div>
        <section class="card stack" aria-labelledby="open-games">
          <div class="row" style={{ justifyContent: "space-between" }}>
            <h2 id="open-games">{t("home.openGames")}</h2>
            {statusText ? (
              <span class="muted" role="status" style={{ fontSize: "var(--fs-small)" }}>
                {statusText}
              </span>
            ) : null}
          </div>
          <div class="stack" style={{ gap: "var(--s2)" }}>
            <Button variant="primary" onClick={() => navigate("create")}>
              {t("home.setupGame")}
            </Button>
            <div class="row" style={{ gap: "var(--s2)", alignItems: "flex-end", flexWrap: "wrap" }}>
              <label class="stack" style={{ gap: "var(--s1)", flex: "1 1 160px" }}>
                <span>{t("home.setupPlayers")}</span>
                <input
                  class="input"
                  type="number"
                  min={MIN_PLAYERS}
                  max={MAX_PLAYERS}
                  step={1}
                  inputmode="numeric"
                  value={String(setupPlayers)}
                  aria-label={t("home.setupPlayers")}
                  onInput={(e) => {
                    const n = Number((e.currentTarget as HTMLInputElement).value);
                    if (!Number.isInteger(n) || n < MIN_PLAYERS || n > MAX_PLAYERS) return;
                    setSetupPlayers(n);
                    rememberMaxPlayers(n);
                  }}
                />
              </label>
              <Button
                onClick={() => {
                  const url = new URL(globalThis.location.href);
                  url.search = "";
                  url.hash = "";
                  url.searchParams.set("setup", "1");
                  url.searchParams.set("players", String(setupPlayers));
                  void navigator.clipboard?.writeText(url.href);
                }}
              >
                {t("home.copySetupLink")}
              </Button>
            </div>
          </div>
          <GameList games={games} onJoin={(g) => openCode(g.code)} />
        </section>
      </div>
      {joinCode ? (
        <JoinDialog key={joinCode} code={joinCode} games={games} onClose={() => navigate("home")} />
      ) : null}
    </main>
  );
}
