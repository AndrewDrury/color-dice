/** H5 two-step staging state: stage → confirm (send) → disabled until the next view or error. */
import type { Color } from "@cd/engine";
import type { ClientMessage, ViewMessage } from "@cd/protocol";
import { useEffect, useRef, useState } from "preact/hooks";
import { feedback } from "../fx/feedback";
import { showToast } from "../store";
import { boxKey } from "./model";
import {
  buildMessage,
  canPass,
  highlightFor,
  legalBoxes,
  type Staged,
  stagedEquals,
} from "./staging";

export function useStaging(view: ViewMessage, send: (m: ClientMessage) => boolean) {
  const [staged, setStaged] = useState<Staged | null>(null);
  const [sent, setSent] = useState<Staged | null>(null);
  const [shake, setShake] = useState(0);
  const latest = useRef({ view, staged, sent });
  latest.current = { view, staged, sent };

  // A newer view answers the send; keep a staged choice only while it is still legal.
  useEffect(() => {
    setSent(null);
    setStaged((s) => {
      if (!s) return s;
      const ok =
        s.kind === "PASS" ? canPass(view) : legalBoxes(view).has(boxKey(s.color, s.number));
      return ok ? s : null;
    });
  }, [view.version]);

  const confirm = () => {
    const { view: v, staged: s, sent: already } = latest.current;
    if (!s || already) return;
    const msg = buildMessage(v, s);
    if (!msg) {
      setStaged(null);
      return;
    }
    if (send(msg)) {
      setSent(s);
      setStaged(null);
    } else {
      showToast("Not connected. Trying to reconnect…", "error");
    }
  };

  const stage = (next: Staged) => {
    const { staged: cur, sent: already } = latest.current;
    if (already) return;
    if (stagedEquals(cur, next)) {
      confirm();
      return;
    }
    feedback("pick");
    setStaged(next);
  };

  /** Server rejected the send: restore the staging, shake the box. */
  const fail = () => {
    const { sent: was } = latest.current;
    setSent(null);
    if (was) setStaged(was);
    setShake((n) => n + 1);
  };

  const cancel = () => setStaged(null);

  // Esc cancels; Enter confirms unless a button has focus (it would click itself).
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape" && latest.current.staged) setStaged(null);
      else if (e.key === "Enter" && latest.current.staged) {
        const el = document.activeElement;
        if (!el || el === document.body) confirm();
      }
    };
    // Tapping outside the sheet and action bar cancels.
    const click = (e: MouseEvent) => {
      const t = e.target as Element | null;
      if (latest.current.staged && !t?.closest(".g-sheet, .g-actionbar")) setStaged(null);
    };
    document.addEventListener("keydown", key);
    document.addEventListener("click", click);
    return () => {
      document.removeEventListener("keydown", key);
      document.removeEventListener("click", click);
    };
  }, []);

  return {
    staged,
    sent,
    shake,
    stageBox: (color: Color, number: number) => stage({ kind: "MARK", color, number }),
    stagePass: () => stage({ kind: "PASS" }),
    confirm,
    cancel,
    fail,
    highlight: highlightFor(view, staged),
  };
}
