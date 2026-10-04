# Landing page motion

What was added to `/` and how to tune it. The rules behind it are in `docs/design-system/motion.md`.

## Pieces

| Piece | File | Driven by |
|---|---|---|
| Inertial scroll | `src/components/motion/smooth-scroll.tsx` | Lenis (`lenis/react`) |
| Hero load sequence | `globals.css` (`.line-rise`, `.preview-*`) | CSS keyframes, first paint |
| Hero scroll tilt | `src/components/landing/hero-scroll.tsx` | `useScroll` + `useSpring` |
| Convergence scene | `src/components/landing/convergence.tsx` | `useScroll` on a pinned section |
| Sticky header | `src/components/landing/landing-header.tsx` | scroll position + `IntersectionObserver` |
| Section reveals | `src/components/motion/reveal.tsx` | CSS `animation-timeline: view()` |
| How it works rail | `src/components/landing/how-it-works.tsx` | `useScroll` + `useSpring` |
| Plans stack | `src/components/landing/plans.tsx` | CSS `position: sticky` + `useScroll` |

## Why it is built this way

- First paint stays CSS. The server HTML is complete and visible without JavaScript. The only `opacity:0` in it belongs to two decorative Convergence captions; a visually hidden list carries the same text.
- One signature moment. Convergence acts out the product (sources become one ledger, the entry balances, exports follow) and echoes the sign-up page's scatter-to-circle motif. Everything else is quiet.
- Reduced motion removes the pin, the tilt and Lenis. Convergence renders its finished state.

## Tuning Convergence

Progress runs 0 to 1 across the pinned section (240vh on desktop, 180vh below `md`).

| Progress | Phase |
|---|---|
| 0 to 0.4 | Chips travel into the ledger, staggered 0.03 apart |
| 0.2 to 0.5 | Ledger card firms up |
| 0.3 to 0.55 | Total counts up, source bar fills |
| 0.55 to 0.75 | Journal lines write in, then the Balanced badge |
| 0.75 to 1 | Connector lines draw out to the export pills |

Captions switch at 0.36 and 0.68. Chips, captions and exports are defined in `content.convergence` (`src/components/landing/content.ts`). Chip positions are percentages of the scene, measured from the top left.

To make it longer or shorter, change the section height in `convergence.tsx`. Keep every input range between 0 and 1.

## Scrubbed sections below Convergence

How it works and Plans use `useScrollLive()` (`src/components/motion/use-scroll-live.ts`). It is false on the server, before hydration and under reduced motion, and the components render their plain static markup in that case. Motion styles only attach once it is true, so the server HTML shows everything at full strength.

- **How it works:** progress runs from the steps block reaching 85% of the viewport to its bottom reaching 70%. Steps light up at 0.04, 0.4 and 0.74 of that range, each over 0.14. The head dot uses `left` rather than a transform, because translating a full-width wrapper stretched the page horizontally.
- **Plans:** on `md` and up, both cards and the left column are CSS-sticky, and the stacking works without JavaScript. Motion only adds the scale and dim on card 1 and the settle on card 2. The spacer between the cards (40vh) and the bottom padding (10vh) set how long the stack holds. Below `md` the cards simply stack.

The closing CTA band keeps its original card design and only fades in with `Reveal variant="scale"`.

## Not verified here

Mobile layout and the reduced-motion path were not checked in a browser during development, because the test browser could not emulate a phone viewport or the reduced-motion setting. Check both before merging.
