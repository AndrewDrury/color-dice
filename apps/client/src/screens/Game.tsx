/** The game screen (D1 item 5, H3): top bar, opponents, dice tray, your sheet, action bar, log. */
import type { ErrorMessage, ViewMessage } from "@cd/protocol";
import { useEffect, useRef, useState } from "preact/hooks";
import { ActionBar } from "../components/ActionBar";
import { AwayControls } from "../components/AwayControls";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { DiceTray } from "../components/DiceTray";
import { MoveLog } from "../components/MoveLog";
import { OpponentStrip } from "../components/OpponentStrip";
import { GearButton, type Panel, Panels } from "../components/Settings";
import { Sheet } from "../components/Sheet";
import { feedback } from "../fx/feedback";
import { useGameKeys } from "../fx/keyboard";
import { useTabAttention } from "../fx/tabAttention";
import { useWakeLock } from "../fx/wakeLock";
import { diffViews, type FeedbackEvent, isResync } from "../game/feedback";
import { youPlayer } from "../game/model";
import { canPass, legalBoxes, passTakesPenalty } from "../game/staging";
import { revealAnnouncement, rollAnnouncement, statusText } from "../game/status";
import { useFx } from "../game/useFx";
import { useGameSocket } from "../game/useGameSocket";
import { useStaging } from "../game/useStaging";
import { useViewport } from "../game/useViewport";
import { errorText } from "../i18n";
import { getPrefs, setPrefs } from "../prefs";
import { navigate } from "../router";
import { clearView, dismissToast, showToast, useAppState } from "../store";
import "../styles/game.css";
import { GameHint } from "./GameHint";
import { GameOver } from "./GameOver";

/** Fallback if the tray never reports landing (so legal boxes can't stay dark). */
const LAND_FALLBACK_MS = 3000;
const LAND_GLOW_DELAY_MS = 100;

interface Info {
  version: number;
  resync: boolean;
  events: FeedbackEvent[];
  /** A roll that arrived live (animated): legal boxes wait for the landing. */
  liveRollKey: string | null;
  announce: string;
}

export function Game({ code }: { code: string }) {
  const [rollFailed, setRollFailed] = useState(0);
  const [failSignal, setFailSignal] = useState(0);
  const { view: storeView, status, toast, epoch, offlineSince } = useAppState();
  const view = storeView?.code === code ? storeView : null;
  const conn = useGameSocket(code, (e: ErrorMessage) => {
    showToast(errorText(e.code, e.reason), "error");
    feedback("error");
    if (e.command === "roll") setRollFailed((n) => n + 1);
    setFailSignal((n) => n + 1);
  });

  useEffect(() => {
    if (view && view.room.status === "lobby" && !view.game) navigate("waiting", code);
  }, [view?.room.status, view?.game, code]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => dismissToast(toast.id), 4000);
    return () => clearTimeout(t);
  }, [toast?.id]);

  if (!view?.game) {
    return (
      <main class="stack" style={{ paddingTop: "var(--s8)" }}>
        <p class="muted" role="status">
          {status === "reconnecting" ? "Reconnecting…" : "Joining the table…"}
        </p>
      </main>
    );
  }
  return (
    <Board
      key={epoch}
      offlineSince={offlineSince}
      view={view}
      status={status}
      toast={toast?.kind === "error" ? toast.text : null}
      conn={conn}
      rollFailed={rollFailed}
      failSignal={failSignal}
    />
  );
}

interface BoardProps {
  offlineSince: Record<string, number>;
  view: ViewMessage;
  status: string;
  toast: string | null;
  conn: ReturnType<typeof useGameSocket>;
  rollFailed: number;
  failSignal: number;
}

/** Push one history entry so Back / swipe-back asks before leaving (H10). */
function useBackGuard(onBack: () => void) {
  const cb = useRef(onBack);
  cb.current = onBack;
  useEffect(() => {
    const push = () => {
      try {
        globalThis.history.pushState({ cdGuard: true }, "");
      } catch {
        // No history (tests, sandboxed frames).
      }
    };
    push();
    const on = () => {
      push();
      cb.current();
    };
    globalThis.addEventListener("popstate", on);
    return () => globalThis.removeEventListener("popstate", on);
  }, []);
}

