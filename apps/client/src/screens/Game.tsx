/** The game screen (D1 item 5, H3): top bar, opponents, dice tray, your sheet, action bar, log. */
import type { ErrorMessage, ViewMessage } from "@cd/protocol";
import { useEffect, useRef, useState } from "preact/hooks";
import { openPanel } from "../chat/store";
import { ActionBar } from "../components/ActionBar";
import { AwayControls } from "../components/AwayControls";
import { ChatControls, ChatLayer } from "../components/ChatButton";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { DiceTray, RollButton, type RollControls } from "../components/DiceTray";
import { GameMenu } from "../components/GameMenu";
import { LockPopup } from "../components/LockPopup";
import { MoveLog } from "../components/MoveLog";
import { OpponentStrip } from "../components/OpponentStrip";
import {
  markRollOffPlayed,
  RollOff,
  RollOffLive,
  rollOffKey,
  rollOffPlayed,
} from "../components/RollOff";
import { ScoreGuide } from "../components/ScoreGuide";
import { SelfBadge } from "../components/SelfBadge";
import { GearButton, type Panel, Panels } from "../components/Settings";
import { Sheet } from "../components/Sheet";
import { TurnBanner } from "../components/TurnBanner";
import { feedback } from "../fx/feedback";
import { useGameKeys } from "../fx/keyboard";
import { useWakeLock } from "../fx/wakeLock";
import { diffViews, type FeedbackEvent, isResync, newEvents } from "../game/feedback";
import { rollOffEvent } from "../game/flow";
import { youPlayer } from "../game/model";
import { candidates, currentStep, decidedMarks, isActive } from "../game/staging";
import { revealAnnouncement, rollAnnouncement, statusText } from "../game/status";
import { type TurnSummary as Summary, summarizeTurn } from "../game/turnSummary";
import { useBackGuard } from "../game/useBackGuard";
import { useAutoPass, useFlowEvents } from "../game/useFlow";
import { useFx } from "../game/useFx";
import { useGameSocket } from "../game/useGameSocket";
import { useStaging } from "../game/useStaging";
import { useViewport } from "../game/useViewport";
import { errorText, t } from "../i18n";
import { getPrefs, setPrefs } from "../prefs";
import { navigate } from "../router";
import { clearView, dismissToast, showToast, useAppState } from "../store";
import "../styles/flow.css";
import "../styles/game.css";
import "../styles/scoring.css";
import { GameHint } from "./GameHint";

/** Fallback if the tray never reports landing (so legal boxes can't stay dark). */
const LAND_FALLBACK_MS = 4000;
const LAND_GLOW_DELAY_MS = 100;

interface Info {
  version: number;
  resync: boolean;
  events: FeedbackEvent[];
  /** Raw log events that are new in this view (empty on a resync). */
  fresh: ReturnType<typeof newEvents>;
  /** A roll that arrived live (animated): legal boxes wait for the landing. */
  liveRollKey: string | null;
  announce: string;
}

