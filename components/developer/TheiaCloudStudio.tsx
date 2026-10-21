"use client";

import { useEffect, useState, type FormEvent } from "react";
import { KeyRound, LogOut, Rocket, X } from "lucide-react";
import AppShell from "@/components/AppShell";

function configuredTheiaGatewayUrl() {
  const configured = process.env.NEXT_PUBLIC_THEIA_GATEWAY_URL?.trim();
  if (!configured) return "";
  try {
    const url = new URL(configured);
    if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) return "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return "";
  }
}

const THEIA_GATEWAY_URL = configuredTheiaGatewayUrl();

export default function TheiaCloudStudio() {
  const [ideAuthenticated, setIdeAuthenticated] = useState(false);
  const [checkingIdeSession, setCheckingIdeSession] = useState(true);
  const [loginOpen, setLoginOpen] = useState(false);
  const [ideUsername, setIdeUsername] = useState("");
  const [idePassword, setIdePassword] = useState("");
  const [ideLoginError, setIdeLoginError] = useState("");
  const [ideActionError, setIdeActionError] = useState("");
  const [ideLoginBusy, setIdeLoginBusy] = useState(false);

  useEffect(() => {
    if (!THEIA_GATEWAY_URL) {
      setCheckingIdeSession(false);
      return;
    }
    let current = true;
    fetch(`${THEIA_GATEWAY_URL}/auth/session`, { credentials: "include", cache: "no-store" })
      .then(async response => {
        if (!response.ok) throw new Error(`Login gateway returned ${response.status}.`);
        return response.json() as Promise<{ authenticated?: boolean }>;
      })
      .then(session => {
        if (!current) return;
        setIdeAuthenticated(session.authenticated === true);
        if (!session.authenticated) setLoginOpen(true);
      })
      .catch(error => {
        if (!current) return;
        setIdeLoginError(error instanceof Error ? error.message : "Could not connect to the IDE login service.");
        setLoginOpen(true);
      })
      .finally(() => {
        if (current) setCheckingIdeSession(false);
      });
    return () => { current = false; };
  }, []);

  useEffect(() => {
    if (!loginOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !ideLoginBusy) {
        setLoginOpen(false);
        setIdePassword("");
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [loginOpen, ideLoginBusy]);

  const signInToIde = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (ideLoginBusy) return;
    setIdeLoginBusy(true);
    setIdeLoginError("");
    try {
      const response = await fetch(`${THEIA_GATEWAY_URL}/auth/login`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: ideUsername, password: idePassword }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Sign-in failed. Check your IDE username and password.");
      setIdeAuthenticated(true);
      setIdePassword("");
      setIdeActionError("");
      setLoginOpen(false);
    } catch (error) {
      setIdeLoginError(error instanceof Error ? error.message : "Could not sign in to the cloud IDE.");
    } finally {
      setIdeLoginBusy(false);
    }
  };

  const signOutFromIde = async () => {
    setIdeActionError("");
    try {
      const response = await fetch(`${THEIA_GATEWAY_URL}/auth/logout`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      if (!response.ok) throw new Error(`Sign-out failed (${response.status}).`);
      setIdeAuthenticated(false);
      setLoginOpen(true);
    } catch (error) {
      setIdeActionError(error instanceof Error ? error.message : "Could not sign out of the cloud IDE.");
    }
  };

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
            {THEIA_GATEWAY_URL && ideAuthenticated && <button type="button" onClick={signOutFromIde} className="inline-flex items-center gap-2 rounded-xl border border-[var(--picd-page-border)] bg-[var(--picd-page-surface)] px-4 py-2.5 text-xs font-semibold text-[var(--picd-page-text)] transition hover:bg-[var(--picd-page-bg)]"><LogOut size={14} /> Sign out of IDE</button>}
          </div>
        </header>

        {ideActionError && <p role="alert" className="mb-4 rounded-xl border border-[var(--picd-error)] bg-[var(--picd-page-surface)] px-4 py-3 text-sm text-[var(--picd-error)]">{ideActionError}</p>}

        <section className="mb-4 flex items-start gap-3 rounded-2xl border border-[var(--picd-page-border)] bg-[var(--picd-page-surface)] p-4 shadow-sm">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--picd-page-accent)]/10 text-[var(--picd-page-accent)]"><KeyRound size={18} /></span>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[.16em] text-[var(--picd-page-muted)]">Configure GitHub in the IDE</p>
            <p className="mt-1 text-xs leading-relaxed text-[var(--picd-page-muted)]">Use the IDE terminal to run <code className="rounded bg-[var(--picd-page-bg)] px-1.5 py-1 font-mono text-[10px] text-[var(--picd-page-text)]">gh auth login --web</code>, then <code className="rounded bg-[var(--picd-page-bg)] px-1.5 py-1 font-mono text-[10px] text-[var(--picd-page-text)]">gh auth setup-git</code>. Clone a repository with <code className="rounded bg-[var(--picd-page-bg)] px-1.5 py-1 font-mono text-[10px] text-[var(--picd-page-text)]">gh repo clone OWNER/REPOSITORY</code>.</p>
          </div>
        </section>

        {!THEIA_GATEWAY_URL ? (
          <section className="flex min-h-[360px] flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--picd-page-border)] bg-[var(--picd-page-surface)] px-6 text-center">
            <Rocket size={30} className="text-[var(--picd-page-accent)]" />
            <h2 className="mt-4 text-lg font-semibold">Connect the cloud IDE</h2>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-[var(--picd-page-muted)]">Deploy the PICD Theia service and its login gateway, then set <code className="rounded bg-[var(--picd-page-bg)] px-1.5 py-0.5 font-mono text-xs">NEXT_PUBLIC_THEIA_GATEWAY_URL</code> in the Vercel project and redeploy this dashboard.</p>
            <p className="mt-3 text-xs text-[var(--picd-page-muted)]">See <code className="font-mono">THEIA-CLOUD-IDE.md</code> for setup and GitHub sign-in steps.</p>
          </section>
        ) : (
          <div className="relative min-h-[420px] flex-1 overflow-hidden rounded-2xl border border-[var(--picd-page-border)] bg-[#10151e] shadow-lg">
            {ideAuthenticated ? (
              <iframe
                title="PICD Theia Cloud IDE"
                src={THEIA_GATEWAY_URL}
                className="absolute inset-0 h-full w-full border-0"
                sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-downloads allow-popups allow-popups-to-escape-sandbox allow-pointer-lock"
                allow="clipboard-read; clipboard-write"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center text-white">
                <KeyRound size={28} className="text-sky-300" />
                <h2 className="mt-4 text-lg font-semibold">{checkingIdeSession ? "Checking IDE access…" : "Sign in to launch the IDE"}</h2>
                <p className="mt-2 max-w-md text-sm text-white/60">{checkingIdeSession ? "Checking your secure session." : "Authenticate with the private cloud IDE to open your workspace."}</p>
                {!checkingIdeSession && <button type="button" onClick={() => { setIdeLoginError(""); setLoginOpen(true); }} className="mt-5 rounded-xl bg-[var(--picd-page-accent)] px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:opacity-90">Sign in to IDE</button>}
              </div>
            )}
          </div>
        )}
      </main>
      {THEIA_GATEWAY_URL && loginOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center overflow-y-auto bg-slate-950/60 p-4 backdrop-blur-sm animate-modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget && !ideLoginBusy) { setLoginOpen(false); setIdePassword(""); } }}>
          <section role="dialog" aria-modal="true" aria-labelledby="ide-login-title" className="relative w-full max-w-md overflow-hidden rounded-2xl border border-[var(--picd-page-border)] bg-[var(--picd-page-surface)] shadow-2xl animate-modal-panel">
            <button type="button" aria-label="Close sign-in dialog" onClick={() => { setLoginOpen(false); setIdePassword(""); }} disabled={ideLoginBusy} className="absolute right-4 top-4 rounded-lg p-2 text-[var(--picd-page-muted)] transition hover:bg-[var(--picd-page-bg)] hover:text-[var(--picd-page-text)] disabled:opacity-40"><X size={17} /></button>
            <div className="p-6 sm:p-8">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--picd-page-accent)]/10 text-[var(--picd-page-accent)]"><KeyRound size={20} /></span>
              <p className="mt-5 text-[10px] font-bold uppercase tracking-[.18em] text-[var(--picd-page-accent)]">PICDs / Engineering</p>
              <h2 id="ide-login-title" className="mt-1 text-2xl font-semibold tracking-tight text-[var(--picd-page-text)]">Sign in to Developer Studio</h2>
              <p className="mt-2 text-sm leading-relaxed text-[var(--picd-page-muted)]">Use the private cloud IDE credentials configured for the Render service.</p>
              <form onSubmit={signInToIde} className="mt-6 space-y-4">
                <label className="block text-xs font-semibold text-[var(--picd-page-text)]">Username
                  <input autoFocus required autoComplete="username" value={ideUsername} onChange={event => setIdeUsername(event.target.value)} className="mt-1.5 w-full rounded-xl border border-[var(--picd-page-border)] bg-[var(--picd-page-bg)] px-3.5 py-3 text-sm outline-none transition focus:border-[var(--picd-page-accent)]" />
                </label>
                <label className="block text-xs font-semibold text-[var(--picd-page-text)]">Password
                  <input required type="password" autoComplete="current-password" value={idePassword} onChange={event => setIdePassword(event.target.value)} className="mt-1.5 w-full rounded-xl border border-[var(--picd-page-border)] bg-[var(--picd-page-bg)] px-3.5 py-3 text-sm outline-none transition focus:border-[var(--picd-page-accent)]" />
                </label>
                {ideLoginError && <p role="alert" className="rounded-xl border border-[var(--picd-error)] bg-[var(--picd-error)]/5 px-3 py-2.5 text-xs leading-relaxed text-[var(--picd-error)]">{ideLoginError}</p>}
                <button type="submit" disabled={ideLoginBusy || !ideUsername || !idePassword} className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--picd-page-accent)] px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50">{ideLoginBusy ? "Signing in…" : "Sign in securely"}</button>
                <p className="text-center text-[11px] leading-relaxed text-[var(--picd-page-muted)]">Your credentials are sent over HTTPS and are never added to the IDE address.</p>
              </form>
            </div>
          </section>
        </div>
      )}
    </AppShell>
  );
}
