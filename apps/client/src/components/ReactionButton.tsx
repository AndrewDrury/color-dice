/** 😊 button (44×44) that toggles the reaction picker. Sends `{type:"react", emoji}`. */
import type { ClientMessage } from "@cd/protocol";
import { useState } from "preact/hooks";
import { t, useT } from "../i18n";
import { ReactionPicker } from "./ReactionPicker";

export function ReactionButton({ send }: { send: (m: ClientMessage) => boolean }) {
  useT();
  const [open, setOpen] = useState(false);
  return (
    <span class="rx-wrap">
      <button
        type="button"
        class="btn rx-btn"
        data-rx-self=""
        aria-label={t("chat.reactionSend")}
        aria-haspopup="true"
        aria-expanded={open ? "true" : "false"}
        onClick={() => setOpen((o) => !o)}
      >
        <span aria-hidden="true">😊</span>
      </button>
      {open ? (
        <ReactionPicker
          onClose={() => setOpen(false)}
          onPick={(emoji) => {
            send({ type: "react", emoji });
            setOpen(false);
          }}
        />
      ) : null}
    </span>
  );
}
