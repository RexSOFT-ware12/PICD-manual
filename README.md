# PICD Scan Queue Monitor

A read-only dashboard for the measurement-pipeline API: live counts by
status (queued/processing/completed/failed), queue depth, and a
kanban board of individual scans with thumbnails.

## 1. Backend — two files to add first

The dashboard needs a list/stats endpoint the API doesn't have yet.
From `backend-additions/`:

1. Copy `api/monitor_routes.py` into your backend's `api/` folder.
2. Replace your `run.py` with the included one (it just adds the
   `monitor_router` include and a CORS middleware block — diff it
   against your current `run.py` if you've changed it since).
3. Optional: set `DASHBOARD_ORIGIN` in `.env` to your deployed Vercel
   URL once you have one (e.g. `https://picd-monitor.vercel.app`) to
   lock CORS down from `*`.

New endpoints, both respecting the existing `SCANS_API_KEY` check:

- `GET /monitor/stats` → counts per status + current queue depth
- `GET /monitor/scans?status=&q=&limit=&skip=` → paginated scan list

Restart `python run.py`. Since the pipeline itself needs Photoshop/
Illustrator/Daz Studio, it keeps running on your Mac — this dashboard
just reads its status, it doesn't replace how you host the API (see
the backend's own `API_INTEGRATION_README.md` for the tunnel setup).

## 2. Frontend — deploy to Vercel

```bash
npm install
npm run dev      # local check at localhost:3000
```

Push this folder to a GitHub repo and import it in Vercel (or
`npx vercel` from here directly). No environment variable is
required at deploy time — the dashboard has a "connection" panel
(top of the left rail) where you paste your tunnel URL and, if set,
your API key. Both are stored only in the browser's localStorage.

If you'd rather bake in a default so you don't have to set it per
browser, set `NEXT_PUBLIC_API_BASE_URL` in Vercel's project settings
to your tunnel URL — the panel falls back to it until someone
overrides it.

## Notes

- This only ever issues `GET` requests — it can't queue, retry, or
  delete a scan.
- Images are loaded directly from the `url` your capture app
  submitted (S3, etc.) — make sure those URLs are publicly reachable
  or the thumbnails won't render.
- Polls every 5 seconds. If you need it near-real-time, ping me and
  the backend can be swapped from polling to the `callback_url`
  webhook it already supports, pushed via a WebSocket.

## v2 additions

Requires the companion `dashboard-v2-backend-additions` package applied
to your backend first (adds `/monitor/ws`, pause/resume, stuck watchdog,
bulk actions, config, alerts, system info).

- **Live indicator** (top-left rail) — "live" when the WebSocket is
  connected, "polling" when it falls back to the original 5s polling.
  Either way the board keeps working the same; this only changes how
  fast it notices a change.
- **Worker controls** — pause the worker (finishes the current job,
  takes nothing new), resume it, restart a dead worker task, and a
  popover with the current git commit/branch and process uptime.
- **Alerts panel** — set a Slack-compatible webhook URL and a
  stuck-job threshold in minutes; toggle alerts on failure and/or on
  stuck scans; send a test message.
- **Stuck-job badge** — a `processing` card past the configured
  threshold gets a "stuck" badge and a "force-fail" button, which
  clears the hung lock so the queue can move on. This never touches
  Photoshop/Illustrator/Daz on the Mac itself — check the machine if a
  real process is actually still stuck.
- **Bulk select** — checkboxes on non-completed cards; a floating
  toolbar appears once you've selected any, to retry or delete them
  all at once.

## Manual processing gate

Incoming scans are accepted immediately but remain in the `queued` state. The backend worker is intentionally dormant until the dashboard calls `POST /monitor/queue/trigger-next`. One trigger releases exactly one scan; the next scan remains queued until another manual trigger.

This means receiving a scan can never start Photoshop / Illustrator / Python / Daz processing by itself.

## Dashboard additions

- Failed scans can be dragged back into the **Queued** column. Completed scans are not draggable or mutable from the dashboard.
- A currently processing scan may be dragged as a visual action, but the backend intentionally refuses to re-queue it while Photoshop/Illustrator/Daz work is active because that external desktop pipeline cannot be safely cancelled.
- The board supports Today, This week, This month, and Custom date filtering.
- `/analytics` provides daily, weekly, monthly, and status-mix analytics plus an Excel-compatible CSV export.
