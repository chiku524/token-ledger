# Motion

Library: `motion` (`import { m } from "motion/react"`). Subtle, product-led.

## Rules

- Mount `MotionProvider` once in the root layout: `LazyMotion` with
  `domAnimation`, and `MotionConfig reducedMotion="user"`.
- Use `m.*` components (not `motion.*`) so the bundle stays small.
- Motion code lives in `"use client"` leaves in `src/components/motion/`. Server
  pages import the wrappers, not `motion` itself.
- Animate `opacity` and `transform` only. Never animate width, height or table layout.
- Everything must work with reduced motion on (`reducedMotion="user"` disables
  transforms; opacity changes are still allowed).

## Timing

| Use | Duration | Easing |
|---|---|---|
| Hover, press | 120ms | ease-out |
| Fade, small slide (8px) | 200ms | `[0.22, 1, 0.36, 1]` |
| Dialog, sheet | 250ms | same |
| Stagger step | 40ms per item, capped at 8 items | |
| Number ticker | 600ms | ease-out |

## Patterns

- `PageTransition`: fade and 8px slide on route content.
- `FadeIn`, `Stagger` / `StaggerItem`: KPI grids, card lists, hero.
- `NumberTicker`: KPI and balance figures, on first render only.
- Nav: shared `layoutId` pill for the active item.
- Dialog, Sheet, Dropdown: use the shadcn animation classes (`tw-animate-css`).

## Not doing

Scroll-jacking, parallax, looping decorative animation, chart draw-in.
