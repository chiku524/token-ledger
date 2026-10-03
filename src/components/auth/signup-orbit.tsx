/**
 * Looping marks for the empty blue panel beside the sign-up wizard.
 * CSS only, so the marks are painted on first load. The drift is transform-only
 * and turns off under prefers-reduced-motion. See docs/design-system/motion.md.
 */
const MARKS = [
  { glyph: "👛", top: "13%", left: "14%", size: "size-20 text-4xl", duration: "9s", delay: "-1.4s", x: "18px", y: "-26px", rot: "8deg" },
  { glyph: "🏦", top: "28%", left: "52%", size: "size-[4.5rem] text-3xl", duration: "11s", delay: "-4.2s", x: "-16px", y: "-20px", rot: "-6deg" },
  { glyph: "🪙", top: "16%", left: "72%", size: "size-14 text-2xl", duration: "7.5s", delay: "-2.6s", x: "-12px", y: "-18px", rot: "14deg" },
  { glyph: "🔐", top: "46%", left: "18%", size: "size-20 text-4xl", duration: "12s", delay: "-6s", x: "14px", y: "-28px", rot: "5deg" },
  { glyph: "🛡️", top: "42%", left: "64%", size: "size-16 text-3xl", duration: "10s", delay: "-3.1s", x: "-18px", y: "-22px", rot: "-8deg" },
  { glyph: "📒", top: "62%", left: "40%", size: "size-[4.25rem] text-3xl", duration: "13s", delay: "-8s", x: "20px", y: "-16px", rot: "-4deg" },
  { glyph: "🔗", top: "68%", left: "16%", size: "size-14 text-2xl", duration: "8.5s", delay: "-5.4s", x: "12px", y: "-18px", rot: "6deg" },
  { glyph: "📊", top: "70%", left: "66%", size: "size-12 text-xl", duration: "9.5s", delay: "-7.2s", x: "-10px", y: "-14px", rot: "4deg" },
] as const;

export function SignupOrbit() {
  return (
    <div className="absolute inset-0">
      {MARKS.map((mark) => (
        <span
          key={mark.glyph}
          className={`auth-float absolute grid place-items-center rounded-full bg-white/12 shadow-[inset_0_1px_0_rgba(255,255,255,0.35)] ring-1 ring-white/25 backdrop-blur-md ${mark.size}`}
          style={
            {
              top: mark.top,
              left: mark.left,
              "--float-duration": mark.duration,
              "--float-delay": mark.delay,
              "--drift-x": mark.x,
              "--drift-y": mark.y,
              "--drift-rot": mark.rot,
            } as React.CSSProperties
          }
        >
          {mark.glyph}
        </span>
      ))}
    </div>
  );
}