function Board({ offlineSince, view, status, toast, conn, rollFailed, failSignal }: BoardProps) {
  const game = view.game;
  const viewport = useViewport();
  const [leaving, setLeaving] = useState(false);
  const [rematching, setRematching] = useState(false);
  const [rematchBusy, setRematchBusy] = useState(false);
  const [panel, setPanel] = useState<Panel>(null);

  // ---- diff against the previous view (once per applied version) ----
  const prev = useRef<ViewMessage | null>(null);
  const info = useRef<Info | null>(null);
  const announce = useRef("");
  if (info.current?.version !== view.version) {
    const before = prev.current;
    const resync = conn.resyncNext.current || isResync(before, view);
    conn.resyncNext.current = false;
    const events = resync ? [] : diffViews(before, view);
    const g = view.game;
    const newRoll =
      !resync &&
      !!g?.roll &&
      (before?.game?.turn?.number !== g.turn?.number || !before?.game?.roll);
    if (newRoll) announce.current = rollAnnouncement(view);
    else if (events.some((e) => e.kind === "reveal")) announce.current = revealAnnouncement(view);
    info.current = {
      version: view.version,
      resync,
      events,
      liveRollKey: newRoll && g?.turn ? `${view.code}:${g.turn.number}` : null,
      announce: announce.current,
    };
    prev.current = view;
  }
  const cur = info.current as Info;

  // ---- legal boxes wait for the dice to land (live rolls only) ----
  const pending = useRef<string | null>(null);
  if (cur.liveRollKey) pending.current = cur.liveRollKey;
  const [landedKey, setLandedKey] = useState<string | null>(null);
  const landed = pending.current === null || landedKey === pending.current;
  const landTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const markLanded = (delay: number) => {
    const key = pending.current;
    clearTimeout(landTimer.current);
    landTimer.current = setTimeout(() => setLandedKey(key), delay);
  };
  useEffect(() => {
    if (cur.liveRollKey) markLanded(LAND_FALLBACK_MS);
    return () => clearTimeout(landTimer.current);
  }, [cur.liveRollKey]);

  // ---- staging, errors, effects ----
  const st = useStaging(view, conn.send);
  const failedOnce = useRef(failSignal);
  useEffect(() => {
    if (failSignal !== failedOnce.current) {
      failedOnce.current = failSignal;
      st.fail();
    }
  }, [failSignal]);
  const fx = useFx(view.version, cur.events, view.you.seat);

  const me = youPlayer(view);
  const g = game as NonNullable<typeof game>;
  const legal = landed && !st.sent ? legalBoxes(view) : new Set<string>();
  const boxed = (s: typeof st.staged) => (s && s.kind === "MARK" ? s : null);
  const [localFail, setLocalFail] = useState(0);
  const onRoll = () => {
    if (!g.turn || conn.send({ type: "roll", turn: g.turn.number })) return;
    showToast("Not connected. Trying to reconnect…", "error");
    setLocalFail((n) => n + 1);
  };
  const gameOver = g.phase === "GAME_OVER";

  const myMove =
    view.you.canRoll ||
    (!gameOver && g.phase === "ACTION_2" && g.turn?.activeSeat === view.you.seat);
  useWakeLock(!gameOver);
  useTabAttention(myMove);
  useBackGuard(() => setLeaving(true));
  useGameKeys({
    canRoll: view.you.canRoll && panel === null && !leaving && !rematching && !gameOver,
    canPass: canPass(view) && !view.you.canRoll && panel === null && !leaving && !gameOver,
    roll: onRoll,
    pass: st.stagePass,
    cancel: st.cancel,
    mute: () => setPrefs({ sound: !getPrefs().sound }),
    help: () => setPanel((p) => (p === "keys" ? null : "keys")),
  });

  const hint = gameOver ? null : <GameHint view={view} />;
  const actionBar = (
    <>
      {hint}
      <ActionBar
        view={view}
        status={statusText(view)}
        announce={cur.announce}
        staged={st.staged}
        sent={st.sent !== null}
        gated={!landed}
        onRoll={onRoll}
        onPass={st.stagePass}
        onConfirm={st.confirm}
      />
    </>
  );

  return (
    <div class="g-game" data-viewport={viewport}>
      <header class="g-top">
        <button type="button" class="btn g-home" onClick={() => setLeaving(true)}>
          ‹ Home
        </button>
        <span class="g-code">
          <span class="num">{view.code}</span>
          {g.turn ? <> · Turn {g.turn.number}</> : null}
        </span>
        <span class="row">
          <span
            class={`g-conn is-${status}`}
            role="img"
            aria-label={status === "online" ? "online" : "reconnecting"}
          />
          <GearButton onClick={() => setPanel("settings")} />
        </span>
      </header>
      <AwayControls view={view} offlineSince={offlineSince} send={conn.send} />
      {viewport === "phone" ? (
        <OpponentStrip view={view} viewport={viewport} flash={fx.flash} />
      ) : null}
      <main class="g-main">
        <div class="g-left">
          <DiceTray
            roll={g.roll}
            lockedColors={g.lockedColors}
            canRoll={view.you.canRoll}
            onRoll={onRoll}
            turnKey={{ code: view.code, turnNumber: g.turn?.number ?? null }}
            highlight={st.highlight}
            rollFailed={rollFailed + localFail}
            resync={cur.resync}
            onLanded={() => markLanded(LAND_GLOW_DELAY_MS)}
          />
          {me ? (
            <Sheet
              player={me}
              lockedColors={g.lockedColors}
              legal={legal}
              staged={boxed(st.staged)}
              ghost={boxed(st.sent)}
              disabled={st.sent !== null || !landed}
              fx={fx.sheet}
              errorShake={st.shake > 0 && st.staged !== null}
              warnPenalty={st.staged?.kind === "PASS" && passTakesPenalty(view)}
              onPick={st.stageBox}
              onFloatDone={fx.dropFloat}
            />
          ) : null}
          {viewport === "desktop" ? actionBar : null}
        </div>
        {viewport !== "phone" ? (
          <aside class="g-right">
            <OpponentStrip view={view} viewport={viewport} flash={fx.flash} />
            <MoveLog view={view} />
          </aside>
        ) : null}
      </main>
      {viewport !== "desktop" ? actionBar : null}
      {toast ? <div class="g-toast">{toast}</div> : null}
      {gameOver ? (
        <GameOver
          view={view}
          rematchBusy={rematchBusy}
          onRematch={() => setRematching(true)}
          onHome={() => {
            clearView();
            navigate("home");
          }}
        />
      ) : null}
      <Panels panel={panel} onPanel={setPanel} />
      {leaving ? (
        <ConfirmDialog
          title="Leave the table?"
          body="You can resume from Home."
          confirmLabel="Leave"
          onCancel={() => setLeaving(false)}
          onConfirm={() => {
            clearView();
            navigate("home");
          }}
        />
      ) : null}
      {rematching ? (
        <ConfirmDialog
          title="Start a rematch?"
          body="Everyone stays at the table."
          confirmLabel="Rematch"
          onCancel={() => setRematching(false)}
          onConfirm={() => {
            setRematching(false);
            setRematchBusy(conn.send({ type: "rematch" }));
          }}
        />
      ) : null}
    </div>
  );
}
