# Token Ledger design system

Cobalt & Lime: web3-native, product-led. Dark interface first, light for documents.
The mark is three ledger rows stacked like blocks. Decision record:
`docs/adr-design-system.md`. Rollout checklist: `phases.md`.

## Colour

| Name | Hex | Use |
|---|---|---|
| Cobalt | `#2140E6` | Brand panels, links, the logo, selected nav |
| Lime | `#C8F542` | Buttons, live states, highlights (fill only) |
| Night | `#0C0F1F` | App background (dark). Cards `#151A2E` |
| Cloud | `#F7F8FC` | Light theme, documents, reports, PDFs |
| Seal | `#C0362C` | Errors, destructive |
| Pine | `#0D7A45` | Success |

Full light/dark mapping to shadcn variables is in the ADR.

## Type

- Headings: Space Grotesk 700, tracking `-0.03em`
- Text: Manrope
- Hashes, addresses, amounts: JetBrains Mono, tabular figures
- Kicker: 0.72rem, 600, uppercase, 0.14em tracking

## Shape and space

- Controls: radius about 0.75rem. Cards: about 1.15rem.
- Cards have a 1px border in `border`, no shadow in dark.
- Focus: 2px lime ring, 2px offset.

## Do / don't

- Do compose pages from `src/components/ui` and `src/components/app`.
- Do keep numbers right-aligned and monospaced (`Amount`).
- Don't put lime text on Cloud/white.
- Don't write raw hex or one-off alert/status markup. Use `Alert`, `StatusBadge`.
- Don't animate layout-heavy tables. Fade and slide at most.

## Related

- `motion.md`: animation rules
- `components.md`: component inventory (filled in as phases land)
- Reference sites for the public-page style: alphablockai.framer.website, bitwave.io
