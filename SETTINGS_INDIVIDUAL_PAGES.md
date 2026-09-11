# Individual Settings Pages

Settings navigation now uses real routes instead of `/system?section=...` query-string state.

Routes:
- `/system` — Settings overview
- `/system/email` — Email notifications
- `/system/sound` — Notification sound
- `/system/operations` — Operations
- `/system/features` — Feature flags
- `/system/estimate` — Client Estimate
- `/system/body` — Body Analyzer
- `/system/global` — Global Variables
- `/system/appearance` — Appearance & Navigation
- `/system/general` — Connection & Runtime
- `/system/access` — Users & Access
- `/system/database` — Database
- `/system/logs` — Diagnostics & Logs

The main sidebar links directly to each route. The old query-string settings selector and `useSearchParams` dependency are removed.

The Settings implementation is shared by route wrappers for now so backend/API behavior is not duplicated. Appearance has its own route and can be split into a dedicated component independently if needed.
