/** Turn-flow side effects: auto-pass (K4.9), lock popup queue (K4.2), voided early Action 2 toast. */
import type { Color, GameEvent } from "@cd/engine";
import type { ClientMessage, ViewMessage } from "@cd/protocol";
import { useEffect, useRef, useState } from "preact/hooks";
import { colorName, t } from "../i18n";
import { showToast } from "../store";
import { type LockItem, lockMessage } from "./flow";
import { seatOfPlayer } from "./model";
import { currentStep, noWhiteSumMove } from "./staging";

/** Passive player with no white-sum mark: send their Pass once per turn, after the dice landed. */
export function useAutoPass(
  view: ViewMessage,
  send: (m: ClientMessage) => boolean,
  landed: boolean,
): boolean {
  const done = useRef<string | null>(null);
  const [retry, setRetry] = useState(0);
  const turn = view.game?.turn?.number;
  const key = `${view.code}:${turn}`;
  const noMove = noWhiteSumMove(view);
  useEffect(() => {
    if (!landed || !noMove || currentStep(view) !== 1 || !turn || done.current === key) return;
    if (send({ type: "action1", turn, kind: "PASS" })) {
      done.current = key;
      return;
    }
    // Socket not open yet (or briefly down): try again shortly.
    const timer = setTimeout(() => setRetry((n) => n + 1), 300);
    return () => clearTimeout(timer);
  }, [landed, noMove, key, view.version, retry]);
  return noMove || (done.current === key && view.game?.phase === "ACTION_1");
}

/** New ROW_LOCKED events feed a queue (one popup at a time); ACTION2_VOIDED toasts the active player. */
export function useFlowEvents(
  view: ViewMessage,
  fresh: readonly GameEvent[],
  lastEarly: { current: Color | null },
) {
  const [queue, setQueue] = useState<LockItem[]>([]);
  const seq = useRef(0);
  useEffect(() => {
    const items: LockItem[] = [];
    for (const e of fresh) {
      if (e.type === "ROW_LOCKED") {
        seq.current += 1;
        items.push({ id: seq.current, color: e.color, text: lockMessage(view, e) });
      } else if (
        e.type === "ACTION2_VOIDED" &&
        seatOfPlayer(e.playerId, view.game) === view.you.seat
      ) {
        const c = lastEarly.current;
        showToast(c ? t("toast.voided", { color: colorName(c) }) : t("toast.voidedAny"), "error");
      }
    }
    if (items.length > 0) setQueue((q) => [...q, ...items]);
  }, [view.version]);
  return { queue, shift: () => setQueue((q) => q.slice(1)) };
}
