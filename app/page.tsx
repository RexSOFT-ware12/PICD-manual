"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  fetchScans,
  fetchStats,
  triggerNextScan,
  processSelectedScan,
  moveScanToQueue,
  reorderScan,
  deleteScan,
  loadSettings,
  saveSettings,
  ApiError,
  isAbortError,
  type ScanStatus,
  type ScanSummary,
  type StatsResponse,
  type ConnectionSettings as Settings,
} from "@/lib/api";
import { useAnimatedNumber } from "@/lib/useAnimatedNumber";
import ConnectionSettingsPanel, {
  type ConnectionStatus,
} from "@/components/ConnectionSettings";
import Column from "@/components/Column";

const STATUS_ORDER: { key: ScanStatus; label: string }[] = [
  { key: "queued", label: "Queued" },
  { key: "processing", label: "Processing" },
  { key: "completed", label: "Completed" },
  { key: "failed", label: "Failed" },
];

const REFRESH_MS = 5000;
const BASE_LIMIT = 150;
const LOAD_MORE_STEP = 150;
// After this many back-to-back failures, treat the board as stale rather
// than just logging a one-line error at the bottom of the rail.
const STALE_AFTER_FAILURES = 2;

/** A stat number that counts up/down instead of snapping, with a skeleton
 * placeholder while its value isn't known yet. */
function AnimatedStat({ value }: { value: number | null }) {
  const display = useAnimatedNumber(value);
  if (value === null) {
    return (
      <span className="inline-block h-[1em] w-6 animate-pulse rounded bg-white/10 align-middle" />
    );
  }
  return <span className="tabular-nums">{display}</span>;
}

function formatAgo(last: Date | null, now: number): string {
  if (!last) return "";
  const diffSec = Math.max(0, Math.round((now - last.getTime()) / 1000));
  if (diffSec < 5) return "just now";
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.round(diffSec / 60);
  return `${diffMin}m ago`;
}

