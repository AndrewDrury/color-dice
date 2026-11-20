import type { ClientMessage } from "@cd/protocol";
import { MIN_PLAYERS, type ViewMessage } from "@cd/protocol";
import { useEffect, useRef, useState } from "preact/hooks";
import { ApiError, kickSeat, leaveGame, startGame } from "../api";
import { resetChat, routeChat, routeChatError } from "../chat/store";
import { Button } from "../components/Button";
import { ChatControls, ChatLayer } from "../components/ChatButton";
import { InviteButton } from "../components/CopyButton";
import { Dialog } from "../components/Dialog";
import { FieldError, requestErrorText } from "../components/Field";
import { ProfileField } from "../components/ProfileField";
import { RoomSettings } from "../components/RoomSettings";
import { type Seat, SeatList } from "../components/SeatList";
import { SelfBadge } from "../components/SelfBadge";
import { feedback } from "../fx/feedback";
import { clockTime, t, tn, useT } from "../i18n";
import { rememberProfile } from "../remembered";
import { forgetRoom, toastSessionEnded } from "../roomEnd";
import { navigate } from "../router";
import { getSession } from "../session";
import { applyView, clearView, getState, setStatus, showToast, useAppState } from "../store";
import { type EndReason, GameSocket } from "../ws";

/** Label for the host's Start button. */
export function startLabel(players: number, maxPlayers: number): string {
  if (players > maxPlayers) return t("waiting.start.tooMany");
  const need = MIN_PLAYERS - players;
  if (need > 0) return tn("waiting.start.need", need);
  return t("waiting.start.go");
}

export interface WaitingRoomProps {
  code: string;
}

type Confirm = { kind: "leave" } | { kind: "kick"; seat: Seat } | null;

/** Lobby of one game: invite, live seats, host controls, leave. */
export function WaitingRoom({ code }: WaitingRoomProps) {
  useT();
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
    forgetRoom(code);
    clearView();
    navigate("home");
    if (toast) showToast(toast);
  };

  /** The server ended our session: say whether the whole game is gone. */
  const exitEnded = () => {
    if (done.current) return;
    exitHome(null);
    void toastSessionEnded(code, token);
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
      else if (msg.type === "kicked") exitHome(t("toast.kicked"));
      else if (msg.type === "sessionEnded") exitEnded();
    });
    const offStatus = socket.onStatus((status, reason?: EndReason) => {
      if (done.current) return;
      setStatus(status);
      if (reason === "kicked") exitHome(t("toast.kicked"));
      else if (reason === "sessionEnded" || reason === "notAuthed") exitEnded();
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
        exitHome(t("toast.ended"));
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
  const mine = view?.seats.find((s) => s.seatId === view.you.seatId);
  const players = view?.seats.length ?? 0;
  const maxPlayers = view?.room.maxPlayers ?? 0;
  // T-UX-17: a full room starts by itself, so the host's Start gives way to a notice.
  const full = maxPlayers > 0 && players >= maxPlayers;
  const canStart = players >= MIN_PLAYERS && players <= maxPlayers;
  const lockedUntil = view?.room.joinLockedUntil ?? null;
  const [, setNow] = useState(0);
  // Re-render when the join lock expires so the warning disappears.
  useEffect(() => {
    if (lockedUntil === null) return;
    const ms = lockedUntil - Date.now();
    if (ms <= 0) return;
    const t = setTimeout(() => setNow(Date.now()), ms + 50);
    return () => clearTimeout(t);
  }, [lockedUntil]);
  const showLock = isHost && lockedUntil !== null && lockedUntil > Date.now();

  return (
    <main class="stack" style={{ paddingBlock: "var(--s6)", maxWidth: "560px" }}>
      <div class="row" style={{ justifyContent: "space-between" }}>
        <h1 style={{ fontSize: "var(--fs-title)", overflowWrap: "anywhere" }}>
          {view?.room.name || session.roomName || t("waiting.title")}
        </h1>
        <span class="row">
          {view ? <ChatControls send={send} /> : null}
          <SelfBadge profile={mine?.profile} name={mine?.name ?? session.name} />
          <Button onClick={() => setConfirm({ kind: "leave" })}>{t("waiting.leave")}</Button>
        </span>
      </div>
      {view ? <ChatLayer send={send} /> : null}

      <section class="card stack" aria-label={t("waiting.inviteAria")}>
        <InviteButton code={code} token={token} />
        <p class="muted" style={{ fontSize: "var(--fs-small)" }}>
          {t("waiting.inviteNote")}
        </p>
      </section>

      {view ? (
        <section class="card" aria-label={t("profile.title")}>
          {mine?.profile ? (
            <ProfileField
              value={mine.profile}
              taken={view.seats
                .filter((s) => s !== mine && !s.left)
                .map((s) => s.profile?.color ?? "")}
              onChange={(p) => {
                send({ type: "profile", profile: p });
                rememberProfile(p);
              }}
            />
          ) : null}
        </section>
      ) : null}

      {showLock && lockedUntil !== null ? (
        <p role="alert" class="card" style={{ color: "var(--danger)" }}>
          {t("waiting.locked", { time: clockTime(lockedUntil) })}
        </p>
      ) : null}

      <section class="card stack" aria-label={t("waiting.players")}>
        <h2 style={{ fontSize: "var(--fs-large)" }}>
          {t("waiting.players")}{" "}
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
          <p class="muted">{t("conn.connecting")}</p>
        )}
      </section>

      {view ? (
        full ? (
          <p class="muted" role="status" data-testid="room-full">
            {t("waiting.full")}
          </p>
        ) : isHost ? (
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
            {t("waiting.waitingHost")}
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
        <Dialog title={t("waiting.leaveTitle")} onClose={closeDialog}>
          <p>{t("waiting.leaveBody")}</p>
          <FieldError text={dialogError} />
          <div class="row" style={{ justifyContent: "flex-end" }}>
            <Button onClick={closeDialog}>{t("waiting.stay")}</Button>
            <Button variant="primary" busy={busy} onClick={onLeave}>
              {t("waiting.leaveGame")}
            </Button>
          </div>
        </Dialog>
      ) : null}
      {confirm?.kind === "kick" ? (
        <Dialog title={t("waiting.removeTitle", { name: confirm.seat.name })} onClose={closeDialog}>
          <p>{t("waiting.removeBody")}</p>
          <FieldError text={dialogError} />
          <div class="row" style={{ justifyContent: "flex-end" }}>
            <Button onClick={closeDialog}>{t("common.cancel")}</Button>
            <Button variant="primary" busy={busy} onClick={() => onKick(confirm.seat)}>
              {t("waiting.remove")}
            </Button>
          </div>
        </Dialog>
      ) : null}
    </main>
  );
}
