# Rollout phases

One commit per phase (Phase 4 has four). Each phase must pass
`pnpm lint && pnpm typecheck && pnpm test && pnpm build` and look right in dark and
light before it is committed.

- [ ] **0. Tooling, skills, docs** — `docs: design system ADR and phase plan`
  - Skills installed user-level (`react-best-practices`; marketplaces added by hand)
  - ADR, README, motion, phases, components docs
- [ ] **1. Foundation** — `feat: shadcn foundation and brand tokens`
  - Deps, `shadcn init`, `cn()`, `@custom-variant dark`, token mapping, `MotionProvider`
  - No visual change
- [ ] **2. Primitives and composites** — `feat: ui primitives, app composites, motion primitives`
  - `ui/*`, `app/*`, `Logo`, motion primitives, small tests
- [ ] **3. App shell** — `feat: restyle dashboard shell`
  - Sidebar, mobile Sheet nav, theme toggle, user menu, skeleton loading
- [ ] **4a. Forms and shared components** — `record-forms`, `connector-form`, `period-form`, `example-banner`, `connection-tour` as Dialog
- [ ] **4b. Overview pages** — dashboard, sources, entities, setup, guide, charts
- [ ] **4c. Ledger pages** — ledger, approvals, reconciliation
- [ ] **4d. Reporting and admin pages** — reports, consolidation, operations, audit, users, settings, error boundaries
- [ ] **5. Public pages** — `feat: restyle public pages`
  - Landing, sign-in, sign-up wizard, reset-password, verify-email
- [ ] **6. Print, cleanup, a11y** — `chore: print styles, remove legacy classes, docs`
  - `@media print` light styles, delete legacy classes, contrast and reduced-motion pass

Each phase: update `components.md`, tick the box here.
