import type { Profile } from "@cd/protocol";
import { useEffect, useId, useRef, useState } from "preact/hooks";
import { t, useT } from "../i18n";
import { Avatar } from "./Avatar";
import "../styles/avatar-hover.css";

const PREVIEW_SIZE = 132;
const TOUCH_HIDE_MS = 3000;

export function AvatarHover({
  profile,
  name,
  self = false,
  size = 24,
  class: cls,
  onActivate,
}: {
  profile: Profile | undefined;
  name: string;
  self?: boolean;
  size?: number;
  class?: string;
  onActivate?: () => void;
}) {
  useT();
  const id = useId();
  const ref = useRef<HTMLElement | null>(null);
  const hold = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const hide = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const [xy, setXY] = useState<{ left: number; top: number }>({ left: 0, top: 0 });

  const close = () => setOpen(false);
  const position = () => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const width = 176;
    const height = 188;
    const gap = 10;
    const left = Math.max(
      8,
      Math.min(window.innerWidth - width - 8, r.left + r.width / 2 - width / 2),
    );
    const above = r.top - height - gap;
    const top = above >= 8 ? above : Math.min(window.innerHeight - height - 8, r.bottom + gap);
    setXY({ left, top });
  };
  const openTip = () => {
    position();
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const onResize = () => position();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) close();
    };
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onResize, true);
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown, true);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onResize, true);
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown, true);
    };
  }, [open]);

  useEffect(
    () => () => {
      clearTimeout(hold.current);
      clearTimeout(hide.current);
    },
    [],
  );

  if (!profile) return null;
  const label = self ? t("profile.youLabel", { name }) : name;
  const shared = {
    ref: (el: HTMLElement | null) => {
      ref.current = el;
    },
    class: `avh-anchor${cls ? ` ${cls}` : ""}`,
    onPointerEnter: (e: PointerEvent) => {
      if (e.pointerType === "mouse" || e.pointerType === "pen") openTip();
    },
    onPointerLeave: () => {
      clearTimeout(hold.current);
      close();
    },
    onPointerDown: (e: PointerEvent) => {
      if (e.pointerType !== "touch") return;
      clearTimeout(hold.current);
      hold.current = setTimeout(() => {
        openTip();
        clearTimeout(hide.current);
        hide.current = setTimeout(close, TOUCH_HIDE_MS);
      }, 360);
    },
    onPointerUp: () => clearTimeout(hold.current),
    onFocus: openTip,
    onBlur: close,
    "aria-describedby": open ? id : undefined,
    "aria-label": label,
  } as const;

  return (
    <>
      {onActivate ? (
        <button
          type="button"
          {...shared}
          class={`avh-anchor avh-button${cls ? ` ${cls}` : ""}`}
          onClick={onActivate}
        >
          <Avatar profile={profile} size={size} />
        </button>
      ) : (
        <span {...shared}>
          <Avatar profile={profile} size={size} />
        </span>
      )}
      {open ? (
        <span
          id={id}
          role="tooltip"
          class="avh-tip"
          style={{ left: `${xy.left}px`, top: `${xy.top}px` }}
          aria-live="polite"
        >
          <Avatar profile={profile} size={PREVIEW_SIZE} />
          <span class="avh-name name-clip" title={name}>
            {self ? t("profile.youCaption", { name }) : name}
          </span>
        </span>
      ) : null}
    </>
  );
}
