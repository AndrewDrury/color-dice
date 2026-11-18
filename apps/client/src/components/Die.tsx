/**
 * A CSS 3D die (H4): .die > .die__fx (removed state) > .die__shadow + .die__body (position,
 * bounce, jiggle) > .die__cube (rotation) > 6 faces of pips. Motion uses the Web Animations
 * API on transform/opacity only; without `element.animate` (tests) the die simply rests.
 */
import type { Color } from "@cd/engine";
import { useEffect, useLayoutEffect, useRef } from "preact/hooks";
import {
  type Angles,
  anglesAt,
  continueTo,
  type Face,
  rotateCss,
  seededRandom,
  settleTransform,
  type TumblePlan,
  tumbleKeyframes,
} from "../fx/dice-math";
import { ROLL_TIMING, type RollPhase } from "../fx/useRollAnimation";
import { dieColor, t } from "../i18n";
import { LockIcon } from "./icons";

export type DieColor = "WHITE" | Color;

export interface DieProps {
  color: DieColor;
  face: Face;
  phase: RollPhase;
  seed: number;
  /** `data-die` value (e.g. "WHITE_1"); defaults to the colour. */
  id?: string;
  /** Position in the tray among present dice: drives the settle stagger. */
  index?: number;
  removed?: boolean;
  highlight?: boolean;
  reduced?: boolean;
}

/** Pip cells (0–8, row-major in a 3×3 grid) per face. */
const PIPS: Record<Face, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};
const FACES: Face[] = [1, 2, 3, 4, 5, 6];

const EASE_OUT = "cubic-bezier(0.2, 0.8, 0.2, 1)";
/** Height the die floats at while tumbling (px, negative = up). */
const HOVER = -10;
const LAUNCH_MS = 380;

function animate(
  el: Element | null,
  kf: Keyframe[],
  opts: KeyframeAnimationOptions,
): Animation | null {
  if (!el || typeof (el as HTMLElement).animate !== "function") return null;
  try {
    const a = el.animate(kf, opts);
    // cancel() rejects `finished`; nobody awaits it, so mark it handled.
    a.finished?.catch(() => {});
    return a;
  } catch {
    return null;
  }
}

const translate = (x: number, y: number) => `translate(${x}px, ${y}px)`;

export function dieLabel(color: DieColor, face: Face, phase: RollPhase, removed: boolean): string {
  const v = { color: dieColor(color), face };
  if (removed) return t("die.removed", v);
  if (phase === "settled") return t("die.value", v);
  if (phase === "idle") return t("die.label", v);
  return t("die.rolling", v);
}

