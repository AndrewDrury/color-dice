import type { ClientMessage } from "@cd/protocol";
import { MIN_PLAYERS, type ViewMessage } from "@cd/protocol";
import { useEffect, useRef, useState } from "preact/hooks";
import { ApiError, kickSeat, leaveGame, startGame } from "../api";
import { resetChat, routeChat, routeChatError } from "../chat/store";
import { Button } from "../components/Button";
import { ChatControls, ChatLayer } from "../components/ChatButton";
import { CopyButton } from "../components/CopyButton";
import { Dialog } from "../components/Dialog";
import { FieldError, requestErrorText } from "../components/Field";
import { RoomSettings } from "../components/RoomSettings";
import { type Seat, SeatList } from "../components/SeatList";
import { feedback } from "../fx/feedback";
import { navigate } from "../router";
import { forgetSession, getSession } from "../session";
import { applyView, clearView, getState, setStatus, showToast, useAppState } from "../store";
import { type EndReason, GameSocket } from "../ws";

export const KICKED_TEXT = "You were removed from the game";
export const ENDED_TEXT = "Your session ended";

/** `…/<base>/?game=CODE` — the code only, never the password. */
export function inviteUrl(code: string): string {
  return `${globalThis.location.origin}${import.meta.env.BASE_URL}?game=${encodeURIComponent(code)}`;
}

