# PICD cloud IDE

The Developer Studio route now hosts Eclipse Theia from a separate Render
service. The Next.js dashboard remains on Vercel; Theia needs its own
long-running server for the editor, terminal, and cloud workspace.

## Deploy

1. Commit and push `render.yaml`, the `theia-master` source tree, and the
   `theia-master/Dockerfile.picd` deployment files. Render cannot build from
   local untracked files.
2. In Render, create a Blueprint from this repository and set
   `THEIA_BASIC_AUTH_USER` and `THEIA_BASIC_AUTH_PASSWORD` to strong,
   private values when prompted. The blueprint provisions a Standard web
   service and a persistent 10 GB disk mounted at `/data`.
3. After Render deploys, copy the service's HTTPS URL into the Vercel
   project's `NEXT_PUBLIC_THEIA_URL` environment variable and redeploy the
   dashboard.
4. Open **Developer Studio**. The Theia frame uses the separate Render
   username and password; this is not the same as the PICD dashboard login.

The first Theia build installs the browser application and its plugins. The
Render service must have enough memory for Theia and needs persistent storage
for the workspace and GitHub CLI credentials.

## GitHub workflow

The existing PICD GitHub review/editor page is preserved at
`/developer-studio/github`. In Theia, Git operations and pull requests use the
per-user GitHub CLI device authorization flow:

```sh
gh auth login --web
gh auth setup-git
gh repo clone OWNER/REPOSITORY
```

Use the configured repository shown in Developer Studio in place of
`OWNER/REPOSITORY`. Complete the device authorization in your own browser.
The CLI credentials live on the persistent Render disk, not in the dashboard
or its frontend configuration. The clone command creates a repository folder;
use Theia's **File → Open Folder** to open it. Then use its Source Control
view or `gh pr create` in the integrated terminal.

This uses GitHub CLI OAuth for the single developer account. Theia's browser
example does not include a native, multi-user GitHub sign-in provider.

## Access and execution

This deployment is intended for **one trusted developer**. Nginx protects the
Theia server and its WebSocket connections with HTTP Basic Authentication;
Render provides HTTPS. The Theia workspace, terminal, and GitHub CLI
credentials are shared by anyone with that separate service password. Do not
share the IDE URL/password or run untrusted code in this service. A
multi-user IDE needs per-user authentication and isolated workspaces/containers
and is not provided by this single-service setup.

Code runs on the Render host in the Theia service container. The Vercel
frontend does not execute code. The dashboard's `NEXT_PUBLIC_THEIA_URL` is a
public service URL, not a credential; never put the Basic Auth password or a
GitHub token in a `NEXT_PUBLIC_*` variable.
