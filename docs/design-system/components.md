# Component inventory

Filled in as each phase lands. See `README.md` for the rules.

## Primitives (`src/components/ui/`) — Phase 2

Button (`default` lime, `brand` cobalt, `secondary`, `outline`, `ghost`, `link`,
`destructive`), Card, Input, Label, Textarea, Select, Table, Badge (`live`,
`example`, `success`, `warning`, `danger`, `neutral`), Alert, Tabs, ToggleGroup,
Dialog, Sheet, DropdownMenu, Tooltip, Separator, Skeleton.

## App composites (`src/components/app/`) — Phase 2

| Component | Replaces |
|---|---|
| `StatusBadge` | Per-page pine/seal status ternaries |
| `EmptyState` | `panel px-4 py-6 text-sm text-ink-soft` |
| `SectionHeader` | `text-lg font-semibold tracking-tight` h2 |
| `TableCard` | `mt-4 overflow-x-auto panel` |
| `Amount` | `.num` |
| `Field` | `.field` |
| `SegmentedLinks` | Entity switcher in reports and consolidation |
| `Flash` | Inline alert boxes |

## Motion (`src/components/motion/`) — Phase 1–2

`MotionProvider`, `FadeIn`, `Stagger` / `StaggerItem`, `NumberTicker`,
`PageTransition`, `Presence`.

## Brand

`Logo` (variants `onDark`, `onLight`, `onLime`, `mono`) replaces `wordmark.tsx`.
