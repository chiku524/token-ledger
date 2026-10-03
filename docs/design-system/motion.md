# Motion

Library: `motion` (`import { m } from "motion/react"`). Subtle, product-led.

## Rules

- Mount `MotionProvider` once in the root layout: `LazyMotion` with `domMax`, and
  `MotionConfig reducedMotion="user"`. `domMax` (not `domAnimation`) is required
  because `domAnimation` ships no layout feature, so shared-`layoutId` animations
  such as the nav pill are silently ignored.
- Use `m.*` components (not `motion.*`) so the bundle stays small.
- Motion code lives in `"use client"` leaves in `src/components/motion/`. Server
  pages import the wrappers, not `motion` itself.
- **Entrance animations are CSS, not JS.** Anything that animates content in on
  first paint (`FadeIn`, `PageTransition`, `Stagger`) uses the `rise-in` /
  `stagger` classes in `globals.css`. A JS `initial={{ opacity: 0 }}` is
  server-rendered as an inline style, so the page ships invisible and stays blank
  if JS never runs; a CSS keyframe cannot leave content hidden. Keep `m.*` for
  animations that react to state or interaction, never for the first paint.
- Animate `opacity` and `transform` only. Never animate width, height or table layout.
- Everything must work with reduced motion on (`reducedMotion="user"` disables
  transforms; opacity changes are still allowed). The CSS entrances drop to a
  fade-only keyframe under `prefers-reduced-motion: reduce`.

## Timing

| Use | Duration | Easing |
|---|---|---|
| Hover, press | 120ms | ease-out |
| Fade, small slide (8px) | 200ms | `[0.22, 1, 0.36, 1]` |
| Dialog, sheet | 250ms | same |
| Stagger step | 40ms per item; use for groups of about 8 or fewer | |
| Number ticker | 600ms | ease-out |

## Patterns

- `PageTransition`: fade and 8px slide on route content. Mounted from
  `template.tsx`, which remounts per navigation, so the CSS keyframe replays.
- `FadeIn`, `Stagger` / `StaggerItem`: KPI grids, card lists, hero. Plain server
  components over the `rise-in` / `stagger` classes; `Stagger` delays its direct
  children by 40ms each up to the eighth.
- `NumberTicker`: KPI and balance figures, on first render only.
- Nav: shared `layoutId` pill for the active item.
- Dialog, Sheet, Dropdown: use the shadcn animation classes (`tw-animate-css`).

## Not doing

Scroll-jacking, parallax, chart draw-in. The sign-up panel is the one looping decoration: `SignupOrbit` floats in a scattered layout, peels into a circle in order, shows the Token Ledger wordmark briefly, then peels back out. Transform/opacity only; it stops under `prefers-reduced-motion`.
