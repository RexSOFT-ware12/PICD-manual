# PICD cloud IDE

The Developer Studio route now hosts Eclipse Theia from a separate Render
service. The Next.js dashboard remains on Vercel; Theia needs its own
long-running server for the editor, terminal, and cloud workspace.

## Deploy

The Theia service build source is maintained separately and is not included in
this workspace. It must already be deployed with
`THEIA_BASIC_AUTH_USER` and `THEIA_BASIC_AUTH_PASSWORD` set to strong, private
values and a persistent disk mounted at `/data`.

1. Create the `picd-cloud-ide-gateway` Render web service from the
   `theia-gateway/` directory (or sync the Blueprint after the Theia build
   source is available in the repository). Set
   `THEIA_UPSTREAM_URL` to the Theia service's HTTPS URL, and set its Basic
   Auth username and password to the same private values used by Theia.
   Set `DASHBOARD_ORIGIN` to the exact HTTPS origin of the Vercel dashboard
   (no path or trailing slash), and set `SESSION_SECRET` to a random value of
   at least 32 bytes. The Blueprint generates this secret automatically.
3. Copy the gateway's HTTPS URL into the Vercel project's
   `NEXT_PUBLIC_THEIA_GATEWAY_URL` environment variable and redeploy the
   dashboard.
4. Open **Developer Studio** and sign in using the Theia service credentials.
   The dashboard login modal establishes a short-lived, HttpOnly session;
   credentials are not included in the IDE URL or stored by the dashboard.

The first Theia build installs the browser application and its plugins. The
Render service must have enough memory for Theia and needs persistent storage
for the workspace and GitHub CLI credentials.

The gateway keeps Theia's Basic Auth credentials server-side and proxies both
HTTP and WebSocket traffic after validating the session. Its partitioned,
secure cookie is scoped to the gateway and the dashboard's embedded context.
Do not expose the gateway's upstream credentials or session secret in the
dashboard's `NEXT_PUBLIC_*` environment variables.

## GitHub workflow

Configure GitHub in the Theia IDE terminal with the per-user GitHub CLI device
authorization flow:

```sh
gh auth login --web
gh auth setup-git
gh repo clone OWNER/REPOSITORY
```

Replace `OWNER/REPOSITORY` with the repository you want to work on. Complete
the device authorization in your own browser.
The CLI credentials live on the persistent Render disk, not in the dashboard
or its frontend configuration. The clone command creates a repository folder;
use Theia's **File → Open Folder** to open it. Then use its Source Control
view or `gh pr create` in the integrated terminal.

This uses GitHub CLI OAuth for the single developer account. Theia's browser
example does not include a native, multi-user GitHub sign-in provider.

## Access and execution

This deployment is intended for **one trusted developer**. The gateway
authenticates access to the Theia server and its WebSocket connections; the
upstream Theia service remains protected by HTTP Basic Authentication.
Render provides HTTPS. The Theia workspace, terminal, and GitHub CLI
credentials are shared by anyone with IDE access. Do not share the IDE
credentials or run untrusted code in this service. A multi-user IDE needs
per-user authentication and isolated workspaces/containers and is not
provided by this single-service setup.

Code runs on the Render host in the Theia service container. The Vercel
frontend does not execute code. The dashboard's
`NEXT_PUBLIC_THEIA_GATEWAY_URL` is a public service URL, not a credential;
never put the Basic Auth password, gateway session secret, or a GitHub token
in a `NEXT_PUBLIC_*` variable.
