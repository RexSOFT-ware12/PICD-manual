"use client";

import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Github, KeyRound, Rocket, TerminalSquare } from "lucide-react";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import { ApiError, fetchDeveloperGithubStatus, loadSettings, type DeveloperGithubStatus } from "@/lib/api";

function configuredTheiaUrl() {
  const configured = process.env.NEXT_PUBLIC_THEIA_URL?.trim();
  if (!configured) return "";
  try {
    const url = new URL(configured);
    if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) return "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return "";
  }
}

const THEIA_URL = configuredTheiaUrl();

export default function TheiaCloudStudio() {
  const settings = useMemo(() => loadSettings(), []);
  const [github, setGithub] = useState<DeveloperGithubStatus | null>(null);
  const [githubError, setGithubError] = useState("");

  useEffect(() => {
    if (!settings.baseUrl) {
      setGithubError("Connect the PICD API in the dashboard settings to load the configured repository.");
      return;
    }
    let current = true;
    fetchDeveloperGithubStatus(settings)
      .then(status => {
        if (current) setGithub(status);
      })
      .catch(error => {
        if (!current) return;
        setGithubError(error instanceof ApiError ? error.message : "Could not load the configured GitHub repository.");
      });
    return () => { current = false; };
  }, [settings]);

  const repository = github?.repository || [github?.owner, github?.repo].filter(Boolean).join("/");
  const validRepository = repository && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)
    ? repository
    : "";
  const cloneCommand = validRepository ? `gh repo clone ${validRepository}` : "";

  return (
    <AppShell>
      <main className="flex h-full min-h-0 flex-col overflow-y-auto bg-[var(--picd-page-bg)] px-5 py-5 text-[var(--picd-page-text)] md:px-7">
        <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[.22em] text-[var(--picd-page-accent)]">PICDs / Engineering</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">Developer Studio</h1>
            <p className="mt-1 text-xs text-[var(--picd-page-muted)]">Theia cloud IDE · persistent workspace · GitHub CLI</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/developer-studio/github" className="inline-flex items-center gap-2 rounded-xl border border-[var(--picd-page-border)] bg-[var(--picd-page-surface)] px-4 py-2.5 text-xs font-semibold text-[var(--picd-page-text)] transition hover:bg-[var(--picd-page-bg)]"><Github size={15} /> GitHub review tools</Link>
            {THEIA_URL && <a href={THEIA_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl bg-[var(--picd-page-accent)] px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:opacity-90"><ExternalLink size={15} /> Open IDE in new tab</a>}
          </div>
        </header>

        <div className="mb-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(300px,.75fr)]">
          <section className="rounded-2xl border border-[var(--picd-page-border)] bg-[var(--picd-page-surface)] p-4 shadow-sm">
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--picd-page-accent)]/10 text-[var(--picd-page-accent)]"><Github size={18} /></span>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-bold uppercase tracking-[.16em] text-[var(--picd-page-muted)]">Configured GitHub repository</p>
                <p className="mt-1 truncate text-sm font-semibold">{validRepository || (githubError ? "Not connected" : "Loading repository…")}</p>
                {github?.base_branch && <p className="mt-1 text-[11px] text-[var(--picd-page-muted)]">Base branch: {github.base_branch}</p>}
                {githubError && <p role="status" className="mt-1 text-[11px] text-[var(--picd-page-muted)]">{githubError}</p>}
                {validRepository && <a href={`https://github.com/${validRepository}`} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--picd-page-accent)] hover:underline">View repository <ExternalLink size={12} /></a>}
              </div>
            </div>
          </section>
          <section className="rounded-2xl border border-[var(--picd-page-border)] bg-[var(--picd-page-surface)] p-4 shadow-sm">
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--picd-page-accent)]/10 text-[var(--picd-page-accent)]"><KeyRound size={18} /></span>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[.16em] text-[var(--picd-page-muted)]">Private single-developer IDE</p>
                <p className="mt-1 text-xs leading-relaxed text-[var(--picd-page-muted)]">The Render service asks for its own username and password. Sign in to GitHub from the IDE terminal with the device flow; credentials stay on the persistent cloud workspace.</p>
              </div>
            </div>
          </section>
        </div>

        {!THEIA_URL ? (
          <section className="flex min-h-[360px] flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--picd-page-border)] bg-[var(--picd-page-surface)] px-6 text-center">
            <Rocket size={30} className="text-[var(--picd-page-accent)]" />
            <h2 className="mt-4 text-lg font-semibold">Connect the cloud IDE</h2>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-[var(--picd-page-muted)]">Deploy the PICD Theia service to Render, then set <code className="rounded bg-[var(--picd-page-bg)] px-1.5 py-0.5 font-mono text-xs">NEXT_PUBLIC_THEIA_URL</code> in the Vercel project and redeploy this dashboard.</p>
            <p className="mt-3 text-xs text-[var(--picd-page-muted)]">See <code className="font-mono">THEIA-CLOUD-IDE.md</code> for setup and GitHub sign-in steps.</p>
          </section>
        ) : (
          <>
            <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-[var(--picd-page-border)] bg-[var(--picd-page-surface)] px-3 py-2.5">
              <TerminalSquare size={15} className="text-[var(--picd-page-accent)]" />
              <p className="text-[11px] text-[var(--picd-page-muted)]">In the IDE terminal, run <code className="rounded bg-[var(--picd-page-bg)] px-1.5 py-1 font-mono text-[10px] text-[var(--picd-page-text)]">gh auth login --web</code>, then <code className="rounded bg-[var(--picd-page-bg)] px-1.5 py-1 font-mono text-[10px] text-[var(--picd-page-text)]">gh auth setup-git</code> to authorize GitHub for this user.</p>
            </div>
            {cloneCommand && <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-[var(--picd-page-border)] bg-[var(--picd-page-surface)] px-3 py-2.5">
              <Github size={15} className="text-[var(--picd-page-accent)]" />
              <p className="text-[11px] text-[var(--picd-page-muted)]">Clone the configured repo into the workspace with:</p>
              <code className="rounded bg-[var(--picd-page-bg)] px-2 py-1 font-mono text-[10px] text-[var(--picd-page-text)]">{cloneCommand}</code>
            </div>}
            <div className="relative min-h-[420px] flex-1 overflow-hidden rounded-2xl border border-[var(--picd-page-border)] bg-[#10151e] shadow-lg">
              <iframe
                title="PICD Theia Cloud IDE"
                src={THEIA_URL}
                className="absolute inset-0 h-full w-full border-0"
                sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-downloads allow-popups allow-popups-to-escape-sandbox allow-pointer-lock"
                allow="clipboard-read; clipboard-write"
                referrerPolicy="no-referrer"
              />
            </div>
          </>
        )}
      </main>
    </AppShell>
  );
}
