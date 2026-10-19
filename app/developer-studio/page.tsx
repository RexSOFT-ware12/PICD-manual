"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import {
  ApiError,
  createDeveloperGithubPullRequest,
  fetchDeveloperGithubFile,
  fetchDeveloperGithubFiles,
  fetchDeveloperGithubStatus,
  loadSettings,
  type DeveloperGithubFile,
  type DeveloperGithubFileItem,
  type DeveloperGithubStatus,
} from "@/lib/api";

type FileBuffer = DeveloperGithubFile & { savedContent: string };
const PANEL = "rounded-2xl border border-[var(--picd-page-border)] bg-[var(--picd-page-surface)]";
const BUTTON = "rounded-lg border border-[var(--picd-page-border)] px-3 py-2 text-xs font-semibold text-[var(--picd-page-text)] hover:bg-[var(--picd-page-bg)] disabled:cursor-not-allowed disabled:opacity-40";

function errorMessage(error: unknown) {
  const status = error instanceof ApiError ? error.status : undefined;
  const detail = error instanceof Error ? error.message : "An unexpected error occurred.";
  if (status === 503) return `GitHub integration is not configured (503). Configure the GitHub environment variables on the backend. ${detail}`;
  if (status === 401) return `Please log in as an administrator to continue (401). ${detail}`;
  if (status === 403) return `This account needs Developer Studio permission, or the request failed a security check (403). ${detail}`;
  if (status === 409) return `GitHub has changed since this file was loaded. Refresh from GitHub and reconcile your edits before retrying (409). ${detail}`;
  return detail;
}

function fileDiff(original: string, updated: string) {
  const before = original.split("\n");
  const after = updated.split("\n");
  let prefix = 0;
  while (prefix < before.length && prefix < after.length && before[prefix] === after[prefix]) prefix++;
  let suffix = 0;
  while (
    suffix < before.length - prefix &&
    suffix < after.length - prefix &&
    before[before.length - 1 - suffix] === after[after.length - 1 - suffix]
  ) suffix++;
  const contextStart = Math.max(0, prefix - 3);
  const contextEnd = Math.min(suffix, 3);
  const rows: { type: "context" | "remove" | "add"; text: string }[] = [];
  for (let i = contextStart; i < prefix; i++) rows.push({ type: "context", text: before[i] });
  for (let i = prefix; i < before.length - suffix; i++) rows.push({ type: "remove", text: before[i] });
  for (let i = prefix; i < after.length - suffix; i++) rows.push({ type: "add", text: after[i] });
  for (let i = 0; i < contextEnd; i++) rows.push({ type: "context", text: before[before.length - contextEnd + i] });
  return rows;
}

