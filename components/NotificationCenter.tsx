"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchAlerts, loadSettings, markAlertRead, markAllAlertsRead, type AlertItem } from "@/lib/api";

import { loadNotificationSound, playNotificationSound } from "@/lib/notificationSound";

export default function NotificationCenter() {
  const [items, setItems] = useState<AlertItem[]>([]);
  const [open, setOpen] = useState(false);
  const [ringing, setRinging] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const initialized = useRef(false);
  const knownIds = useRef(new Set<string>());
  const [tabVisible, setTabVisible] = useState(true);
  const inFlight = useRef<AbortController | null>(null);

  const announce = useCallback((alerts: AlertItem[]) => {
    if (!initialized.current) {
      alerts.forEach(a => knownIds.current.add(a.id));
      initialized.current = true;
      return;
    }
    const fresh = alerts.filter(a => !knownIds.current.has(a.id));
    alerts.forEach(a => knownIds.current.add(a.id));
    if (!fresh.length) return;

    const newest = fresh[0];
    const kind = newest.severity === "critical" ? "failed" : newest.title.toLowerCase().includes("completed") ? "completed" : "incoming";
    playNotificationSound(kind, loadNotificationSound());
    setRinging(true);
    window.setTimeout(() => setRinging(false), 1200);
  }, []);

  const load = useCallback(async () => {
    const s = loadSettings();
    if (!s.baseUrl) return;
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;
    try {
      const next = (await fetchAlerts(s, 50)).items;
      if (controller.signal.aborted) return;
      setItems(next);
      announce(next);
    } catch {}
  }, [announce]);

  useEffect(() => {
    const onVisibility = () => setTabVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => { document.removeEventListener("visibilitychange", onVisibility); inFlight.current?.abort(); };
  }, []);

  useEffect(() => {
    if (!tabVisible) return;
    void load();
    const id = setInterval(() => void load(), 5000);
    return () => clearInterval(id);
  }, [load, tabVisible]);

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const unread = items.filter(x => !x.read).length;
  const read = async (id: string) => { try { await markAlertRead(loadSettings(), id); setItems(v => v.map(x => x.id === id ? {...x, read:true} : x)); } catch {} };
  const readAll = async () => { try { await markAllAlertsRead(loadSettings()); setItems(v => v.map(x => ({...x, read:true}))); } catch {} };

  return <div className="relative" ref={ref}>
    <button onClick={() => setOpen(v => !v)} aria-label="Notifications" className={`relative flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-paper/70 transition hover:bg-white/10 hover:text-paper ${ringing ? "notification-ring" : ""}`}>
      <span className="text-lg" aria-hidden="true">🔔</span>
      {unread > 0 && <span className="absolute right-1 top-1 flex min-h-4 min-w-4 items-center justify-center rounded-full bg-brick px-1 text-[9px] font-bold text-paper">{unread > 9 ? "9+" : unread}</span>}
    </button>
    {open && <div className="absolute left-0 top-12 z-50 w-[380px] overflow-hidden rounded-2xl border border-line bg-paper text-ink shadow-2xl">
      <div className="flex items-center justify-between border-b border-line px-4 py-3"><div><p className="font-display text-sm font-semibold">Notifications</p><p className="text-[10px] text-ink/35">Incoming scans, completions and failures</p></div><button onClick={readAll} disabled={!unread} className="text-[10px] font-semibold text-blueprint disabled:opacity-30">Mark all read</button></div>
      <div className="max-h-[420px] overflow-y-auto">{items.length===0 ? <div className="px-4 py-10 text-center text-xs text-ink/35">No alerts. Everything is quiet.</div> : items.slice(0,30).map(a => <button key={a.id} onClick={() => read(a.id)} className={`w-full border-b border-line px-4 py-3 text-left hover:bg-ink/[.03] ${a.read ? "opacity-60" : ""}`}><div className="flex items-start gap-3"><span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${a.severity === "critical" ? "bg-brick" : a.severity === "warning" ? "bg-amber" : a.severity === "success" ? "bg-sage" : "bg-blueprint"}`} /><div className="min-w-0"><div className="flex items-center justify-between gap-3"><b className="text-xs">{a.title}</b><span className="shrink-0 font-mono text-[9px] text-ink/30">{new Date(a.at).toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"})}</span></div><p className="mt-1 text-[11px] leading-relaxed text-ink/50">{a.message}</p></div></div></button>)}</div>
      <a href="/notifications" className="block border-t border-line px-4 py-3 text-center text-[10px] font-bold uppercase tracking-widest text-blueprint hover:bg-ink/[.03]">Open alert center →</a>
    </div>}
  </div>;
}
