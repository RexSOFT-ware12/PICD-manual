# PICD Manual — Settings redesign

## What changed
- Replaced the long horizontal settings tab bar with a grouped vertical settings sidebar.
- Groups: Overview, Notifications, Processing, Workspace, Access & Data, Diagnostics.
- The selected settings panel is rendered exclusively; inactive panels are not mounted.
- This is important for stability: previously every settings panel could execute its `.map()` expressions even when hidden with CSS, so malformed data from an unrelated panel could crash the whole Settings page.
- Added a compact Settings Overview landing panel with quick status cards and links.
- Renamed General Settings in the sidebar to **Connection & Runtime** to better describe what it contains.
- Kept existing backend API contracts and save/reset actions.
- Kept desktop-only layout.

## Recommended organization
### Notifications
- Email notifications
- Notification sound

### Processing
- Operations
- Feature flags
- Client Estimate
- Body Analyzer
- Global Variables

### Workspace
- Appearance & Navigation
- Connection & Runtime

### Access & Data
- Users & Access
- Database

### Diagnostics
- Diagnostics & Logs

## Stability change
`renderActiveSection()` uses a switch so React creates only the selected panel. This is intentionally different from the old pattern of rendering all panels with `className="hidden"`.
