"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  fetchScans,
  fetchStats,
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
          { limit: limitRef.current, q: searchRef.current || undefined },
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
  }, []);

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
  }, [search]);

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

  const byStatus = (status: ScanStatus) =>
    scans.filter((s) => s.status === status);

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
    <main className="flex min-h-screen">
      {/* Left rail */}
      <aside className="flex w-64 shrink-0 flex-col bg-blueprint px-5 py-6 text-paper">
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

        <div className="mb-6 rounded-lg border border-white/10 bg-white/5 p-4">
          <p className="text-[11px] uppercase tracking-wide text-paper/40">
            Queue depth
          </p>
          <p className="font-display text-3xl font-semibold">
            <AnimatedStat value={stats?.queue_depth ?? null} />
          </p>
          <p className="text-[11px] text-paper/40">jobs waiting on the worker</p>
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
      <section className="flex min-w-0 flex-1 flex-col bg-paper px-6 py-6">
        <div className="mb-2 flex items-center justify-between">
          <h1 className="font-display text-xl font-semibold text-ink">
            Pipeline board
          </h1>
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
            className={`grid flex-1 grid-cols-1 gap-4 overflow-y-auto transition-opacity duration-500 sm:grid-cols-2 xl:grid-cols-4 ${
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
              />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
