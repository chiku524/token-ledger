# Dashboard sidebar

Built on the shadcn Sidebar primitives (`src/components/ui/sidebar.tsx`), styled with our tokens.

## Structure

- `dashboard-shell.tsx`: `TooltipProvider` > `SidebarProvider` > `AppSidebar` + `SidebarInset` (top bar, banners, `<main id="content">`).
- `app-sidebar.tsx`: header (logo tile, subtitle), `NavMain`, footer `NavUser`, `SidebarRail`.
- `nav-main.tsx`: groups and links. `navGroups()` applies the role and hidden-tab rules and is shared with the breadcrumb in `dashboard-header.tsx`.
- Below `md` the sidebar renders as a `Sheet`; the top bar trigger opens it and a link click closes it.

## Behaviour

- Collapses to an icon rail with the top bar trigger, the rail, or Cmd/Ctrl+B. Tooltips name the icons while collapsed, and all groups stay open then.
- The state lives in the `sidebar_state` cookie. `dashboard/layout.tsx` reads it so the first paint matches.
- Groups fold with a chevron. Navigating into a folded group reopens it.
- The active link keeps the shared `layoutId` lime pill.

## Tokens

`--sidebar*` in `globals.css` point at the existing paper, ink, lime and line tokens, so dark mode needs no extra values.

## Motion exceptions

The rail width (200ms linear) and the group fold height (`collapsible-down/up`, 200ms) animate layout properties. Both are shadcn defaults and are the only exceptions to the "transform and opacity only" rule.

## Print

`[data-slot="sidebar"]` and the top bar (`data-print="hide"`) are hidden in print.

## Changing it

`ui/sidebar.tsx` is generated; the one local edit is `SidebarInset` rendering a `div` (our page content owns the `<main>`). Re-apply it after `shadcn add sidebar`.