export function Game({ code }: { code: string }) {
  const [rollFailed, setRollFailed] = useState(0);
  const [failSignal, setFailSignal] = useState(0);
  const [leaving, setLeaving] = useState(false);
  useBackGuard(() => setLeaving(true));
  const { view: storeView, status, toast, epoch } = useAppState();
  const view = storeView?.code === code ? storeView : null;
  const conn = useGameSocket(code, (e: ErrorMessage) => {
    showToast(errorText(e.code, e.reason), "error");
    feedback("error");
    if (e.command === "roll") setRollFailed((n) => n + 1);
    if (e.command === "action1" || e.command === "action2" || e.command === "turn")
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

  // The live roll-off: this player watched the rounds happen, so only the deciding one replays
  // (its already-landed dice stay put); the result then waits for "Let's go" (D-L2).
  const sawLive = useRef(false);
  if (view?.rollOff && !view.game) sawLive.current = true;
  if (view && !view.game && view.rollOff) return <RollOffLive view={view} send={conn.send} />;
  if (!view?.game) {
    return (
      <main class="stack" style={{ paddingTop: "var(--s8)" }}>
        <p class="muted" role="status">
          {status === "reconnecting" ? t("conn.reconnecting") : t("conn.joining")}
        </p>
      </main>
    );
  }
  return (
    <Board
      key={epoch}
      view={view}
      status={status}
      toast={toast?.kind === "error" ? toast.text : null}
      conn={conn}
      rollFailed={rollFailed}
      failSignal={failSignal}
      leaving={leaving}
      setLeaving={setLeaving}
      liveRollOff={sawLive.current}
    />
  );
}

interface BoardProps {
  view: ViewMessage;
  status: string;
  toast: string | null;
  conn: ReturnType<typeof useGameSocket>;
  rollFailed: number;
  failSignal: number;
  leaving: boolean;
  setLeaving: (v: boolean) => void;
  liveRollOff: boolean;
}

export function Board({
  view,
  status,
  toast,
  conn,
  rollFailed,
  failSignal,
  leaving,
  setLeaving,
  liveRollOff,
}: BoardProps) {
  const game = view.game;
  const viewport = useViewport();
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
      fresh:
        resync || !before?.game || !view.game
          ? []
          : newEvents(before.game.events, view.game.events),
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
  const fallbackTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const markLanded = (delay: number) => {
    const key = pending.current;
    clearTimeout(landTimer.current);
    clearTimeout(fallbackTimer.current);
    landTimer.current = setTimeout(() => setLandedKey(key), delay);
  };
  useEffect(() => {
    if (!cur.liveRollKey) return;
    const key = cur.liveRollKey;
    // The tray normally reports the landing first (its effect runs before this one).
    clearTimeout(fallbackTimer.current);
    fallbackTimer.current = setTimeout(() => setLandedKey(key), LAND_FALLBACK_MS);
  }, [cur.liveRollKey]);
  // Only on unmount: a newer view (liveRollKey back to null) must not cancel a pending landing.
  useEffect(
    () => () => {
      clearTimeout(landTimer.current);
      clearTimeout(fallbackTimer.current);
    },
    [],
  );

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
  const cand = landed && !st.sent ? candidates(view, st.s1, st.s2, st.hover) : null;
  const legal = new Set([...(cand?.white ?? []), ...(cand?.colour ?? [])]);
  const colour = new Set([...(cand?.colour ?? [])].filter((k) => !cand?.white.has(k)));
  const act = isActive(view);
  const anyStaged = st.s1 !== null || st.s2 !== null;
  const staged = [st.s1 && { ...st.s1, step: 1 as const }, st.s2 && { ...st.s2, step: 2 as const }]
    .filter((m) => m !== null)
    .map((m) => (act ? m : { color: m.color, number: m.number }));
  const ghost = [...(st.sent ? [st.sent.s1, st.sent.s2] : decidedMarks(view))].filter(
    (m) => m !== null,
  );
  const noMove = useAutoPass(view, conn.send, landed);
  const flow = useFlowEvents(view, cur.fresh, st.lastEarly);
  // T-NEW-12: summary of the turn that just ended; a newer turn replaces it.
  const [summary, setSummary] = useState<Summary | null>(null);
  useEffect(() => {
    if (cur.resync) return setSummary(null);
    const next = summarizeTurn(view, cur.fresh);
    if (next) setSummary(next);
  }, [view.version]);
  // Lazy: the summary UI is loaded on the first summary (keeps the initial bundle small).
  const [late, setLate] = useState<typeof import("../components/lateUi") | null>(null);
  useEffect(() => {
    import("../components/lateUi").then(setLate);
  }, []);
  const IdleNudgeView = late?.IdleNudge;
  const SummaryCard = late?.TurnSummary;
  const GameOverView = late?.GameOver; // lazy: the results + reveal only run at game over
  const [rollOffDone, setRollOffDone] = useState(false);
  const rollOff = rollOffEvent(view);
  const rollOffId = rollOff ? rollOffKey(view.code, rollOff.rounds) : null;
  const showRollOff = !!rollOff && !rollOffDone && !rollOffPlayed(rollOffId as string);
  const [localFail, setLocalFail] = useState(0);
  const onRoll = () => {
    if (!g.turn || conn.send({ type: "roll", turn: g.turn.number })) return;
    showToast(t("conn.notConnected"), "error");
    setLocalFail((n) => n + 1);
  };
  const rollControls = useRef<RollControls | null>(null);
  const [rolling, setRolling] = useState(false);
  const gameOver = g.phase === "GAME_OVER";
  const summaryShown = summary !== null && !gameOver;
  const mine = view.seats.find((s) => s.seatId === view.you.seatId);

  const myMove =
    view.you.canRoll ||
    (!gameOver && g.phase === "ACTION_2" && g.turn?.activeSeat === view.you.seat);
  // T-NEW-22: lazy idle nudge; it decides itself whether the game waits on me.
  useWakeLock(!gameOver);
  useGameKeys({
    canRoll:
      view.you.canRoll && panel === null && !leaving && !rematching && !gameOver && !showRollOff,
    canPass:
      currentStep(view) !== null &&
      st.s1 === null &&
      st.s2 === null &&
      !noMove &&
      !st.sent &&
      !view.you.canRoll &&
      panel === null &&
      !leaving &&
      !gameOver,
    canUndo: st.s1 !== null || st.s2 !== null || view.you.canUndo,
    undo: st.undo,
    roll: onRoll,
    pass: st.submit,
    cancel: st.cancel,
    mute: () => setPrefs({ sound: !getPrefs().sound }),
    help: () => setPanel((p) => (p === "keys" ? null : "keys")),
    chat: openPanel,
  });

  const hint = gameOver ? null : <GameHint view={view} />;
  // T-FIX-12: on desktop Roll lives in the sticky action bar (always in view); elsewhere under the dice.
  const rollButton = view.you.canRoll ? (
    <RollButton controls={rollControls} class="btn btn-primary g-primary" disabled={rolling}>
      {t("action.roll")}
    </RollButton>
  ) : null;
  const actionBar = (
    <>
      {hint}
      <ActionBar
        view={view}
        status={statusText(view)}
        announce={cur.announce}
        s1={st.s1}
        s2={st.s2}
        sent={st.sent !== null}
        gated={!landed}
        noMove={noMove}
        onSubmit={st.submit}
        onUndo={st.undo}
        roll={viewport === "desktop" ? rollButton : null}
      />
    </>
  );

  return (
    <div class="g-game" data-viewport={viewport}>
      <header class="g-top">
        <button type="button" class="btn g-home" onClick={() => setLeaving(true)}>
          {t("game.home")}
        </button>
        <span class="g-code">
          {view.room.name ? <span class="g-code-room">{view.room.name}</span> : null}
          {g.turn ? (
            <span class="g-code-turn">
              {`${view.room.name ? " · " : ""}${t("game.turn", { n: g.turn.number })}`}
            </span>
          ) : null}
        </span>
        <span class="row">
          <span
            class={`g-conn is-${status}`}
            role="img"
            aria-label={status === "online" ? t("game.online") : t("game.reconnecting")}
          />
          <ChatControls send={conn.send} />
          <SelfBadge
            profile={mine?.profile}
            name={mine?.name ?? t("player.fallback", { n: (view.you.seat ?? 0) + 1 })}
            onClick={() => setPanel("profile")}
          />
          <GearButton onClick={() => setPanel("settings")} />
        </span>
      </header>
      <TurnBanner view={view} staged={anyStaged} noMove={noMove} />
      <AwayControls view={view} />
      {viewport === "phone" ? (
        <OpponentStrip view={view} viewport={viewport} flash={fx.flash} />
      ) : null}
      <main class="g-main">
        <div class="g-left">
          {me ? (
            <Sheet
              player={me}
              lockedColors={g.lockedColors}
              legal={legal}
              colour={colour}
              staged={staged}
              ghost={ghost}
              disabled={st.sent !== null || !landed}
              fx={fx.sheet}
              errorShake={st.shake > 0 && staged.length > 0}
              onPick={st.stageBox}
              onHover={st.hoverBox}
              onFloatDone={fx.dropFloat}
            />
          ) : null}
          <div class="g-guide-slot">
            {me ? <ScoreGuide rows={me.sheet.rows} collapsible={viewport === "phone"} /> : null}
          </div>
          <div class="g-dicegroup">
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
              controls={rollControls}
              onBusyChange={setRolling}
            />
            {rollButton && viewport !== "desktop" ? (
              <div class="g-rollslot">{rollButton}</div>
            ) : null}
          </div>
          {viewport === "desktop" ? actionBar : null}
        </div>
        {viewport !== "phone" ? (
          <aside class="g-right">
            <OpponentStrip view={view} viewport={viewport} flash={fx.flash} />
            <div class="g-logslot">
              <MoveLog view={view} paused={summaryShown} />
              {summaryShown && SummaryCard ? (
                <SummaryCard summary={summary} onClose={() => setSummary(null)} placement="log" />
              ) : null}
            </div>
          </aside>
        ) : null}
      </main>
      {viewport !== "desktop" ? actionBar : null}
      <ChatLayer send={conn.send} myMove={myMove} phone={viewport === "phone"} />
      {toast ? <div class="g-toast">{toast}</div> : null}
      {summaryShown && SummaryCard && viewport === "phone" ? (
        <SummaryCard summary={summary} onClose={() => setSummary(null)} placement="sheet" />
      ) : null}
      <LockPopup queue={flow.queue} shift={flow.shift} />
      {IdleNudgeView ? (
        <IdleNudgeView
          view={view}
          staged={anyStaged}
          noMove={noMove}
          blocked={!!(st.sent || showRollOff || panel || leaving || rematching)}
        />
      ) : null}
      {showRollOff && rollOff ? (
        <RollOff
          view={view}
          rounds={rollOff.rounds}
          live={liveRollOff}
          onDone={() => {
            markRollOffPlayed(rollOffId as string);
            setRollOffDone(true);
          }}
        />
      ) : null}
      {gameOver && GameOverView ? (
        <GameOverView
          view={view}
          rematchBusy={rematchBusy}
          send={conn.send}
          onRematch={() => setRematching(true)}
          onHome={() => {
            clearView();
            navigate("home");
          }}
        />
      ) : null}
      <Panels
        panel={panel}
        onPanel={setPanel}
        profile={mine?.profile}
        name={mine?.name ?? t("player.fallback", { n: (view.you.seat ?? 0) + 1 })}
      />
      {leaving ? <GameMenu code={view.code} onClose={() => setLeaving(false)} /> : null}
      {rematching ? (
        <ConfirmDialog
          title={t("game.rematchTitle")}
          body={t("game.rematchBody")}
          confirmLabel={t("game.rematch")}
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
