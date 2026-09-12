# Changes in this drop

## 1. components/AppShell.tsx — fixes sidebar color flash + reorder-on-click

**Root cause:** every page (15 of them) wraps its own content in `<AppShell>` instead
of a single shared root layout rendering it once. Next.js therefore unmounts and
remounts AppShell on every navigation. The `ui` (theme + nav order) state had no
cache, so it reset to `null` on each remount, causing the sidebar to render with
hardcoded fallback colors and the default nav order for a moment, then "snap" to
your saved theme/order once the `/monitor/system/ui-customization` fetch resolved
a beat later. That snap is the color change and the button rearrange you saw on
every click.

**Fix:** cache `ui` the same way `admin` was already being cached — a module-level
variable + `sessionStorage`, seeded into `useState` on init. Now the saved theme
and nav order are available immediately on remount; the background fetch just
quietly keeps it fresh instead of visibly overwriting it.

Also fixed a duplicate `order: 5` on "Notifications" and "Workers" in the
`defaultNav` fallback array (harmless due to an alphabetical tiebreaker, but wrong).

Note: Sign out, the header buttons, and the "Settings" sub-menu (Email, Sound,
Operations, etc.) are intentionally hardcoded outside the orderable `navigation`
array — they're structural chrome, not user-customizable nav items. That's by
design, not the bug; they do still inherit sidebar theme colors via CSS variables.

## 2. app/collections/page.tsx — redesigned collection dropdown + states

- Replaced the native `<select>` with a custom dropdown (`CollectionDropdown`):
  opens as a floating panel, shows each collection's name + document count as a
  pill, highlights the active one, closes on outside click or Escape.
- Added a **loading state** for the dropdown itself (spinner + skeleton line)
  that shows while collections are being fetched — previously there was no
  indication at all during that fetch.
- Added an **empty state** for when the database has no collections yet (dashed
  border card, "No collections found", explanatory line) — Search and "Add
  document" are disabled in this state instead of silently doing nothing.
- Split the old single `loading` flag into `collectionsLoading` (the dropdown/
  collection list) and `rowsLoading` (the document table), so each shows its own
  accurate state instead of one covering for the other.
- Table now distinguishes: loading collections (skeleton rows) → no collections
  at all → no collection selected → loading rows (skeleton rows) → empty
  collection ("has no documents yet") → no search results ("No documents match
  your search" + Clear search) → populated. Previously all empty cases showed
  the same generic "No documents found."
