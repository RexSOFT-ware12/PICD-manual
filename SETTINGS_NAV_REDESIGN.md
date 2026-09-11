# Settings navigation redesign

The System Settings page no longer contains a second settings sidebar.

Settings are now surfaced in the application's **main sidebar** under a Settings group:
- Notifications: Email notifications, Notification sound
- Processing: Operations, Feature flags, Client Estimate, Body Analyzer, Global Variables
- Workspace: Appearance & Navigation, Connection & Runtime
- Access & Data: Users & Access, Database
- Diagnostics: Diagnostics & Logs

The `/system` page is a single content surface selected with `?section=...`; only the active settings panel is mounted. This avoids rendering every configuration editor at once and reduces the risk of unrelated panels triggering runtime errors.

Appearance & Navigation was also redesigned around the real main sidebar: grouped navigation editing, inline visual controls, and a live sidebar preview.
