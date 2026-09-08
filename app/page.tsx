"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  fetchScans,
  fetchStats,
  loadSettings,
  saveSettings,
  ApiError,
  type ScanStatus,
  type ScanSummary,
  type StatsResponse,
  type ConnectionSettings as Settings,
} from "@/lib/api";
import ConnectionSettingsPanel from "@/components/ConnectionSettings";
import Column from "@/components/Column";

const STATUS_ORDER: { key: ScanStatus; label: string }[] = [
  { key: "queued", label: "Queued" },
  { key: "processing", label: "Processing" },
  { key: "completed", label: "Completed" },
  { key: "failed", label: "Failed" },
];

const REFRESH_MS = 5000;

export default function Home() {
  const [settings, setSettings] = useState<Settings>({ baseUrl: "", apiKey: "" });
  const [ready, setReady] = useState(false);
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [scans, setScans] = useState<ScanSummary[]>([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const searchRef = useRef(search);
  searchRef.current = search;

  useEffect(() => {
    setSettings(loadSettings());
    setReady(true);
  }, []);

  const refresh = useCallback(async (s: Settings) => {
    if (!s.baseUrl) return;
    try {
      const [statsRes, scansRes] = await Promise.all([
        fetchStats(s),
        fetchScans(s, { limit: 150, q: searchRef.current || undefined }),
      ]);
      setStats(statsRes);
      setScans(scansRes.scans);
      setError(null);
      setLastUpdated(new Date());
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Something went wrong.");
    }
  }, []);

  useEffect(() => {
    if (!ready) return;
    refresh(settings);
    const id = setInterval(() => refresh(settings), REFRESH_MS);
    return () => clearInterval(id);
  }, [ready, settings, refresh]);

  // Re-run search against the live settings without waiting for the interval.
  useEffect(() => {
    if (!ready) return;
    const id = setTimeout(() => refresh(settings), 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const byStatus = (status: ScanStatus) =>
    scans.filter((s) => s.status === status);

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
            onSave={(s) => {
              saveSettings(s);
              setSettings(s);
            }}
          />
        </div>

        <div className="mb-6 rounded-lg border border-white/10 bg-white/5 p-4">
          <p className="text-[11px] uppercase tracking-wide text-paper/40">
            Queue depth
          </p>
          <p className="font-display text-3xl font-semibold">
            {stats?.queue_depth ?? "—"}
          </p>
          <p className="text-[11px] text-paper/40">jobs waiting on the worker</p>
        </div>

        <div className="flex flex-col gap-2">
          {STATUS_ORDER.map(({ key, label }) => (
            <div
              key={key}
              className="flex items-center justify-between rounded border border-white/5 bg-white/[0.03] px-3 py-2 text-sm"
            >
              <span className="text-paper/70">{label}</span>
              <span className="font-mono text-paper">
                {stats?.counts[key] ?? "—"}
              </span>
            </div>
          ))}
        </div>

        <div className="mt-auto pt-6 text-[11px] text-paper/30">
          {error ? (
            <p className="text-brick/80">{error}</p>
          ) : lastUpdated ? (
            <p>updated {lastUpdated.toLocaleTimeString()}</p>
          ) : (
            <p>connecting…</p>
          )}
        </div>
      </aside>

      {/* Main board */}
      <section className="flex flex-1 flex-col bg-paper px-6 py-6">
        <div className="mb-5 flex items-center justify-between">
          <h1 className="font-display text-xl font-semibold text-ink">
            Pipeline board
          </h1>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="search scan_id or user_id"
            className="w-64 rounded-full border border-line bg-white px-4 py-1.5 text-sm text-ink outline-none focus:border-blueprint"
          />
        </div>

        {!settings.baseUrl ? (
          <div className="flex flex-1 items-center justify-center">
            <div className="max-w-sm text-center">
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
          <div className="flex flex-1 gap-4 overflow-x-auto">
            {STATUS_ORDER.map(({ key, label }) => (
              <Column
                key={key}
                status={key}
                label={label}
                scans={byStatus(key)}
                count={stats?.counts[key] ?? byStatus(key).length}
              />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
