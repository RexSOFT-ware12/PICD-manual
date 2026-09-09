"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchAlerts, loadSettings, markAlertRead, markAllAlertsRead, type AlertItem } from "@/lib/api";
import AppShell from "@/components/AppShell";

const severityMeta: Record<AlertItem["severity"], { label: string; dot: string; badge: string }> = {
  critical: { label: "Critical", dot: "bg-brick", badge: "bg-brick/10 text-brick" },
  warning: { label: "Warning", dot: "bg-amber", badge: "bg-amber/10 text-amber" },
  success: { label: "Success", dot: "bg-sage", badge: "bg-sage/10 text-sage" },
  info: { label: "Info", dot: "bg-blueprint", badge: "bg-blueprint/10 text-blueprint" },
};

function Stat({ label, value, tone = "normal" }: { label: string; value: number; tone?: "normal" | "critical" | "success" }) {
  return <div className="rounded-2xl border border-line bg-white px-5 py-4 shadow-sm">
    <p className="text-[9px] font-bold uppercase tracking-[.18em] text-ink/35">{label}</p>
    <p className={`mt-2 font-display text-2xl font-semibold ${tone === "critical" ? "text-brick" : tone === "success" ? "text-sage" : "text-ink"}`}>{value}</p>
  </div>;
}

export default function NotificationsPage() {
  const [items, setItems] = useState<AlertItem[]>([]);
  const [filter, setFilter] = useState<"all" | "unread" | AlertItem["severity"]>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const load = useCallback(async () => {
    const settings = loadSettings();
    if (!settings.baseUrl) {
      setItems([]);
      setLoading(false);
      setError("Connect the dashboard to the backend in System settings to receive alerts.");
      return;
    }
    try {
      const result = await fetchAlerts(settings);
      setItems(result.items || []);
      setLastUpdated(new Date());
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load notifications.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const stats = useMemo(() => ({
    unread: items.filter(x => !x.read).length,
    critical: items.filter(x => x.severity === "critical" && !x.read).length,
    success: items.filter(x => x.severity === "success").length,
  }), [items]);

  const filtered = useMemo(() => items.filter(x => {
    if (filter === "unread") return !x.read;
    if (filter === "all") return true;
    return x.severity === filter;
  }), [items, filter]);

  const read = async (id: string) => {
    try {
      await markAlertRead(loadSettings(), id);
      setItems(v => v.map(x => x.id === id ? { ...x, read: true } : x));
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to update notification."); }
  };

  const readAll = async () => {
    if (!stats.unread) return;
    try {
      await markAllAlertsRead(loadSettings());
      setItems(v => v.map(x => ({ ...x, read: true })));
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to update notifications."); }
  };

  return <AppShell>
    <div className="h-full overflow-y-auto bg-paper">
      <div className="mx-auto min-h-full max-w-[1280px] px-8 py-7">
        <header className="flex items-end justify-between gap-8">
          <div>
            <p className="text-[9px] font-bold uppercase tracking-[.2em] text-blueprint/55">Monitor / Notifications</p>
            <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">Alert Center</h1>
            <p className="mt-1 text-xs text-ink/40">Every incoming scan, completion and failure in one operational inbox.</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => void load()} className="rounded-xl border border-line bg-white px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-ink/60 shadow-sm transition hover:bg-ink/[.03]">Refresh</button>
            <button onClick={() => void readAll()} disabled={!stats.unread} className="rounded-xl bg-blueprint px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-paper shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-30">Mark all read</button>
          </div>
        </header>

        {error && <div className="mt-5 rounded-2xl border border-amber/30 bg-amber/10 px-4 py-3 text-xs text-ink/65">{error}</div>}

        <div className="mt-6 grid grid-cols-3 gap-3">
          <Stat label="Unread alerts" value={stats.unread} />
          <Stat label="Unread critical" value={stats.critical} tone="critical" />
          <Stat label="Successful completions" value={stats.success} tone="success" />
        </div>

        <section className="mt-6 overflow-hidden rounded-2xl border border-line bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-line px-5 py-4">
            <div>
              <h2 className="font-display text-sm font-semibold">Notification stream</h2>
              <p className="mt-0.5 text-[10px] text-ink/35">{lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}` : "Waiting for alert data"}</p>
            </div>
            <div className="flex rounded-xl bg-ink/[.04] p-1">
              {(["all", "unread", "critical", "warning", "success", "info"] as const).map(x => <button key={x} onClick={() => setFilter(x)} className={`rounded-lg px-3 py-1.5 text-[9px] font-bold uppercase tracking-wider transition ${filter === x ? "bg-white text-blueprint shadow-sm" : "text-ink/35 hover:text-ink/60"}`}>{x}</button>)}
            </div>
          </div>

          {loading ? <div className="space-y-2 p-4">{Array.from({length:7}).map((_,i)=><div key={i} className="h-20 animate-pulse rounded-xl bg-ink/[.035]" />)}</div> : filtered.length === 0 ? <div className="px-5 py-20 text-center"><div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-sage/10 text-sage text-xl">✓</div><h3 className="mt-4 font-display text-base font-semibold">Nothing needs attention</h3><p className="mt-1 text-xs text-ink/35">There are no notifications matching this filter.</p></div> : <div className="divide-y divide-line">
            {filtered.map(a => {
              const meta = severityMeta[a.severity];
              return <div key={a.id} className={`flex items-start gap-4 px-5 py-4 transition hover:bg-ink/[.015] ${!a.read ? "bg-blueprint/[.018]" : ""}`}>
                <span className={`mt-2 h-2.5 w-2.5 shrink-0 rounded-full ${meta.dot} ${!a.read ? "ring-4 ring-ink/[.04]" : "opacity-40"}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className={`text-xs ${a.read ? "font-medium text-ink/60" : "font-bold text-ink"}`}>{a.title}</h3>
                    <span className={`rounded-md px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider ${meta.badge}`}>{meta.label}</span>
                    {!a.read && <span className="rounded-md bg-blueprint/10 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider text-blueprint">New</span>}
                  </div>
                  <p className="mt-1 text-[11px] leading-relaxed text-ink/50">{a.message}</p>
                  <div className="mt-2 flex gap-4 text-[9px] text-ink/30"><span>{new Date(a.at).toLocaleString()}</span><span>Source: {a.source}</span></div>
                </div>
                {!a.read && <button onClick={() => void read(a.id)} className="shrink-0 rounded-lg border border-line bg-white px-3 py-2 text-[9px] font-bold text-ink/50 hover:text-blueprint">Mark read</button>}
              </div>;
            })}
          </div>}
        </section>
      </div>
    </div>
  </AppShell>;
}
