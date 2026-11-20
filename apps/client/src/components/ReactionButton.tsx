/** Cat button (44×44) that toggles the reaction picker. Sends `{type:"react", emoji}`. */
import type { ClientMessage } from "@cd/protocol";
import { useState } from "preact/hooks";
import { useExitAnimation } from "../fx/motion";
import { t, useT } from "../i18n";
import { CatFaceIcon } from "./icons";
import { ReactionPicker } from "./ReactionPicker";

export function ReactionButton({ send }: { send: (m: ClientMessage) => boolean }) {
  useT();
  const [hoverOpen, setHoverOpen] = useState(false);
  const [clickOpen, setClickOpen] = useState(false);
  const open = hoverOpen || clickOpen;
  const { mounted, closing } = useExitAnimation(open);
  const close = () => {
    setHoverOpen(false);
    setClickOpen(false);
  };
  return (
    <span
      class="rx-wrap"
      onPointerEnter={() => setHoverOpen(true)}
      onPointerLeave={() => setHoverOpen(false)}
    >
      <button
        type="button"
        class="btn rx-btn"
        data-rx-self=""
        aria-label={t("chat.reactionSend")}
        aria-haspopup="true"
        aria-expanded={open ? "true" : "false"}
        onClick={() => {
          setHoverOpen(false);
          setClickOpen((o) => !o);
        }}
      >
        <CatFaceIcon size={24} />
      </button>
      {mounted ? (
        <ReactionPicker
          closing={closing}
          onClose={close}
          autoFocusFirst={clickOpen}
          onPick={(emoji) => {
            send({ type: "react", emoji });
            close();
          }}
        />
      ) : null}
    </span>
  );
}