export function Die(props: DieProps) {
  const { color, face, phase, seed, removed = false, highlight = false, reduced = false } = props;
  const pose = settleTransform(face, seed);

  const fxRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const cubeRef = useRef<HTMLDivElement>(null);
  const shadowRef = useRef<HTMLDivElement>(null);
  const anims = useRef<Animation[]>([]);
  const timers = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const tumble = useRef<{ plan: TumblePlan; start: number } | null>(null);
  const prevPhase = useRef(phase);
  const prevRemoved = useRef(removed);
  const latest = useRef(props);
  latest.current = props;

  const track = (a: Animation | null) => {
    if (a) anims.current.push(a);
  };
  const stopAll = () => {
    for (const a of anims.current) a.cancel();
    anims.current = [];
    for (const t of timers.current) clearTimeout(t);
    timers.current = [];
  };
  const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());
  const currentAngles = (): Angles | null =>
    tumble.current ? anglesAt(tumble.current.plan, now() - tumble.current.start) : null;

  const startShake = () => {
    stopAll();
    const rand = seededRandom(seed ^ Math.floor(now()));
    const p = settleTransform(latest.current.face, seed);
    const kf: Keyframe[] = [];
    for (let i = 0; i < 8; i++) {
      const dx = (rand() * 2 - 1) * 4;
      const dy = (rand() * 2 - 1) * 4;
      const r = (rand() * 2 - 1) * 8;
      kf.push({ transform: `${translate(p.tx + dx, p.ty + dy)} rotate(${r}deg)` });
    }
    kf.push(kf[0] as Keyframe);
    track(animate(bodyRef.current, kf, { duration: 480, iterations: Number.POSITIVE_INFINITY }));
  };

  const startTumble = () => {
    stopAll();
    const index = latest.current.index ?? 0;
    const plan = tumbleKeyframes(seed ^ Math.floor(now()));
    tumble.current = { plan, start: now() };
    track(
      animate(cubeRef.current, plan.keyframes, { duration: plan.duration, iterations: Infinity }),
    );
    // Launch from the bottom-left of the tray on a short arc, then float while spinning.
    const launch = [
      { transform: `${translate(-34, 18)} scale(0.9)` },
      { transform: `${translate(-10, -22)} scale(1)`, offset: 0.55 },
      { transform: translate(0, HOVER) },
    ];
    track(
      animate(bodyRef.current, launch, {
        duration: LAUNCH_MS,
        delay: index * 25,
        easing: EASE_OUT,
        fill: "both",
      }),
    );
    const bob = [
      { transform: translate(0, HOVER) },
      { transform: translate(0, HOVER - 5) },
      { transform: translate(0, HOVER) },
    ];
    timers.current.push(
      setTimeout(
        () => track(animate(bodyRef.current, bob, { duration: 300, iterations: Infinity })),
        LAUNCH_MS + index * 25,
      ),
    );
    track(
      animate(
        shadowRef.current,
        [
          { transform: "scale(1)", opacity: 0.85 },
          { transform: "scale(0.6)", opacity: 0.35 },
        ],
        { duration: 250, easing: EASE_OUT, fill: "forwards" },
      ),
    );
  };

  /** Spin on from the tumble onto the face, bounce, squash the shadow. */
  const settleOnto = (duration: number, bounce: boolean) => {
    const from = currentAngles();
    stopAll();
    const p = settleTransform(latest.current.face, seed);
    if (from) {
      const to = continueTo(from, p, tumble.current?.plan.delta ?? { x: 1, y: 1, z: 1 });
      track(
        animate(cubeRef.current, [{ transform: rotateCss(from) }, { transform: rotateCss(to) }], {
          duration,
          easing: EASE_OUT,
        }),
      );
    }
    tumble.current = null;
    const rest = translate(p.tx, p.ty);
    const body = bounce
      ? [
          { transform: translate(p.tx, p.ty + HOVER) },
          { transform: rest, offset: 0.45, easing: "ease-out" },
          { transform: translate(p.tx, p.ty - 3), offset: 0.7, easing: "ease-in" },
          { transform: rest },
        ]
      : [{ transform: translate(0, HOVER) }, { transform: rest }];
    track(animate(bodyRef.current, body, { duration, easing: bounce ? "linear" : EASE_OUT }));
    const shadow = bounce
      ? [
          { transform: "scale(0.6)", opacity: 0.35 },
          { transform: "scale(1.18, 0.9)", opacity: 0.95, offset: 0.45 },
          { transform: "scale(1)", opacity: 0.85 },
        ]
      : [
          { transform: "scale(0.6)", opacity: 0.35 },
          { transform: "scale(1)", opacity: 0.85 },
        ];
    track(animate(shadowRef.current, shadow, { duration }));
  };

  useLayoutEffect(() => {
    const prev = prevPhase.current;
    prevPhase.current = phase;
    if (prev === phase || removed) return;
    if (reduced) {
      stopAll();
      tumble.current = null;
      if (phase === "tumbling") {
        track(
          animate(fxRef.current, [{ opacity: 1 }, { opacity: 0.55 }], {
            duration: 120,
            fill: "forwards",
          }),
        );
      } else if (phase === "settled") {
        const kf = [{ opacity: 0.35 }, { opacity: 1 }];
        track(animate(fxRef.current, kf, { duration: ROLL_TIMING.reducedFade }));
      }
      return;
    }
    if (phase === "shaking") startShake();
    else if (phase === "tumbling") startTumble();
    else if (phase === "settling") {
      const delay = (latest.current.index ?? 0) * ROLL_TIMING.stagger;
      timers.current.push(setTimeout(() => settleOnto(ROLL_TIMING.settle, true), delay));
    } else if (prev === "tumbling") settleOnto(ROLL_TIMING.easeBack, false);
    else if (prev !== "settling") stopAll();
  }, [phase]);

  // Colour locked during the game: lift, spin once, shrink and fade (500 ms).
  useLayoutEffect(() => {
    const was = prevRemoved.current;
    prevRemoved.current = removed;
    if (!removed || was) return;
    stopAll();
    if (reduced) return;
    const kf = [
      { transform: "none", opacity: 1 },
      { transform: "translateY(-14px) rotate(180deg) scale(0.9)", opacity: 0.9, offset: 0.4 },
      { transform: "scale(0.6)", opacity: 0.3 },
    ];
    track(animate(fxRef.current, kf, { duration: 500, easing: EASE_OUT }));
  }, [removed]);

  useEffect(() => stopAll, []);

  const cls = ["die", `die--${color.toLowerCase()}`];
  if (removed) cls.push("is-removed");
  if (highlight && !removed) cls.push("is-highlight");
  if (phase !== "settled" && phase !== "idle") cls.push("is-moving");

  return (
    <div
      class={cls.join(" ")}
      role="img"
      data-die={props.id ?? color}
      data-color={color}
      data-face={phase === "settled" && !removed ? String(face) : undefined}
      aria-label={dieLabel(color, face, phase, removed)}
    >
      <div class="die__fx" ref={fxRef}>
        <div class="die__shadow" ref={shadowRef} />
        <div class="die__body" ref={bodyRef} style={{ transform: translate(pose.tx, pose.ty) }}>
          <div class="die__cube" ref={cubeRef} style={{ transform: rotateCss(pose) }}>
            <div class="die__core die__core--x" />
            <div class="die__core die__core--y" />
            <div class="die__core die__core--z" />
            {FACES.map((f) => (
              <div key={f} class={`die__face die__face--${f}`}>
                {PIPS[f].map((cell) => (
                  <span
                    key={cell}
                    class="pip"
                    style={{ gridRow: Math.floor(cell / 3) + 1, gridColumn: (cell % 3) + 1 }}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
      {removed ? <LockIcon class="die__lock" size={22} /> : null}
    </div>
  );
}
