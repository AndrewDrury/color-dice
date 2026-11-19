/** Staging state: tap a box to stage, tap it again (or Confirm) to send; Pass sends at once (K4.4). */
import type { Color } from "@cd/engine";
import type { ClientMessage, ViewMessage } from "@cd/protocol";
import { useEffect, useRef, useState } from "preact/hooks";
import { feedback } from "../fx/feedback";
import { t } from "../i18n";
import { showToast } from "../store";
import { boxKey } from "./model";
import {
  buildMessage,
  canPass,
  currentStep,
  highlightFor,
  isActive,
  legalBoxes,
  type Mark,
  passMessage,
  sameMark,
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
    const legal = legalBoxes(view, cur.s1);
    const ok1 =
      !cur.s1 || (currentStep(view) === 1 && legal.has(boxKey(cur.s1.color, cur.s1.number)));
    const ok2 = !cur.s2 || legal.has(boxKey(cur.s2.color, cur.s2.number));
    if (!ok1) setStaged(NONE);
    else if (!ok2) setStaged({ s1: cur.s1, s2: null });
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

  const confirm = () => {
    const { view: v, staged: s, sent: already } = latest.current;
    if (already || (!s.s1 && !s.s2)) return;
    const msg = buildMessage(v, s.s1, s.s2);
    if (!msg) {
      setStaged(NONE);
      return;
    }
    transmit(msg, s);
  };

  const stageBox = (color: Color, number: number) => {
    const { view: v, staged: s, sent: already } = latest.current;
    if (already) return;
    const box: Mark = { color, number };
    const step = currentStep(v);
    if (!step) return;
    if (step === 1 && (!s.s1 || !isActive(v))) {
      if (sameMark(s.s1, box)) confirm();
      else if (legalBoxes(v).has(boxKey(color, number))) {
        feedback("pick");
        setStaged({ s1: box, s2: null });
      }
    } else if (step === 1 && sameMark(s.s1, box)) {
      confirm();
    } else if (sameMark(s.s2, box)) {
      confirm();
    } else if (legalBoxes(v, s.s1).has(boxKey(color, number))) {
      feedback("pick");
      setStaged({ s1: s.s1, s2: box });
    }
  };

  /** One click, one pass command. The marks staged for the passed step are dropped. */
  const pass = () => {
    const { view: v, staged: s, sent: already } = latest.current;
    if (already || !canPass(v, s.s1)) return;
    const msg = passMessage(v, s.s1);
    if (!msg) return;
    const keep = msg.type === "turn" ? s.s1 : null;
    transmit(msg, { s1: keep, s2: null });
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
        if (!el || el === document.body) confirm();
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
    stageBox,
    pass,
    confirm,
    cancel,
    undo,
    fail,
    highlight: highlightFor(view, staged.s1, staged.s2),
  };
}
