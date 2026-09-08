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
