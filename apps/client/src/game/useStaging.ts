/** Staging state: tap a box to stage it, tap it again to unselect, Submit sends (D-L3). */
import type { Color } from "@cd/engine";
import type { ClientMessage, ViewMessage } from "@cd/protocol";
import { useEffect, useRef, useState } from "preact/hooks";
import { feedback } from "../fx/feedback";
import { t } from "../i18n";
import { showToast } from "../store";
import { boxKey } from "./model";
import {
  candidates,
  currentStep,
  highlightFor,
  type Mark,
  sameMark,
  submitMessage,
} from "./staging";

interface Staged {
  s1: Mark | null;
  s2: Mark | null;
}
const NONE: Staged = { s1: null, s2: null };

/** Changes whenever one of your own decisions was registered or the phase / turn moved on. */
const stateKey = (v: ViewMessage) =>
  [
    v.game?.phase,
    v.game?.turn?.number ?? "",
    v.you.action1Decision?.kind ?? "",
    v.you.pendingAction2?.kind ?? "",
  ].join(":");

export function useStaging(view: ViewMessage, send: (m: ClientMessage) => boolean) {
  const [staged, setStagedState] = useState<Staged>(NONE);
  const [sent, setSent] = useState<Staged | null>(null);
  const [shake, setShake] = useState(0);
  const [hover, setHover] = useState<Mark | null>(null);
  const latest = useRef({ view, staged, sent });
  latest.current = { view, staged, sent };
  const sentAt = useRef<string | null>(null);
  /** Colour of the last early step-2 mark you sent (for the "was just locked" toast). */
  const lastEarly = useRef<Color | null>(null);
  const setStaged = (s: Staged) => {
    latest.current.staged = s;
    setStagedState(s);
  };

  useEffect(() => {
    if (latest.current.sent && stateKey(view) !== sentAt.current) {
      latest.current.sent = null;
      setSent(null);
    }
    const cur = latest.current.staged;
    if (!cur.s1 && !cur.s2) return;
    const c = candidates(view, cur.s1, null);
    const ok1 =
      !cur.s1 || (currentStep(view) === 1 && c.white.has(boxKey(cur.s1.color, cur.s1.number)));
    const ok2 = !cur.s2 || submitMessage(view, cur.s1, cur.s2) !== null;
    if (!ok1) setStaged(NONE);
    else if (!ok2) {
      setStaged({ s1: cur.s1, s2: null });
      showToast(t("sel.dropped"), "error");
    }
  }, [view.version]);

  const transmit = (msg: ClientMessage, marks: Staged) => {
    const v = latest.current.view;
    if (send(msg)) {
      sentAt.current = stateKey(v);
      latest.current.sent = marks;
      if (marks.s2) lastEarly.current = marks.s2.color;
      setSent(marks);
      setStaged(NONE);
      return true;
    }
    showToast(t("conn.notConnected"), "error");
    return false;
  };

  /** The single Submit: nothing staged = a pass. */
  const submit = () => {
    const { view: v, staged: s, sent: already } = latest.current;
    if (already) return;
    const msg = submitMessage(v, s.s1, s.s2);
    if (!msg) setStaged(NONE);
    else transmit(msg, s);
  };

  /** Tap a staged box to unselect it (the white box takes the colour box with it), else stage it. */
  const stageBox = (color: Color, number: number) => {
    const { view: v, staged: s, sent: already } = latest.current;
    if (already || !currentStep(v)) return;
    const box: Mark = { color, number };
    const key = boxKey(color, number);
    setHover(null);
    if (sameMark(s.s1, box)) return setStaged(NONE);
    if (sameMark(s.s2, box)) return setStaged({ s1: s.s1, s2: null });
    const c = candidates(v, s.s1, s.s2);
    if (c.white.has(key)) setStaged({ s1: box, s2: s.s2 });
    else if (c.colour.has(key)) setStaged({ s1: s.s1, s2: box });
    else return;
    feedback("pick");
  };

  /** Hovering / focusing a white candidate previews the colour boxes it would leave (D-L5). */
  const hoverBox = (color: Color, number: number | null) => {
    const { view: v, staged: s } = latest.current;
    const key = number === null ? "" : boxKey(color, number);
    setHover(
      !s.s1 && candidates(v, null, s.s2).white.has(key)
        ? { color, number: number as number }
        : null,
    );
  };

  /** Server rejected the send: restore the staging, shake the box. */
  const fail = () => {
    const was = latest.current.sent;
    latest.current.sent = null;
    setSent(null);
    if (was && (was.s1 || was.s2)) setStaged(was);
    setShake((n) => n + 1);
  };

  const cancel = () => setStaged(NONE);
  const undo = () => {
    const s = latest.current.staged;
    if (s.s2) {
      setStaged({ s1: s.s1, s2: null });
      return;
    }
    if (s.s1) {
      setStaged(NONE);
      return;
    }
    const v = latest.current.view;
    const turn = v.game?.turn?.number;
    if (turn && v.you.canUndo && send({ type: "undo", turn })) {
      latest.current.sent = null;
      setSent(null);
    }
  };

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const s = latest.current.staged;
      if (e.key === "Escape" && (s.s1 || s.s2)) setStaged(NONE);
      else if (e.key === "Enter" && (s.s1 || s.s2)) {
        const el = document.activeElement;
        if (!el || el === document.body) submit();
      }
    };
    // Tapping outside the sheet and action bar cancels.
    const click = (e: MouseEvent) => {
      const s = latest.current.staged;
      const el = e.target as Element | null;
      if ((s.s1 || s.s2) && !el?.closest(".g-sheet, .g-actionbar")) setStaged(NONE);
    };
    document.addEventListener("keydown", key);
    document.addEventListener("click", click);
    return () => {
      document.removeEventListener("keydown", key);
      document.removeEventListener("click", click);
    };
  }, []);

  return {
    s1: staged.s1,
    s2: staged.s2,
    sent,
    shake,
    lastEarly,
    hover,
    stageBox,
    hoverBox,
    submit,
    cancel,
    undo,
    fail,
    highlight: highlightFor(view, staged.s1, staged.s2),
  };
}