/** "HH:MM" in local time. */
export function clockTime(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** Label for the host's Start button. */
export function startLabel(players: number, maxPlayers: number): string {
  if (players > maxPlayers) return "Too many players";
  const need = MIN_PLAYERS - players;
  if (need > 0) return `Need ${need} more player${need === 1 ? "" : "s"}`;
  return "Start game";
}

export interface WaitingRoomProps {
  code: string;
}

type Confirm = { kind: "leave" } | { kind: "kick"; seat: Seat } | null;

/** Lobby of one game: invite, live seats, host controls, leave. */
export function WaitingRoom({ code }: WaitingRoomProps) {
  const session = getSession(code);
  const token = session?.token ?? "";
  const { view: storeView } = useAppState();
  const view: ViewMessage | null = storeView?.code === code ? storeView : null;
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const done = useRef(false);
  const sock = useRef<GameSocket | null>(null);
  const send = (m: ClientMessage) => sock.current?.send(m) ?? false;
  const seen = useRef<Set<string> | null>(null);

  /** Leave this screen for home for good (kicked, session ended, left). */
  const exitHome = (toast: string | null) => {
    if (done.current) return;
    done.current = true;
    forgetSession(code);
    clearView();
    navigate("home");
    if (toast) showToast(toast);
  };

  useEffect(() => {
    done.current = false;
    if (!session) {
      exitHome(null);
      return;
    }
    if (getState().view?.code !== code) clearView();
    const socket = new GameSocket();
    sock.current = socket;
    const offMsg = socket.onMessage((msg) => {
      if (msg.type === "view") applyView(msg);
      else if (routeChat(msg) || routeChatError(msg)) return;
      else if (msg.type === "kicked") exitHome(KICKED_TEXT);
      else if (msg.type === "sessionEnded") exitHome(ENDED_TEXT);
    });
    const offStatus = socket.onStatus((status, reason?: EndReason) => {
      if (done.current) return;
      setStatus(status);
      if (reason === "kicked") exitHome(KICKED_TEXT);
      else if (reason === "sessionEnded" || reason === "notAuthed") exitHome(ENDED_TEXT);
    });
    socket.connect(code, session.token);
    return () => {
      resetChat();
      sock.current = null;
      offMsg();
      offStatus();
      socket.close();
    };
    // The session is read once per code; a new code remounts via `key`.
  }, [code]);

  // The host started the game: everyone moves to the game screen.
  const status = view?.room.status;
  useEffect(() => {
    if (status && status !== "lobby" && !done.current) navigate("game", code);
  }, [status, code]);

  // A soft blip when someone new sits down (not for the seats already there).
  const seatIds = view?.seats.map((s) => s.seatId).join(",") ?? null;
  useEffect(() => {
    if (seatIds === null) return;
    const ids = seatIds.split(",");
    if (seen.current && ids.some((id) => !seen.current?.has(id))) feedback("join");
    seen.current = new Set(ids);
  }, [seatIds]);

  if (!session) return null;

  const run = async (fn: () => Promise<void>, inDialog: boolean) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setDialogError(null);
    try {
      await fn();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        exitHome(ENDED_TEXT);
        return;
      }
      (inDialog ? setDialogError : setError)(requestErrorText(err));
    } finally {
      if (!done.current) setBusy(false);
    }
  };

  const onStart = () => run(() => startGame(code, token), false);
  const onKick = (seat: Seat) =>
    run(async () => {
      await kickSeat(code, token, { seatId: seat.seatId });
      setConfirm(null);
    }, true);
  const onLeave = () =>
    run(async () => {
      done.current = true; // our own socket close is not a "session ended"
      try {
        await leaveGame(code, token);
      } catch (err) {
        done.current = false;
        throw err;
      }
      done.current = false;
      exitHome(null);
    }, true);

  const closeDialog = () => {
    setConfirm(null);
    setDialogError(null);
  };

  const isHost = view?.you.host ?? false;
  const players = view?.seats.length ?? 0;
  const maxPlayers = view?.room.maxPlayers ?? 0;
  const canStart = players >= MIN_PLAYERS && players <= maxPlayers;
  const lockedUntil = view?.room.joinLockedUntil ?? null;
  const showLock = isHost && lockedUntil !== null && lockedUntil > Date.now();

  return (
    <main class="stack" style={{ paddingBlock: "var(--s6)", maxWidth: "560px" }}>
      <div class="row" style={{ justifyContent: "space-between" }}>
        <h1 style={{ fontSize: "var(--fs-title)", overflowWrap: "anywhere" }}>
          {view?.room.name || session.roomName || "Waiting room"}
        </h1>
        <span class="row">
          {view ? <ChatControls send={send} /> : null}
          <Button onClick={() => setConfirm({ kind: "leave" })}>Leave</Button>
        </span>
      </div>
      {view ? <ChatLayer send={send} /> : null}

      <section class="card stack" aria-label="Invite">
        <p class="muted">Game code</p>
        <p
          class="num"
          style={{
            alignSelf: "flex-start",
            padding: "var(--s2) var(--s5)",
            borderRadius: "var(--r-pill)",
            background: "var(--paper)",
            fontFamily: "var(--font-mono)",
            fontSize: "var(--fs-title)",
            fontWeight: "var(--fw-heavy)",
            letterSpacing: "0.3em",
          }}
        >
          {code}
        </p>
        <CopyButton url={inviteUrl(code)} title="Join my Color Dice game" />
        <p class="muted" style={{ fontSize: "var(--fs-small)" }}>
          Share the password privately — it isn't in the link.
        </p>
      </section>

      {showLock && lockedUntil !== null ? (
        <p role="alert" class="card" style={{ color: "var(--danger)" }}>
          Someone tried wrong passwords 10 times. Joining is paused until{" "}
          <time class="num">{clockTime(lockedUntil)}</time>.
        </p>
      ) : null}

      <section class="card stack" aria-label="Players">
        <h2 style={{ fontSize: "var(--fs-large)" }}>
          Players{" "}
          {view ? (
            <span class="num muted">
              {players} / {maxPlayers}
            </span>
          ) : null}
        </h2>
        {view ? (
          <SeatList
            seats={view.seats}
            youSeatId={view.you.seatId}
            isHost={isHost}
            onKick={(seat) => {
              setDialogError(null);
              setConfirm({ kind: "kick", seat });
            }}
          />
        ) : (
          <p class="muted">Connecting…</p>
        )}
      </section>

      {view ? (
        isHost ? (
          <Button
            variant="primary"
            block
            busy={busy && !confirm}
            disabled={!canStart}
            onClick={onStart}
          >
            {startLabel(players, maxPlayers)}
          </Button>
        ) : (
          <p class="muted" role="status">
            Waiting for the host to start…
          </p>
        )
      ) : null}
      <FieldError text={error} />

      {view && isHost ? (
        <RoomSettings
          code={code}
          token={token}
          roomName={view.room.name}
          listed={view.room.listed}
        />
      ) : null}

      {confirm?.kind === "leave" ? (
        <Dialog title="Leave this game?" onClose={closeDialog}>
          <p>Your seat will be freed for someone else.</p>
          <FieldError text={dialogError} />
          <div class="row" style={{ justifyContent: "flex-end" }}>
            <Button onClick={closeDialog}>Stay</Button>
            <Button variant="primary" busy={busy} onClick={onLeave}>
              Leave game
            </Button>
          </div>
        </Dialog>
      ) : null}
      {confirm?.kind === "kick" ? (
        <Dialog title={`Remove ${confirm.seat.name}?`} onClose={closeDialog}>
          <p>They'll be removed from the waiting room.</p>
          <FieldError text={dialogError} />
          <div class="row" style={{ justifyContent: "flex-end" }}>
            <Button onClick={closeDialog}>Cancel</Button>
            <Button variant="primary" busy={busy} onClick={() => onKick(confirm.seat)}>
              Remove
            </Button>
          </div>
        </Dialog>
      ) : null}
    </main>
  );
}