export default function DeveloperStudioPage() {
  const settings = useMemo(() => loadSettings(), []);
  const [folder, setFolder] = useState("");
  const [files, setFiles] = useState<DeveloperGithubFileItem[]>([]);
  const [selected, setSelected] = useState("");
  const [buffers, setBuffers] = useState<Record<string, FileBuffer>>({});
  const [status, setStatus] = useState<DeveloperGithubStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [pullRequest, setPullRequest] = useState<{ url: string; branch?: string; commit?: string } | null>(null);
  const current = buffers[selected];
  const dirtyPaths = Object.values(buffers).filter(file => file.content !== file.savedContent);
  const dirty = dirtyPaths.length > 0;

  const loadFolder = useCallback(async (path = folder) => {
    setLoading(true);
    setError("");
    try {
      const result = await fetchDeveloperGithubFiles(settings, path);
      setFiles(result.items);
      setFolder(path);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [folder, settings]);

  const loadInitial = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [githubStatus, listing] = await Promise.all([
        fetchDeveloperGithubStatus(settings),
        fetchDeveloperGithubFiles(settings, ""),
      ]);
      setStatus(githubStatus);
      setFiles(listing.items);
      setFolder("");
      setMessage("Connected to GitHub. Browse existing supported files to get started.");
    } catch (e) {
      setStatus(null);
      setFiles([]);
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [settings]);

  useEffect(() => { void loadInitial(); }, [loadInitial]);

  const openFile = async (path: string) => {
    setError("");
    if (buffers[path]) {
      setSelected(path);
      setReviewing(false);
      return;
    }
    setLoading(true);
    try {
      const file = await fetchDeveloperGithubFile(settings, path);
      setBuffers(existing => ({ ...existing, [file.path]: { ...file, savedContent: file.content } }));
      setSelected(file.path);
      setReviewing(false);
      setMessage(`Loaded ${file.path} from GitHub.`);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  const refreshFromGithub = async () => {
    if (dirty && !window.confirm("Refresh will discard all unsaved editor changes. Continue?")) return;
    setLoading(true);
    setError("");
    setPullRequest(null);
    try {
      const paths = Object.keys(buffers);
      const [nextStatus, listing, refreshedFiles] = await Promise.all([
        fetchDeveloperGithubStatus(settings),
        fetchDeveloperGithubFiles(settings, folder),
        Promise.all(paths.map(path => fetchDeveloperGithubFile(settings, path))),
      ]);
      setStatus(nextStatus);
      setFiles(listing.items);
      setBuffers(Object.fromEntries(refreshedFiles.map(file => [file.path, { ...file, savedContent: file.content }])));
      setMessage("Repository status, file listing, and open editor buffers refreshed from GitHub.");
      setReviewing(false);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  const updateContent = (content: string) => {
    if (!current) return;
    setBuffers(existing => ({ ...existing, [selected]: { ...current, content } }));
    setReviewing(false);
    setPullRequest(null);
  };

  const createPullRequest = async () => {
    if (!status || dirtyPaths.length === 0 || dirtyPaths.length > 20) return;
    setSubmitting(true);
    setError("");
    setPullRequest(null);
    try {
      const result = await createDeveloperGithubPullRequest(settings, {
        title: title.trim(),
        body: description.trim(),
        base_sha: status.base_sha || dirtyPaths[0].base_sha,
        files: dirtyPaths.map(({ path, content, sha }) => ({ path, content, sha })),
      });
      const url = result.pull_request_url || result.url || result.html_url || result.pr_url;
      if (!url) throw new Error("The pull request was created, but the backend response did not include its URL.");
      setPullRequest({ url, branch: result.branch, commit: result.commit_sha });
      setMessage("Pull request created. Open it to review and merge; merging to the deploy branch triggers Render deployment.");
      setReviewing(false);
      setBuffers(existing => {
        const next = { ...existing };
        for (const file of dirtyPaths) delete next[file.path];
        return next;
      });
      setTitle("");
      setDescription("");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSubmitting(false);
    }
  };

  const goUp = () => {
    const parts = folder.split("/").filter(Boolean);
    parts.pop();
    void loadFolder(parts.join("/"));
  };

  const repository = status?.repository || [status?.owner, status?.repo].filter(Boolean).join("/");
  const connected = status?.configured ?? status?.ok ?? !!repository;

  return <AppShell><main className="h-full overflow-y-auto bg-[var(--picd-page-bg)] px-5 py-6 text-[var(--picd-page-text)] md:px-8"><div className="mx-auto max-w-[1600px]">
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div><p className="text-[10px] font-bold uppercase tracking-[.22em] text-[var(--picd-page-accent)]">PICDs / Engineering</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">Developer Studio</h1><p className="mt-2 max-w-3xl text-sm text-[var(--picd-page-muted)]">Browse repository files, edit changes, and submit them for review through a GitHub pull request.</p></div>
      <button className={BUTTON} onClick={refreshFromGithub} disabled={loading || submitting}>{loading ? "Refreshing…" : "Refresh from GitHub"}</button>
    </header>

    <div className="mb-4 grid gap-3 md:grid-cols-3">
      <div className={`${PANEL} p-4`}><p className="text-xs text-[var(--picd-page-muted)]">GitHub repository</p><p className="mt-1 font-semibold">{connected ? repository || "Connected" : "Not connected"}</p><p className="mt-1 text-[11px] text-[var(--picd-page-muted)]">{connected ? `Deploy branch: ${status?.base_branch || "—"}` : "Configure the GitHub integration on the backend."}</p></div>
      <div className={`${PANEL} p-4`}><p className="text-xs text-[var(--picd-page-muted)]">Editor status</p><p className="mt-1 font-semibold">{dirty ? `${dirtyPaths.length} unsaved file${dirtyPaths.length === 1 ? "" : "s"}` : "No unsaved changes"}</p><p className="mt-1 text-[11px] text-[var(--picd-page-muted)]">Existing supported UTF-8 text files only · 1 MB per file · no create or delete</p></div>
      <div className={`${PANEL} p-4`}><p className="text-xs text-[var(--picd-page-muted)]">Pull request limit</p><p className="mt-1 font-semibold">{dirtyPaths.length} / 20 files changed</p><p className="mt-1 text-[11px] text-[var(--picd-page-muted)]">Changes are submitted on a new branch; there is no direct deploy-branch edit.</p></div>
    </div>

    {error && <div role="alert" className="mb-4 rounded-xl border border-[var(--picd-error)] bg-[var(--picd-page-surface)] px-4 py-3 text-sm text-[var(--picd-error)]">{error}</div>}
    {message && !error && <div role="status" className="mb-4 rounded-xl border border-[var(--picd-page-border)] bg-[var(--picd-page-surface)] px-4 py-3 text-sm text-[var(--picd-page-muted)]">{message}</div>}
    {pullRequest && <div className="mb-4 rounded-xl border border-[var(--picd-success)] bg-[var(--picd-page-surface)] px-4 py-3 text-sm"><p className="font-semibold text-[var(--picd-success)]">Pull request created</p><p className="mt-1 text-[var(--picd-page-muted)]">{pullRequest.branch && `Branch: ${pullRequest.branch} · `}{pullRequest.commit && `Commit: ${pullRequest.commit}`}</p><a className="mt-2 inline-block font-semibold text-[var(--picd-page-accent)] underline" href={pullRequest.url} target="_blank" rel="noreferrer">Open pull request for review</a></div>}

    <div className="grid min-h-[620px] gap-4 xl:grid-cols-[270px_minmax(0,1fr)]">
      <section className={`${PANEL} flex min-h-[400px] flex-col overflow-hidden`}>
        <div className="flex items-center justify-between border-b border-[var(--picd-page-border)] px-4 py-3"><span className="text-xs font-bold uppercase tracking-wider">Repository files</span><button className={BUTTON} onClick={goUp} disabled={!folder || loading}>Up</button></div>
        <div className="border-b border-[var(--picd-page-border)] px-3 py-2 text-[11px] text-[var(--picd-page-muted)]">/{folder}</div>
        <div className="flex-1 overflow-y-auto p-2">{files.map(file => {
          const buffer = buffers[file.path];
          const isDirty = !!buffer && buffer.content !== buffer.savedContent;
          return <button key={file.path} onClick={() => file.directory ? void loadFolder(file.path) : void openFile(file.path)} disabled={loading} className={`mb-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs ${selected === file.path ? "bg-[var(--picd-page-accent)]/15 text-[var(--picd-page-accent)]" : "text-[var(--picd-page-text)] hover:bg-[var(--picd-page-bg)]"}`}><span>{file.directory ? "▸" : "‹›"}</span><span className="min-w-0 flex-1 truncate">{file.name}</span>{isDirty && <span className="text-[var(--picd-warning)]" title="Unsaved changes">●</span>}{file.directory && <span className="text-[var(--picd-page-muted)]">/</span>}</button>;
        })}{!files.length && <p className="p-3 text-xs text-[var(--picd-page-muted)]">{loading ? "Loading…" : "No supported files in this folder."}</p>}</div>
        <div className="border-t border-[var(--picd-page-border)] p-3 text-[10px] leading-5 text-[var(--picd-page-muted)]">Only files supported by the backend are listed. Files must already exist in the repository.</div>
      </section>

      <section className={`${PANEL} flex min-w-0 flex-col overflow-hidden`}>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--picd-page-border)] px-4 py-3">
          <div className="min-w-0"><p className="text-xs font-bold uppercase tracking-wider">Code editor</p><p className="mt-1 truncate text-[11px] text-[var(--picd-page-muted)]">{current?.path || "Choose a file from the repository tree"}{current && current.content !== current.savedContent ? " · modified" : ""}</p></div>
          <div className="flex gap-2"><button className={BUTTON} onClick={() => current && updateContent(current.savedContent)} disabled={!current || current.content === current.savedContent}>Discard file changes</button><button className={BUTTON} onClick={() => { setReviewing(true); setError(""); }} disabled={!dirty || dirtyPaths.length > 20}>Review changes</button></div>
        </div>
        {reviewing && dirty ? <div className="max-h-[600px] flex-1 overflow-auto p-4">
          <h2 className="mb-3 font-semibold">Review edited-file diff</h2>
          <div className="space-y-4">{dirtyPaths.map(file => <div key={file.path} className="overflow-hidden rounded-xl border border-[var(--picd-page-border)]">
            <div className="border-b border-[var(--picd-page-border)] px-3 py-2 text-xs font-semibold">{file.path}</div>
            <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words p-3 font-mono text-[11px] leading-5">{fileDiff(file.savedContent, file.content).map((row, index) => <span key={`${index}-${row.type}`} className={`block ${row.type === "remove" ? "bg-[var(--picd-error)]/10 text-[var(--picd-error)]" : row.type === "add" ? "bg-[var(--picd-success)]/10 text-[var(--picd-success)]" : "text-[var(--picd-page-muted)]"}`}>{row.type === "remove" ? "− " : row.type === "add" ? "+ " : "  "}{row.text || " "}</span>)}</pre>
          </div>)}</div>
          {dirtyPaths.length > 20 && <p className="mt-3 text-sm text-[var(--picd-error)]">A pull request can include no more than 20 edited files.</p>}
          <div className="mt-5 grid gap-3 md:grid-cols-2"><label className="text-xs font-semibold">Commit / pull request title<input value={title} onChange={e => setTitle(e.target.value)} maxLength={200} required placeholder="Describe the change" className="mt-1 w-full rounded-lg border border-[var(--picd-page-border)] bg-[var(--picd-page-surface)] px-3 py-2 text-sm font-normal text-[var(--picd-page-text)] outline-none focus:border-[var(--picd-page-accent)]" /></label><label className="text-xs font-semibold">Description <span className="font-normal text-[var(--picd-page-muted)]">(optional)</span><textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} placeholder="Context for reviewers" className="mt-1 w-full rounded-lg border border-[var(--picd-page-border)] bg-[var(--picd-page-surface)] px-3 py-2 text-sm font-normal text-[var(--picd-page-text)] outline-none focus:border-[var(--picd-page-accent)]" /></label></div>
          <div className="mt-4 flex flex-wrap items-center gap-3"><button className="rounded-lg bg-[var(--picd-page-accent)] px-4 py-2 text-xs font-bold text-[var(--picd-page-surface)] disabled:opacity-40" onClick={createPullRequest} disabled={!title.trim() || !status?.base_branch || !dirtyPaths.length || dirtyPaths.length > 20 || submitting}>{submitting ? "Creating pull request…" : "Create pull request"}</button><button className={BUTTON} onClick={() => setReviewing(false)} disabled={submitting}>Back to editor</button><span className="text-[11px] text-[var(--picd-page-muted)]">Creates a branch and pull request. It does not write directly to the deploy branch.</span></div>
        </div> : <textarea spellCheck={false} value={current?.content ?? ""} onChange={e => updateContent(e.target.value)} disabled={!current || loading} placeholder="Open a supported repository file to edit it here…" className="min-h-[420px] flex-1 resize-y border-0 bg-[var(--picd-page-surface)] p-5 font-mono text-[12px] leading-6 text-[var(--picd-page-text)] outline-none placeholder:text-[var(--picd-page-muted)]" />}
        {!reviewing && <div className="border-t border-[var(--picd-page-border)] px-4 py-2 text-[10px] text-[var(--picd-page-muted)]">Edits remain in this browser until submitted as a pull request; they are not written to Render’s filesystem.</div>}
      </section>
    </div>
  </div></main></AppShell>;
}
