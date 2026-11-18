/** Game-socket lifecycle for the game screen: connect, feed the store, expose `send`. */
import type { ClientMessage, ErrorMessage } from "@cd/protocol";
import { useEffect, useRef } from "preact/hooks";
import { resetChat, routeChat, routeChatError } from "../chat/store";
import { t } from "../i18n";
import { navigate } from "../router";
import { forgetSession, getSession } from "../session";
import { applyView, clearView, getState, setStatus, showToast } from "../store";
import { type EndReason, GameSocket } from "../ws";

export interface GameConnection {
  send: (msg: ClientMessage) => boolean;
  /** True until the next view has been consumed: first load or after a reconnect. */
  resyncNext: { current: boolean };
}

export function useGameSocket(code: string, onError: (e: ErrorMessage) => void): GameConnection {
  const socket = useRef<GameSocket | null>(null);
  const resyncNext = useRef(true);
  const errRef = useRef(onError);
  errRef.current = onError;
  const conn = useRef<GameConnection>({
    send: (msg) => socket.current?.send(msg) ?? false,
    resyncNext,
  });

  useEffect(() => {
    const session = getSession(code);
    let done = false;
    const exitHome = (toast: string | null) => {
      if (done) return;
      done = true;
      forgetSession(code);
      clearView();
      navigate("home");
      if (toast) showToast(toast);
    };
    if (!session) {
      exitHome(null);
      return;
    }
    if (getState().view?.code !== code) clearView();
    const s = new GameSocket();
    socket.current = s;
    const offMsg = s.onMessage((msg) => {
      if (msg.type === "view") applyView(msg);
      else if (routeChat(msg) || routeChatError(msg)) return;
      else if (msg.type === "error") errRef.current(msg);
      else if (msg.type === "kicked") exitHome(t("toast.kicked"));
      else if (msg.type === "sessionEnded") exitHome(t("toast.sessionEnded"));
    });
    const offStatus = s.onStatus((status, reason?: EndReason) => {
      if (done) return;
      setStatus(status);
      if (status === "reconnecting" || status === "connecting") resyncNext.current = true;
      if (reason === "kicked") exitHome(t("toast.kicked"));
      else if (reason === "sessionEnded" || reason === "notAuthed")
        exitHome(t("toast.sessionEnded"));
    });
    s.connect(code, session.token);
    return () => {
      done = true;
      resetChat();
      offMsg();
      offStatus();
      s.close();
      socket.current = null;
    };
  }, [code]);

  return conn.current;
}
