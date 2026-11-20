/** Inline SVG icons (H2). Stroke icons use currentColor; decorative unless `title` is given. */
import type { ComponentChildren } from "preact";

export interface IconProps {
  size?: number;
  title?: string;
  class?: string;
}

function Svg({
  size = 20,
  title,
  class: cls,
  children,
}: IconProps & { children: ComponentChildren }) {
  return (
    <svg
      class={cls ? `icon ${cls}` : "icon"}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : "true"}
      aria-label={title}
      focusable="false"
    >
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  );
}

export const LockIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="5" y="11" width="14" height="10" rx="2.5" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </Svg>
);

/** Settings cog: toothed outer ring plus a centre hole. */
export const GearIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M10.0 5.1 L10.3 2.2 L13.7 2.2 L14.0 5.1 L15.5 5.7 L17.7 3.8 L20.2 6.3 L18.3 8.5 L18.9 10.0 L21.8 10.3 L21.8 13.7 L18.9 14.0 L18.3 15.5 L20.2 17.7 L17.7 20.2 L15.5 18.3 L14.0 18.9 L13.7 21.8 L10.3 21.8 L10.0 18.9 L8.5 18.3 L6.3 20.2 L3.8 17.7 L5.7 15.5 L5.1 14.0 L2.2 13.7 L2.2 10.3 L5.1 10.0 L5.7 8.5 L3.8 6.3 L6.3 3.8 L8.5 5.7z" />
    <circle cx="12" cy="12" r="3" />
  </Svg>
);

export const CrownIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3.5 8l4.5 4 4-6.5 4 6.5 4.5-4-2 10.5h-13z" />
  </Svg>
);

export const TieIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 9h14M5 15h14" />
  </Svg>
);

export const CheckIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4.5 12.5l5 5 10-11" />
  </Svg>
);

export const DotsIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="6" cy="12" r="1.2" fill="currentColor" />
    <circle cx="12" cy="12" r="1.2" fill="currentColor" />
    <circle cx="18" cy="12" r="1.2" fill="currentColor" />
  </Svg>
);

export const WarningIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3.5l9.5 16.5h-19z" />
    <path d="M12 10v4.5M12 17.5v.01" />
  </Svg>
);

export const PauseIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9 5v14M15 5v14" />
  </Svg>
);

export const ShareIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 15V3.5M7.5 8L12 3.5 16.5 8" />
    <path d="M5 12.5V19a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 19v-6.5" />
  </Svg>
);

export const CopyIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="8.5" y="8.5" width="12" height="12" rx="2" />
    <path d="M15.5 5.5V5A1.5 1.5 0 0 0 14 3.5H5A1.5 1.5 0 0 0 3.5 5v9A1.5 1.5 0 0 0 5 15.5h.5" />
  </Svg>
);

export const SoundOnIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" />
    <path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" />
  </Svg>
);

export const SoundOffIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" />
    <path d="M16 9.5l5 5M21 9.5l-5 5" />
  </Svg>
);

export const CloseIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Svg>
);