export default function Home() {
  const [settings, setSettings] = useState<Settings>({ baseUrl: "", apiKey: "" });
  const [ready, setReady] = useState(false);
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [scans, setScans] = useState<ScanSummary[]>([]);
  const [scansTotal, setScansTotal] = useState<number | null>(null);
  const [limit, setLimit] = useState(BASE_LIMIT);
  const [loadingMore, setLoadingMore] = useState(false);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [consecutiveFailures, setConsecutiveFailures] = useState(0);
  // True once we've hit a 401 — polling stops until the user re-saves
  // settings, since retrying the same bad key every 5s can't succeed.
  const [authBlocked, setAuthBlocked] = useState(false);
  const [tabVisible, setTabVisible] = useState(true);
  const [triggering, setTriggering] = useState(false);
  const [triggerMessage, setTriggerMessage] = useState<string | null>(null);
  const [datePreset, setDatePreset] = useState<"all" | "today" | "week" | "month" | "custom">("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [movingScan, setMovingScan] = useState<string | null>(null);
  const [deleteMode, setDeleteMode] = useState(false);
  const [compact, setCompact] = useState(false);
  const [showOnlyActive, setShowOnlyActive] = useState(false);
  const [deletingScan, setDeletingScan] = useState<string | null>(null);

  const searchRef = useRef(search);
  searchRef.current = search;
  const limitRef = useRef(limit);
  limitRef.current = limit;

  // Guards against overlapping/out-of-order responses: every refresh call
  // gets an id, and only the most recent in-flight request is allowed to
  // land. The AbortController also actually cancels the stale network
  // request instead of just ignoring its response.
  const requestIdRef = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setSettings(loadSettings());
    setReady(true);
  }, []);

  useEffect(() => {
    const onVisibility = () => setTabVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  // Ticks once a second so "updated Xs ago" stays live instead of only
  // updating whenever some other state change happens to re-render.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const dateRange = useCallback((): { from?: string; to?: string } => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const isoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    if (datePreset === "custom") return { from: fromDate || undefined, to: toDate || undefined };
    if (datePreset === "today") { const d = isoDate(now); return { from: d, to: d }; }
    if (datePreset === "week") { const d = new Date(now); const day = d.getDay(); d.setDate(d.getDate() - (day === 0 ? 6 : day - 1)); return { from: isoDate(d), to: isoDate(now) }; }
    if (datePreset === "month") { const d = new Date(now.getFullYear(), now.getMonth(), 1); return { from: isoDate(d), to: isoDate(now) }; }
    return {};
  }, [datePreset, fromDate, toDate]);

  const refresh = useCallback(async (s: Settings) => {
    if (!s.baseUrl) return;

    // Cancel whatever's still in flight — the response we're about to
    // fetch is always more current than anything already pending.
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    const requestId = ++requestIdRef.current;

    try {
      const [statsRes, scansRes] = await Promise.all([
        fetchStats(s, controller.signal),
        fetchScans(
          s,
          { limit: limitRef.current, q: searchRef.current || undefined, ...dateRange() },
          controller.signal
        ),
      ]);

      // A newer request may have started (and even resolved) while this
      // one was in flight — if so, drop this result on the floor.
      if (requestId !== requestIdRef.current) return;

      setStats(statsRes);
      setScans(scansRes.scans);
      setScansTotal(scansRes.total);
      setError(null);
      setConsecutiveFailures(0);
      setAuthBlocked(false);
      setLastUpdated(new Date());
    } catch (e) {
      if (isAbortError(e)) return; // superseded by a newer request, not a real failure
      if (requestId !== requestIdRef.current) return;

      if (e instanceof ApiError && e.status === 401) {
        setError(e.message);
        setAuthBlocked(true);
        return;
      }
      setError(e instanceof ApiError ? e.message : "Something went wrong.");
      setConsecutiveFailures((n) => n + 1);
    }
  }, [dateRange]);

  // Main poll loop: only runs while the tab is visible and we're not
  // locked out on a bad API key. Pausing on visibilitychange avoids
  // burning API calls/tunnel bandwidth on a backgrounded tab.
  useEffect(() => {
    if (!ready || authBlocked || !tabVisible) return;
    refresh(settings);
    const id = setInterval(() => refresh(settings), REFRESH_MS);
    return () => clearInterval(id);
  }, [ready, settings, refresh, authBlocked, tabVisible]);

  // Refresh immediately when the tab regains focus instead of waiting for
  // the next interval tick.
  useEffect(() => {
    if (!ready || authBlocked || !tabVisible) return;
    refresh(settings);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabVisible]);

  // Re-run search against the live settings without waiting for the interval.
  useEffect(() => {
    if (!ready || authBlocked) return;
    setLimit(BASE_LIMIT);
    const id = setTimeout(() => refresh(settings), 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, datePreset, fromDate, toDate]);

  const handleSaveSettings = (s: Settings) => {
    saveSettings(s);
    setSettings(s);
    setError(null);
    setConsecutiveFailures(0);
    setAuthBlocked(false);
    setLimit(BASE_LIMIT);
  };

  const handleLoadMore = async () => {
    const next = limit + LOAD_MORE_STEP;
    setLimit(next);
    limitRef.current = next;
    setLoadingMore(true);
    await refresh(settings);
    setLoadingMore(false);
  };

  const handleTriggerNext = async () => {
    if (triggering || stats?.processing || (stats?.queue_depth ?? 0) === 0) return;
    setTriggering(true);
    setTriggerMessage(null);
    try {
      const result = await triggerNextScan(settings);
      setTriggerMessage(`Released ${result.scan_id.slice(0, 8)}… for processing`);
      await refresh(settings);
    } catch (e) {
      setTriggerMessage(e instanceof ApiError ? e.message : "Could not release the next scan.");
    } finally {
      setTriggering(false);
    }
  };

  const handleDropScan = async (scanId: string, target: ScanStatus) => {
    if (movingScan) return;
    const scan = scans.find((item) => item.scan_id === scanId);
    if (!scan) return;

    if (target === "processing" && scan.status === "queued") {
      if (stats?.processing) {
        setTriggerMessage("A scan is already processing. Wait for it to finish before releasing another.");
        return;
      }
      setMovingScan(scanId);
      setTriggerMessage(null);
      try {
        const result = await processSelectedScan(settings, scanId);
        setTriggerMessage(result.message ?? `Released ${scanId.slice(0, 8)}… for processing`);
        await refresh(settings);
      } catch (e) {
        setTriggerMessage(e instanceof ApiError ? e.message : "Could not release the selected scan.");
      } finally { setMovingScan(null); }
      return;
    }

    if (target !== "queued" || movingScan) return;
    if (scan.status !== "failed" && scan.status !== "processing") return;
    setMovingScan(scanId);
    setTriggerMessage(null);
    try {
      const result = await moveScanToQueue(settings, scanId);
      setTriggerMessage(result.message ?? `Moved ${scanId.slice(0, 8)}… back to the manual queue`);
      await refresh(settings);
    } catch (e) {
      setTriggerMessage(e instanceof ApiError ? e.message : "Could not move the scan back to the queue.");
    } finally { setMovingScan(null); }
  };

  const handleReorder = async (scanId: string, beforeScanId: string) => {
    const source = scans.find((s) => s.scan_id === scanId);
    if (!source || source.status !== "queued" || scanId === beforeScanId) return;
    setMovingScan(scanId);
    try {
      await reorderScan(settings, scanId, beforeScanId);
      setScans((current) => {
        const sourceItem = current.find((s) => s.scan_id === scanId);
        if (!sourceItem) return current;
        const rest = current.filter((s) => s.scan_id !== scanId);
        const idx = rest.findIndex((s) => s.scan_id === beforeScanId);
        if (idx < 0) return current;
        rest.splice(idx, 0, sourceItem);
        return rest;
      });
    } catch (e) {
      setTriggerMessage(e instanceof ApiError ? e.message : "Could not arrange the queue.");
    } finally { setMovingScan(null); }
  };

  const handleDelete = async (scanId: string) => {
    const scan = scans.find((s) => s.scan_id === scanId);
    if (!scan || scan.status === "completed" || deletingScan) return;
    if (!window.confirm(`Delete scan ${scanId.slice(0, 8)}…? This cannot be undone.`)) return;
    setDeletingScan(scanId);
    setTriggerMessage(null);
    try {
      const result = await deleteScan(settings, scanId);
      if (result.pending) setTriggerMessage(result.message ?? "Processing scan will be deleted after the active run finishes.");
      else setTriggerMessage(`Deleted ${scanId.slice(0, 8)}…`);
      await refresh(settings);
    } catch (e) {
      setTriggerMessage(e instanceof ApiError ? e.message : "Could not delete the scan.");
    } finally { setDeletingScan(null); }
  };

  const byStatus = (status: ScanStatus) =>
    scans.filter((s) => s.status === status && (!showOnlyActive || (s.status === "queued" || s.status === "processing")));

  const isSearchActive = search.trim().length > 0;
  const isStale = consecutiveFailures >= STALE_AFTER_FAILURES || authBlocked;

  const connectionStatus: ConnectionStatus = !settings.baseUrl
    ? "disconnected"
    : authBlocked
    ? "error"
    : isStale
    ? "error"
    : error
    ? "warn"
    : lastUpdated
    ? "ok"
    : "connecting";

  return (
    <>
      <div className="mobile-unavailable" role="status" aria-live="polite">
        <div className="mobile-unavailable-card">
          <p className="mobile-unavailable-kicker">PICD Scan Queue Monitor</p>
          <h1>Desktop dashboard only</h1>
          <p>This monitoring dashboard is designed for desktop screens and is not available on mobile devices.</p>
        </div>
      </div>
      <main className="desktop-dashboard h-screen min-h-0 overflow-hidden animate-app-enter bg-paper flex">
      {/* Left rail */}
      <aside className="flex h-full w-full shrink-0 flex-col overflow-hidden bg-blueprint px-5 py-6 text-paper shadow-2xl shadow-blueprint/10 sm:w-64">
        <div className="mb-8">
          <p className="font-display text-lg font-semibold leading-tight">
            Scan Queue
            <br />
            Monitor
          </p>
          <p className="mt-1 text-xs text-paper/50">PICD measurement pipeline</p>
        </div>

        <div className="mb-6">
          <ConnectionSettingsPanel
            settings={settings}
            status={connectionStatus}
            onSave={handleSaveSettings}
          />
        </div>

        <div className="mb-6 rounded-xl border border-white/10 bg-white/5 p-4 shadow-lg shadow-black/10 backdrop-blur-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-wide text-paper/40">
                Manual queue
              </p>
              <p className="mt-1 font-display text-3xl font-semibold">
                <AnimatedStat value={stats?.queue_depth ?? null} />
              </p>
              <p className="text-[11px] text-paper/40">
                incoming scans waiting for approval
              </p>
            </div>
            <span className={`mt-1 h-2.5 w-2.5 rounded-full ${stats?.processing ? "animate-pulse bg-amber" : "bg-sage"}`} />
          </div>
          <button
            onClick={handleTriggerNext}
            disabled={triggering || stats?.processing || (stats?.queue_depth ?? 0) === 0}
            className="mt-4 w-full rounded-lg bg-paper px-3 py-2.5 text-xs font-semibold text-blueprint shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-35"
          >
            {triggering ? "Releasing…" : stats?.processing ? "Processing current scan…" : "Process next scan"}
          </button>
          <p className="mt-2 text-center text-[10px] text-paper/30">
            Nothing processes automatically.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          {STATUS_ORDER.map(({ key, label }) => (
            <div
              key={key}
              className="flex items-center justify-between rounded border border-white/5 bg-white/[0.03] px-3 py-2 text-sm transition-colors"
            >
              <span className="text-paper/70">{label}</span>
              <span className="font-mono text-paper">
                <AnimatedStat
                  value={isSearchActive ? byStatus(key).length : stats?.counts[key] ?? null}
                />
              </span>
            </div>
          ))}
        </div>

        <div className="mt-auto pt-6 text-[11px] text-paper/30">
          {authBlocked ? (
            <p className="animate-fade-in text-brick/80">
              {error} Polling stopped — re-save settings once it&apos;s fixed.
            </p>
          ) : error ? (
            <p className="animate-fade-in text-brick/80">{error}</p>
          ) : lastUpdated ? (
            <p
              title={lastUpdated.toLocaleTimeString()}
              className="flex items-center gap-1.5"
            >
              <span className="h-1 w-1 rounded-full bg-sage animate-[pulse_2.5s_ease-in-out_infinite]" />
              updated {formatAgo(lastUpdated, now)}
            </p>
          ) : (
            <p>connecting…</p>
          )}
        </div>
      </aside>

      {/* Main board */}
      <section className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-paper px-4 py-5 sm:px-6 sm:py-6">
        <div className="mb-3 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <h1 className="font-display text-xl font-semibold text-ink">Pipeline board</h1>
              <span className="hidden rounded-full bg-sage/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-sage sm:inline-flex">manual control</span>
            </div>
            <p className="mt-1 text-[11px] text-ink/35">Drag a queued card to Processing to run that scan. Drag failed/processing cards back to Queue. Completed scans are locked.</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <a href="/analytics" className="hidden rounded-full border border-line bg-white px-3 py-1.5 text-[11px] font-medium text-ink/60 transition hover:-translate-y-0.5 hover:border-blueprint hover:text-blueprint sm:inline-flex">Analytics ↗</a>
            <button onClick={() => setCompact(v => !v)} className="hidden rounded-full border border-line bg-white px-3 py-1.5 text-[11px] text-ink/55 transition hover:border-blueprint hover:text-blueprint sm:inline-flex">{compact ? "Comfortable" : "Compact"}</button>
            <div className="relative">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="search scan_id or user_id"
              className="w-64 rounded-full border border-line bg-white px-4 py-1.5 pr-8 text-sm text-ink outline-none transition-shadow focus:border-blueprint focus:ring-2 focus:ring-blueprint/20"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                aria-label="Clear search"
                className="animate-fade-in absolute right-2.5 top-1/2 -translate-y-1/2 text-sm leading-none text-ink/30 transition hover:text-ink/60"
              >
                ×
              </button>
            )}
            </div>
          </div>
        </div>

        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-white/60 p-2">
          <span className="mr-1 text-[10px] font-semibold uppercase tracking-[.14em] text-ink/35">Date</span>
          {[['all','All'],['today','Today'],['week','This week'],['month','This month']].map(([key,label]) => (
            <button key={key} onClick={() => setDatePreset(key as typeof datePreset)} className={`rounded-full px-2.5 py-1 text-[11px] transition ${datePreset === key ? 'bg-blueprint text-paper shadow-sm' : 'bg-ink/5 text-ink/55 hover:bg-ink/10'}`}>{label}</button>
          ))}
          <button onClick={() => setDatePreset('custom')} className={`rounded-full px-2.5 py-1 text-[11px] transition ${datePreset === 'custom' ? 'bg-blueprint text-paper' : 'bg-ink/5 text-ink/55 hover:bg-ink/10'}`}>Custom</button>
          <button onClick={() => setShowOnlyActive(v => !v)} className={`ml-auto rounded-full px-2.5 py-1 text-[11px] transition ${showOnlyActive ? 'bg-amber text-ink shadow-sm' : 'bg-ink/5 text-ink/55 hover:bg-ink/10'}`}>{showOnlyActive ? 'Active only' : 'All statuses'}</button>
          {datePreset === 'custom' && <>
            <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="rounded-full border border-line bg-white px-2 py-1 text-[11px]" />
            <span className="text-[10px] text-ink/30">to</span>
            <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="rounded-full border border-line bg-white px-2 py-1 text-[11px]" />
          </>}
        </div>

        {triggerMessage && (
          <div className={`mb-3 animate-fade-in-up rounded-lg border px-3 py-2 text-xs ${
            triggerMessage.startsWith("Released")
              ? "border-sage/20 bg-sage/10 text-sage"
              : "border-brick/20 bg-brick/10 text-brick"
          }`}>
            {triggerMessage}
          </div>
        )}

        {settings.baseUrl && (
          <div className="mb-3 flex min-h-[22px] items-center gap-3 text-[11px] text-ink/40">
            {isStale && (
              <span className="animate-fade-in rounded-full bg-brick/10 px-2 py-0.5 font-medium text-brick">
                data may be stale
              </span>
            )}
            {scansTotal !== null && (
              <span>
                showing {Math.min(scans.length, limit)} of {scansTotal}
                {scansTotal > scans.length && (
                  <button
                    onClick={handleLoadMore}
                    disabled={loadingMore}
                    className="ml-2 inline-flex items-center gap-1.5 rounded-full border border-line px-2 py-0.5 text-ink/60 transition hover:border-blueprint hover:text-blueprint disabled:cursor-wait disabled:opacity-60"
                  >
                    {loadingMore && (
                      <span className="h-2.5 w-2.5 animate-spin rounded-full border-[1.5px] border-ink/20 border-t-blueprint" />
                    )}
                    load more
                  </button>
                )}
              </span>
            )}
          </div>
        )}

        {!settings.baseUrl ? (
          <div className="flex flex-1 items-center justify-center">
            <div className="animate-fade-in-up max-w-sm text-center">
              <p className="font-display text-lg text-ink">
                No backend connected
              </p>
              <p className="mt-2 text-sm text-ink/50">
                Open “connection” in the left rail and point this at your
                tunnel URL to start monitoring the queue.
              </p>
            </div>
          </div>
        ) : (
          <div
            className={`grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-hidden transition-opacity duration-500 sm:grid-cols-2 xl:grid-cols-4 ${
              isStale ? "opacity-60" : ""
            }`}
          >
            {STATUS_ORDER.map(({ key, label }) => (
              <Column
                key={key}
                status={key}
                label={label}
                scans={byStatus(key)}
                count={
                  isSearchActive
                    ? byStatus(key).length
                    : stats?.counts[key] ?? byStatus(key).length
                }
                onRetried={() => refresh(settings)}
                onDropScan={handleDropScan}
                onDropBefore={handleReorder}
                deleteMode={deleteMode}
                deletingScan={deletingScan}
                onDelete={handleDelete}
                compact={compact}
              />
            ))}
          </div>
        )}
      </section>

      <div
        className="fixed bottom-5 right-5 z-40"
        onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add("scale-110"); }}
        onDragLeave={(e) => e.currentTarget.classList.remove("scale-110")}
        onDrop={(e) => {
          e.preventDefault(); e.currentTarget.classList.remove("scale-110");
          const scanId = e.dataTransfer.getData("text/scan-id");
          if (scanId) handleDelete(scanId);
        }}
      >
        <button
          type="button"
          onClick={() => setDeleteMode((v) => !v)}
          aria-label={deleteMode ? "Exit delete mode" : "Delete scans"}
          title={deleteMode ? "Click a non-completed card to delete" : "Delete scans"}
          className={`flex h-12 w-12 items-center justify-center rounded-full border shadow-lg backdrop-blur transition-all duration-200 hover:-translate-y-1 hover:shadow-xl ${deleteMode ? "border-brick/30 bg-brick text-paper" : "border-line bg-white/90 text-ink/60 hover:text-brick"}`}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="m19 6-1 15H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>
        </button>
        {deleteMode && <p className="absolute bottom-14 right-0 whitespace-nowrap rounded-full border border-brick/20 bg-white px-3 py-1.5 text-[10px] font-medium text-brick shadow-md">click or drag a card here</p>}
      </div>
      </main>
    </>
  );
}
