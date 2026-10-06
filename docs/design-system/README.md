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

Full light/dark mapping to shadcn variables is in the ADR. The shadcn variables are
defined once on `:root` from the brand tokens; `html.dark` only swaps the brand
tokens (and `--ring`), so the shadcn layer follows automatically.

## Chart palette

Series colours are `--chart-1` to `--chart-5`, with a lighter set in dark so each
stays readable on Night. Status series use `--chart-pine` and `--chart-seal`.

| Token | Light | Dark |
|---|---|---|
| `--chart-1` | `#2140E6` | `#5B78FF` |
| `--chart-2` | `#6F9A0E` | `#74A010` |
| `--chart-3` | `#C2459A` | `#D361B4` |
| `--chart-4` | `#E07A1F` | `#D4782A` |
| `--chart-5` | `#00968A` | `#00A896` |

Print always uses the light set.

## Type

- Headings: Space Grotesk 700, tracking `-0.03em`
- Text: Manrope
- Hashes, addresses, amounts: JetBrains Mono, tabular figures
- Page title (`PageHeader` h1): `text-3xl`, semibold, tight tracking
- Section title (`SectionHeader` h2, chart titles): `text-lg`, semibold, tight tracking
- Eyebrow (small label above a page title): `.eyebrow`, 10px (11px from `sm`), 600, uppercase, 0.23em tracking

## Shape and space

- Radius base `--radius` 0.75rem. Buttons and inputs use `rounded-lg` (0.75rem), cards `rounded-xl` (1.05rem).
- Cards have a 1px border in `border`, no shadow in dark.
- Focus: 2px `ring` outline, 2px offset. Cobalt in light (lime on Cloud is only 1.19:1), lime in dark.

## Do / don't

- Do compose pages from `src/components/ui` and `src/components/app`.
- Do keep numbers right-aligned and monospaced (`Amount`).
- Don't put lime text on Cloud/white.
- Don't write raw hex or one-off alert/status markup. Use `Alert`, `StatusBadge`.
- Don't animate layout-heavy tables. Fade and slide at most.

## Related

- `motion.md`: animation rules
- `components.md`: component inventory
- Reference sites for the public-page style: alphablockai.framer.website, bitwave.io
