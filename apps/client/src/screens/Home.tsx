import { CODE_LENGTH, GameCodeSchema, type PublicGame, type RoomStatus } from "@cd/protocol";
import { useEffect, useState } from "preact/hooks";
import { ApiError, getMe } from "../api";
import { Button } from "../components/Button";
import { Field } from "../components/Field";
import { GameList } from "../components/GameList";
import { GearButton, type Panel, Panels } from "../components/Settings";
import { navigate, type Route } from "../router";
import { forgetSession, getSession, listSessions, type Session } from "../session";
import { LobbySocket, type SocketStatus } from "../ws";
import { JoinDialog } from "./JoinDialog";
import { cleanCode } from "./Reclaim";

type MySession = { code: string } & Session;

const STATUS_TEXT: Record<RoomStatus, string> = {
  lobby: "waiting to start",
  playing: "in progress",
  finished: "finished",
};

function resume(code: string, status: RoomStatus | undefined): void {
  navigate(status === "playing" || status === "finished" ? "game" : "waiting", code);
}

/** "Your games": saved seats, each checked with `GET /me`; dropped on 401. */
function YourGames() {
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
      <h2 id="your-games">Your games</h2>
      <ul class="stack" style={{ listStyle: "none", margin: 0, padding: 0, gap: "var(--s2)" }}>
        {sessions.map((s) => {
          const st = status[s.code];
          return (
            <li key={s.code} class="row" style={{ flexWrap: "wrap" }}>
              <span class="stack" style={{ gap: 0, flex: "1 1 10rem", minWidth: 0 }}>
                <strong style={{ overflowWrap: "anywhere" }}>{s.roomName || s.code}</strong>
                <span class="muted" style={{ fontSize: "var(--fs-small)" }}>
                  <span class="num">{s.code}</span>
                  {" · as "}
                  {s.name}
                  {st ? ` · ${STATUS_TEXT[st]}` : ""}
                </span>
              </span>
              <Button onClick={() => resume(s.code, st)}>Resume</Button>
              <Button
                aria-label={`Forget ${s.roomName || s.code}`}
                onClick={() => {
                  forgetSession(s.code);
                  setSessions((cur) => cur.filter((x) => x.code !== s.code));
                }}
              >
                Forget
              </Button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Open a code: resume a saved seat, otherwise show the Join dialog. */
export function openCode(code: string): void {
  if (getSession(code)) navigate("waiting", code);
  else navigate("join", code);
}

function InviteCode() {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | undefined>(undefined);
  return (
    <form
      class="card stack"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (!GameCodeSchema.safeParse(code).success) {
          setError("Game codes are 5 letters or digits.");
          return;
        }
        setError(undefined);
        openCode(code);
      }}
    >
      <Field
        label="Have an invite code?"
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
        addon={<Button type="submit">Join</Button>}
      />
    </form>
  );
}

const LOBBY_STATUS_TEXT: Partial<Record<SocketStatus, string>> = {
  connecting: "Connecting…",
  reconnecting: "Reconnecting…",
};

export interface HomeProps {
  route: Route;
}

export function Home({ route }: HomeProps) {
  const [games, setGames] = useState<PublicGame[] | null>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [lobbyStatus, setLobbyStatus] = useState<SocketStatus>("connecting");

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
  const statusText = LOBBY_STATUS_TEXT[lobbyStatus];

  return (
    <main class="stack" style={{ paddingBlock: "var(--s6)" }}>
      <header class="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
        <h1 style={{ fontSize: "var(--fs-title)" }}>Color Dice</h1>
        <div class="row">
          <GearButton onClick={() => setPanel("settings")} />
          <Button variant="primary" onClick={() => navigate("create")}>
            Create game
          </Button>
        </div>
      </header>
      <Panels panel={panel} onPanel={setPanel} />
      <div class="cols-2 stack">
        <div class="stack">
          <YourGames />
          <InviteCode />
        </div>
        <section class="card stack" aria-labelledby="open-games">
          <div class="row" style={{ justifyContent: "space-between" }}>
            <h2 id="open-games">Open games (live)</h2>
            {statusText ? (
              <span class="muted" role="status" style={{ fontSize: "var(--fs-small)" }}>
                {statusText}
              </span>
            ) : null}
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
