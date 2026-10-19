# PICD Developer Studio upgrade patch

This patch overlays the existing PICD projects. It does not contain the full 497 MB frontend archive or the complete backend source archive.

## Files to copy into the matching project roots

- `PICD-manual/app/developer-studio/page.tsx`
- `PICD-manual/lib/api.ts`
- `PICDs-Manual---Backend/api/developer_routes.py`
- `PICDs-Manual---Backend/Dockerfile.developer-studio`
- `PICDs-Manual---Backend/DEVELOPER-STUDIO-UPGRADE.md`

The frontend additions call `/developer/terminal/status`, `/developer/terminal/run`, and `/developer/terminal/jobs/{job_id}`. The backend endpoints are protected by the existing dashboard authentication and Developer Studio permission check.

## Important status

This is the first upgrade slice: a VS Code-inspired workspace with the existing GitHub backend-repository browser/PR workflow plus a terminal command runner, command history and polled output. The editor is still the existing browser text editor; Monaco, language servers, debugging/breakpoints, a persistent multi-tab PTY, interactive stdin, and automatic local Photoshop dispatch are not included in this patch yet.

Cloud terminal requires Docker on a Docker-capable backend host. It is disabled by default and uses a network-disabled container. Local terminal requires explicit opt-in and executes on the computer hosting the local PICD API. Do not enable local mode on a public/cloud API deployment.

Set `PICD_GITHUB_OWNER`, `PICD_GITHUB_REPO` and `PICD_GITHUB_BASE_BRANCH` to the backend repository you intend to edit. The GitHub token remains backend-only. The existing GitHub pull-request flow is preserved; no direct push to the deployment branch was added.
