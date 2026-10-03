/**
 * Marks for the auth left panel (sign-up and sign-in).
 * They float in the scattered layout, peel into a circle in order, hold,
 * then peel back out to the same layout — looping. While the circle is held,
 * the Token Ledger wordmark fades in below it, then out before the release.
 * CSS transform/opacity only; motion stops under prefers-reduced-motion.
 * See docs/design-system/motion.md.
 */

import { LogoMark } from "@/components/logo";

const REST = [
  { glyph: "👛", top: 13, left: 14, size: "size-20 text-4xl", duration: "9s", floatDelay: "-1.4s", x: "14px", y: "-18px", rot: "6deg" },
  { glyph: "🏦", top: 28, left: 52, size: "size-[4.5rem] text-3xl", duration: "11s", floatDelay: "-3.2s", x: "-12px", y: "-16px", rot: "-5deg" },
  { glyph: "🪙", top: 16, left: 72, size: "size-14 text-2xl", duration: "7.5s", floatDelay: "-2.1s", x: "-10px", y: "-14px", rot: "10deg" },
  { glyph: "🔐", top: 46, left: 18, size: "size-20 text-4xl", duration: "12s", floatDelay: "-5.5s", x: "12px", y: "-20px", rot: "4deg" },
  { glyph: "🛡️", top: 42, left: 64, size: "size-16 text-3xl", duration: "10s", floatDelay: "-4s", x: "-14px", y: "-16px", rot: "-6deg" },
  { glyph: "📒", top: 62, left: 40, size: "size-[4.25rem] text-3xl", duration: "13s", floatDelay: "-6.8s", x: "16px", y: "-12px", rot: "-3deg" },
  { glyph: "🔗", top: 68, left: 16, size: "size-14 text-2xl", duration: "8.5s", floatDelay: "-2.8s", x: "10px", y: "-14px", rot: "5deg" },
  { glyph: "📊", top: 70, left: 66, size: "size-12 text-xl", duration: "9.5s", floatDelay: "-5s", x: "-8px", y: "-12px", rot: "3deg" },
] as const;

/** Circle sits in the open middle of the panel, above the copyright strip. */
const CIRCLE = { top: 36, left: 42, radius: 15 };

/** Open band between the circle (plus icon overhang) and the copyright strip. */
const BRAND_BAND_TOP = `${CIRCLE.top + CIRCLE.radius + 6}%`;

/** Clockwise from the top so the gather and release read as one ordered sweep. */
const MARKS = REST.map((mark, index) => {
  const angle = (index / REST.length) * Math.PI * 2 - Math.PI / 2;
  const circleTop = CIRCLE.top + Math.sin(angle) * CIRCLE.radius;
  const circleLeft = CIRCLE.left + Math.cos(angle) * CIRCLE.radius;
  return {
    ...mark,
    index,
    /** Offset from the rest spot to the circle slot, in container %. */
    toX: (circleLeft - mark.left).toFixed(2),
    toY: (circleTop - mark.top).toFixed(2),
    /** Stagger so marks peel in and out one after another. */
    orbitDelay: `${(index * 0.22).toFixed(2)}s`,
  };
});

export function SignupOrbit() {
  return (
    <div className="auth-orbit absolute inset-0">
      {MARKS.map((mark) => (
        <span
          key={mark.glyph}
          className="absolute -translate-x-1/2 -translate-y-1/2"
          style={{ top: `${mark.top}%`, left: `${mark.left}%` }}
        >
          <span
            className="auth-gather block"
            style={
              {
                "--to-x": mark.toX,
                "--to-y": mark.toY,
                "--orbit-delay": mark.orbitDelay,
              } as React.CSSProperties
            }
          >
            <span
              className={`auth-float grid place-items-center rounded-full bg-white/12 shadow-[inset_0_1px_0_rgba(255,255,255,0.35)] ring-1 ring-white/25 backdrop-blur-md ${mark.size}`}
              style={
                {
                  "--float-duration": mark.duration,
                  "--float-delay": mark.floatDelay,
                  "--drift-x": mark.x,
                  "--drift-y": mark.y,
                  "--drift-rot": mark.rot,
                } as React.CSSProperties
              }
            >
              {mark.glyph}
            </span>
          </span>
        </span>
      ))}
      {/* Centered in the band between the circle and the copyright strip. */}
      <span
        className="absolute inset-x-0 bottom-32 flex items-center justify-center"
        style={{ top: BRAND_BAND_TOP }}
      >
        <span className="auth-brand flex items-center gap-4 text-white">
          <LogoMark className="h-12 w-auto drop-shadow-none sm:h-14" />
          <span className="font-logo text-3xl font-semibold leading-none tracking-tight whitespace-nowrap sm:text-4xl">
            Token Ledger
          </span>
        </span>
      </span>
    </div>
  );
}
