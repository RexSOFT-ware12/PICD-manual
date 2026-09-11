"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  fetchScans,
  fetchStats,
  fetchHealth,
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
  type HealthResponse,
  type ConnectionSettings as Settings,
} from "@/lib/api";
import { useAnimatedNumber } from "@/lib/useAnimatedNumber";
import ConnectionSettingsPanel, {
  type ConnectionStatus,
} from "@/components/ConnectionSettings";
import Column from "@/components/Column";
import AppShell from "@/components/AppShell";
import ConfirmModal from "@/components/ConfirmModal";

type BoardStatus = ScanStatus | "delivered";
const STATUS_ORDER: { key: BoardStatus; label: string }[] = [
  { key: "queued", label: "Queued" },
  { key: "processing", label: "Processing" },
  { key: "completed", label: "Completed" },
  { key: "delivered", label: "Delivered" },
  { key: "failed", label: "Failed" },
];

const REFRESH_MS = 7500;
const BASE_LIMIT = 50;
const LOAD_MORE_STEP = 50;
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

function DashboardSkeleton() {
  return (
    <div className="contents">
      <div className="mb-3 grid grid-cols-6 gap-2">
        <div className="col-span-2 h-[78px] animate-pulse rounded-xl border border-line bg-white" />
        {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-[78px] animate-pulse rounded-xl border border-line bg-white" />)}
      </div>
      <div className="flex min-h-0 flex-1 gap-4 overflow-hidden">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="min-h-20 rounded-xl bg-ink/[0.035] p-2">
            <div className="mb-2 h-7 w-28 animate-pulse rounded-lg bg-ink/10" />
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((__, j) => <div key={j} className="h-24 animate-pulse rounded-xl border border-line bg-white" />)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
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
  const [health, setHealth] = useState<HealthResponse | null>(null);
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
  const [confirmDelete, setConfirmDelete] = useState<{scanId:string}|null>(null);

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
      const [statsRes, scansRes, healthRes] = await Promise.all([
        fetchStats(s, controller.signal),
        fetchScans(
          s,
          { limit: limitRef.current, q: searchRef.current || undefined, ...dateRange() },
          controller.signal
        ),
        fetchHealth(s),
      ]);

      // A newer request may have started (and even resolved) while this
      // one was in flight — if so, drop this result on the floor.
      if (requestId !== requestIdRef.current) return;

      setStats(statsRes);
      setHealth(healthRes);
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
    setConfirmDelete({scanId});
  };

  const confirmDeleteScan = async () => {
    if (!confirmDelete) return;
    const scanId = confirmDelete.scanId;
    setConfirmDelete(null);
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

  const byBoardStatus = (status: BoardStatus) => scans.filter((s) => {
    if (showOnlyActive && s.status !== "queued" && s.status !== "processing") return false;
    if (status === "delivered") return s.status === "completed" && s.delivery_status === "delivered";
    if (status === "completed") return s.status === "completed" && s.delivery_status !== "delivered";
    return s.status === status;
  });

  const isSearchActive = search.trim().length > 0;
  const isStale = consecutiveFailures >= STALE_AFTER_FAILURES || authBlocked;

  const initialLoading = !!settings.baseUrl && stats === null && scans.length === 0 && !error;

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
    <AppShell>
      <section className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-paper px-4 py-5 sm:px-6 sm:py-6">
        <div className="mb-3 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <h1 className="font-display text-xl font-semibold text-ink">Pipeline board</h1>
              <span className="hidden rounded-full bg-sage/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-sage sm:inline-flex">manual control</span>
            </div>
            <p className="mt-1 text-[11px] text-ink/35">Desktop pipeline: Queue → Processing → Completed → Delivered. Failed runs can be returned to Queue. Delivered results are locked.</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
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

        {settings.baseUrl && !initialLoading && (
          <div className="mb-3 grid grid-cols-6 gap-2">
            <div className="col-span-2 rounded-xl border border-line bg-white px-4 py-3 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div><p className="text-[9px] font-bold uppercase tracking-[.16em] text-ink/30">System health</p><p className="mt-1 font-display text-lg font-semibold">{health?.status === "maintenance" ? "Maintenance" : health?.status === "ok" ? "Operational" : "Checking…"}</p></div>
                <span className={`h-3 w-3 rounded-full ${health?.status === "ok" ? "bg-sage shadow-[0_0_0_5px_rgba(74,137,96,.10)]" : health?.status === "maintenance" ? "bg-amber" : "bg-brick"}`} />
              </div>
              <p className="mt-1 text-[10px] text-ink/35">API · Mongo · worker runtime</p>
            </div>
            <div className="rounded-xl border border-line bg-white px-4 py-3 shadow-sm"><p className="text-[9px] font-bold uppercase tracking-[.16em] text-ink/30">Queue</p><p className="mt-1 font-display text-lg font-semibold tabular-nums">{stats?.queue_depth ?? "—"}</p><p className="text-[10px] text-ink/35">waiting for release</p></div>
            <div className="rounded-xl border border-line bg-white px-4 py-3 shadow-sm"><p className="text-[9px] font-bold uppercase tracking-[.16em] text-ink/30">Completed today</p><p className="mt-1 font-display text-lg font-semibold tabular-nums">{stats?.completed_today ?? "—"}</p><p className="text-[10px] text-ink/35">successful runs</p></div>
            <div className="rounded-xl border border-line bg-white px-4 py-3 shadow-sm"><p className="text-[9px] font-bold uppercase tracking-[.16em] text-ink/30">Avg processing</p><p className="mt-1 font-display text-lg font-semibold tabular-nums">{stats?.avg_processing_seconds != null ? `${Math.floor(stats.avg_processing_seconds / 60)}m ${Math.round(stats.avg_processing_seconds % 60)}s` : "—"}</p><p className="text-[10px] text-ink/35">last 500 runs</p></div>
            <div className="rounded-xl border border-line bg-white px-4 py-3 shadow-sm"><p className="text-[9px] font-bold uppercase tracking-[.16em] text-ink/30">Success rate</p><p className="mt-1 font-display text-lg font-semibold tabular-nums">{stats && stats.counts.completed + stats.counts.failed > 0 ? `${((stats.counts.completed / (stats.counts.completed + stats.counts.failed)) * 100).toFixed(1)}%` : "—"}</p><p className="text-[10px] text-ink/35">completed vs failed</p></div>
          </div>
        )}

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

        {initialLoading ? (
          <DashboardSkeleton />
        ) : !settings.baseUrl ? (
          <div className="flex flex-1 items-center justify-center">
            <div className="animate-fade-in-up max-w-sm text-center">
              <p className="font-display text-lg text-ink">
                No backend connected
              </p>
              <p className="mt-2 text-sm text-ink/50">
                Open “connection” in the left rail and point this at your
                cloud API URL to start monitoring the queue.
              </p>
            </div>
          </div>
        ) : (
          <div
            className={`flex min-h-0 flex-1 gap-4 overflow-x-auto overflow-y-hidden pb-2 transition-opacity duration-500 ${
              isStale ? "opacity-60" : ""
            }`}
          >
            {STATUS_ORDER.map(({ key, label }) => (
              <div key={key} className="min-w-[300px] flex-1">
                <Column
                key={`${key}-column`}
                status={key === "delivered" ? "completed" : key}
                label={label}
                scans={byBoardStatus(key)}
                count={
                  isSearchActive
                    ? byBoardStatus(key).length
                    : key === "delivered"
                    ? (stats?.delivered ?? byBoardStatus(key).length)
                    : stats?.counts[key] ?? byBoardStatus(key).length
                }
                boardStatus={key === "delivered" ? "delivered" : undefined}
                onRetried={() => refresh(settings)}
                onDropScan={handleDropScan}
                onDropBefore={handleReorder}
                deleteMode={deleteMode}
                deletingScan={deletingScan}
                onDelete={handleDelete}
                compact={compact}
                />
              </div>
            ))}
          </div>
        )}
      </section>

      <ConfirmModal open={!!confirmDelete} tone="danger" title="Delete this scan?" message={confirmDelete ? `Scan ${confirmDelete.scanId.slice(0, 8)}… will be permanently removed. Completed scans are protected.` : ""} confirmLabel="Delete scan" busy={!!deletingScan} onConfirm={confirmDeleteScan} onCancel={() => !deletingScan && setConfirmDelete(null)} />
    </AppShell>
  );
}
