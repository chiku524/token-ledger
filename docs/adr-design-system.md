# ADR: shadcn/ui and motion as the frontend design system

Status: accepted. Phased rollout tracked in `docs/design-system/phases.md`.

## Context

The Cobalt & Lime brand already exists in code as hand-written tokens and global
classes in `src/app/globals.css` (`.btn`, `.btn-secondary`, `.panel`, `.field`,
`.ledger-table`, `.num`). There is no component layer. Alerts, empty states, status
text, section headings and segmented controls are repeated inline across about 30
files, and the one modal (`connection-tour.tsx`) has no focus trap. There is no icon
set and no animation.

## Decision

- **shadcn/ui** (`radix-nova` style, Radix primitives, CSS variables) is the component
  layer. It was initialised in PR #128 (issue #127), which added `components.json`,
  `src/components/ui/button.tsx`, `SubmitButton`, and the shadcn variables in
  `globals.css`. Components are copied into `src/components/ui/`, so we own them.
  `cn()` comes from shadcn's `cn` package (a clsx + tailwind-merge replacement),
  re-exported by `src/lib/utils.ts`.
- **App composites** in `src/components/app/` (`StatusBadge`, `EmptyState`,
  `SectionHeader`, `TableCard`, `Amount`, `Field`, `SegmentedLinks`, `Flash`) hold the
  patterns that are currently copy-pasted.
- **`motion`** (`motion/react`) is the only animation library. Motion is subtle and
  product-led, and always honours `prefers-reduced-motion`.
- **lucide-react** is the icon set.
- The existing brand tokens stay. They are mapped onto shadcn's semantic variables
  rather than replaced, so legacy classes keep working until they are removed.
- **Theme:** dark by default with a user toggle (existing `tl-theme` key). Light
  uses Cloud `#F7F8FC`. Printed documents are always light.
- **Scope:** the authenticated app and the existing public pages (landing, sign-in,
  sign-up, reset, verify). No new marketing pages.

## Token mapping

| shadcn variable | Light | Dark |
|---|---|---|
| background | Cloud `#F7F8FC` | Night `#0C0F1F` |
| card / popover | `#FFFFFF` | `#151A2E` |
| foreground | `#0C0F1F` | `#F7F8FC` |
| muted-foreground | `#5C6578` | `#A7B0C4` |
| border / input | `#E3E6EF` | `#2A3148` |
| primary / primary-foreground | Lime `#C8F542` / Night | same |
| brand / brand-foreground | Cobalt `#2140E6` / white | same |
| link | `#2140E6` | `#A9B8FF` |
| ring (focus) | Cobalt `#2140E6` | Lime `#C8F542` |
| destructive | seal `#C0362C` | `#F0A8A2` |
| success | pine `#0D7A45` | `#7DCEA0` |

## Rules

1. Lime is a fill (buttons, live states, highlights) with Night text on it. Never use
   lime as text on a light background.
2. Cobalt is for brand panels, links, the logo and selected nav.
3. Amounts, hashes and addresses use JetBrains Mono with tabular figures.
4. Headings use Space Grotesk 700, body text Manrope.
5. Server components stay server components. Radix and motion code live in
   `"use client"` leaf components.
6. No raw hex in components. Use tokens.

## Consequences

- One-off visual drift ends, because new UI is composed from `ui/` and `app/`.
- Adds `motion` (the other dependencies, `radix-ui`, `lucide-react`,
  `class-variance-authority`, `cn` and `tw-animate-css`, came with PR #128).
- shadcn's `--accent` is a neutral hover surface, not the brand colour. The legacy
  `--color-accent` (cobalt, used by links) is unchanged.
- The migration touches most UI files, so it is split into phases that each land as
  one commit.
- The Cloudflare OpenNext and Vercel builds must stay green after every phase.
