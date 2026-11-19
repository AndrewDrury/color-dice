/** Cat button (44×44) that toggles the reaction picker. Sends `{type:"react", emoji}`. */
import type { ClientMessage } from "@cd/protocol";
import { useState } from "preact/hooks";
import { useExitAnimation } from "../fx/motion";
import { t, useT } from "../i18n";
import { REACTION_BUTTON_IMAGE, reactionUrl } from "./CatReaction";
import { ReactionPicker } from "./ReactionPicker";

export function ReactionButton({ send }: { send: (m: ClientMessage) => boolean }) {
  useT();
  const [open, setOpen] = useState(false);
  const { mounted, closing } = useExitAnimation(open);
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
        <img
          class="rx-btn-gif"
          src={reactionUrl(REACTION_BUTTON_IMAGE)}
          alt=""
          aria-hidden="true"
          width={44}
          height={44}
        />
      </button>
      {mounted ? (
        <ReactionPicker
          closing={closing}
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
