"use client";

import { useCallback, useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { ApiError, fetchAnalytics, loadSettings, type AnalyticsBucket, type AnalyticsResponse, type ScanStatus } from "@/lib/api";

const statuses: ScanStatus[] = ["queued", "processing", "completed", "failed"];

function rangeForPreset(preset: string) {
  const now = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  if (preset === "today") return { from: iso(now), to: iso(now) };
  if (preset === "week") {
    const d = new Date(now); const day = d.getDay(); d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
    return { from: iso(d), to: iso(now) };
  }
  if (preset === "month") return { from: iso(new Date(now.getFullYear(), now.getMonth(), 1)), to: iso(now) };
  if (preset === "30d") { const d = new Date(now); d.setDate(d.getDate() - 29); return { from: iso(d), to: iso(now) }; }
  return {};
}

function maxValue(rows: AnalyticsBucket[]) { return Math.max(1, ...rows.map(r => r.total)); }

function BarChart({ rows, title }: { rows: AnalyticsBucket[]; title: string }) {
  const max = maxValue(rows);
  const shown = rows.slice(-14);
  return <div className="rounded-2xl border border-line bg-white p-5 shadow-sm">
    <div className="mb-5 flex items-center justify-between"><h2 className="font-display font-semibold">{title}</h2><span className="text-[10px] uppercase tracking-widest text-ink/35">incoming scans</span></div>
    <div className="rounded-xl bg-white p-2"><div className="flex h-56 items-end gap-1.5 overflow-hidden border-b border-line px-1">
      {shown.map(r => <div key={r.key} className="group flex min-w-5 flex-1 flex-col items-center justify-end gap-1" title={`${r.label}: ${r.total}`}><span className="text-[9px] text-ink/40 opacity-0 transition group-hover:opacity-100">{r.total}</span><div className="w-full rounded-t bg-blueprint/80 transition-all duration-500 group-hover:bg-blueprint" style={{ height: `${Math.max(4, (r.total / max) * 185)}px` }} /></div>)}
    </div></div>
    <div className="mt-2 flex gap-1.5 overflow-hidden">{shown.map(r => <span key={r.key} className="min-w-5 flex-1 truncate text-center font-mono text-[8px] text-ink/35">{r.label.slice(-5)}</span>)}</div>
  </div>;
}

function LineChart({ rows }: { rows: AnalyticsBucket[] }) {
  const shown = rows.slice(-12); const max = maxValue(shown); const w = 720; const h = 230; const pad = 24;
  const points = shown.map((r, i) => { const x = pad + (i * (w - pad * 2)) / Math.max(1, shown.length - 1); const y = h - pad - (r.total / max) * (h - pad * 2); return `${x},${y}`; }).join(" ");
  return <div className="rounded-2xl border border-line bg-white p-5 shadow-sm"><div className="mb-5 flex items-center justify-between"><h2 className="font-display font-semibold">Weekly trend</h2><span className="text-[10px] uppercase tracking-widest text-ink/35">week over week</span></div><div className="rounded-xl bg-white p-2"><svg viewBox={`0 0 ${w} ${h}`} className="h-56 w-full overflow-visible bg-white"><polyline fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-blueprint" points={points} />{shown.map((r,i)=>{const x=pad+(i*(w-pad*2))/Math.max(1,shown.length-1);const y=h-pad-(r.total/max)*(h-pad*2);return <g key={r.key}><circle cx={x} cy={y} r="4" className="fill-paper stroke-blueprint" strokeWidth="3"/><text x={x} y={h-5} textAnchor="middle" className="fill-ink/35 text-[10px]">{r.label}</text></g>})}</svg></div></div>;
}

function Donut({ data }: { data: Record<ScanStatus, number> }) {
  const total = Math.max(1, statuses.reduce((a,s)=>a+(data[s]||0),0));
  const segments = statuses.map((s,i)=>({s,v:data[s]||0,start:statuses.slice(0,i).reduce((a,k)=>a+(data[k]||0),0)}));
  const r=62,c=2*Math.PI*r;
  return <div className="rounded-2xl border border-line bg-white p-5 shadow-sm"><div className="mb-3"><h2 className="font-display font-semibold">Status mix</h2><p className="text-xs text-ink/35">What happened to incoming scans</p></div><div className="flex items-center gap-6"><div className="relative h-40 w-40 shrink-0"><svg viewBox="0 0 160 160" className="h-full w-full -rotate-90"><circle cx="80" cy="80" r={r} fill="none" stroke="currentColor" strokeWidth="20" className="text-ink/5"/>{segments.map(({s,v,start})=>{const dash=(v/total)*c;return <circle key={s} cx="80" cy="80" r={r} fill="none" strokeWidth="20" strokeDasharray={`${dash} ${c-dash}`} strokeDashoffset={-(start/total)*c} className={s==="completed"?"text-sage":s==="failed"?"text-brick":s==="processing"?"text-amber":"text-slate"} stroke="currentColor"/>})}</svg><div className="absolute inset-0 flex flex-col items-center justify-center"><b className="font-display text-2xl">{total}</b><span className="text-[9px] uppercase tracking-widest text-ink/35">scans</span></div></div><div className="space-y-2 text-xs">{statuses.map(s=><div key={s} className="flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${s==="completed"?"bg-sage":s==="failed"?"bg-brick":s==="processing"?"bg-amber":"bg-slate"}`}/><span className="capitalize text-ink/60">{s}</span><b className="ml-4 font-mono">{data[s]||0}</b></div>)}</div></div></div>;
}

function exportCsv(data: AnalyticsResponse) {
  const lines: Array<Array<string | number>> = [["Period","Key","Total","Queued","Processing","Completed","Failed"]];
  for (const [name, rows] of [["Daily",data.daily],["Weekly",data.weekly],["Monthly",data.monthly]] as const) for (const r of rows) lines.push([name,r.key,r.total,r.queued,r.processing,r.completed,r.failed]);
  lines.push([]); lines.push(["Summary","Total",data.total,data.counts.queued,data.counts.processing,data.counts.completed,data.counts.failed]);
  const csv = "\uFEFF" + lines.map(row => row.map(v => `"${String(v ?? "").replaceAll('"','""')}"`).join(",")).join("\r\n");
  const blob = new Blob([csv], {type:"text/csv;charset=utf-8"}); const url=URL.createObjectURL(blob); const a=document.createElement("a"); a.href=url; a.download=`scan-analytics-${data.from}-to-${data.to}.csv`; a.click(); URL.revokeObjectURL(url);
}

export default function AnalyticsPage() {
  const [preset,setPreset]=useState("week"); const [from,setFrom]=useState(""); const [to,setTo]=useState(""); const [data,setData]=useState<AnalyticsResponse|null>(null); const [loading,setLoading]=useState(false); const [error,setError]=useState<string|null>(null); const [lastUpdated,setLastUpdated]=useState<Date|null>(null);
  const load=useCallback(async()=>{setLoading(true);setError(null);try{const range=preset==="custom"?{from:from||undefined,to:to||undefined}:rangeForPreset(preset);setData(await fetchAnalytics(loadSettings(),range.from,range.to)); setLastUpdated(new Date());}catch(e){setError(e instanceof ApiError?e.message:"Could not load analytics.");}finally{setLoading(false);}},[preset,from,to]);
  useEffect(()=>{load()},[load]);
  return <AppShell><div className="h-full overflow-y-auto animate-app-enter bg-paper px-8 py-6"><div className="mx-auto max-w-7xl">
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4"><div><a href="/" className="text-[11px] font-medium text-blueprint hover:underline">← Pipeline board</a><h1 className="mt-2 font-display text-3xl font-semibold">Scan analytics</h1><p className="mt-1 text-sm text-ink/45">Compare incoming scans by day, week and month.</p></div><div className="flex items-center gap-2"><button onClick={()=>load()} disabled={loading} className="rounded-xl border border-line bg-white px-4 py-2.5 text-xs font-semibold text-ink/65 shadow-sm transition hover:-translate-y-0.5 hover:border-blueprint hover:text-blueprint disabled:opacity-40">{loading?"Refreshing…":"Refresh"}</button><button onClick={()=>data&&exportCsv(data)} disabled={!data} className="rounded-xl bg-blueprint px-4 py-2.5 text-xs font-semibold text-paper shadow-sm transition hover:-translate-y-0.5 hover:shadow-md disabled:opacity-40">Export Excel-compatible CSV</button></div></header>
    <div className="mb-6 flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-white/70 p-2">{[["today","Today"],["week","This week"],["month","This month"],["30d","Last 30 days"]].map(([k,l])=><button key={k} onClick={()=>setPreset(k)} className={`rounded-full px-3 py-1.5 text-[11px] ${preset===k?"bg-blueprint text-paper":"bg-ink/5 text-ink/55 hover:bg-ink/10"}`}>{l}</button>)}<button onClick={()=>setPreset("custom")} className={`rounded-full px-3 py-1.5 text-[11px] ${preset==="custom"?"bg-blueprint text-paper":"bg-ink/5 text-ink/55"}`}>Custom</button>{preset==="custom"&&<><input type="date" value={from} onChange={e=>setFrom(e.target.value)} className="rounded-full border border-line px-3 py-1.5 text-[11px]"/><span className="text-xs text-ink/30">to</span><input type="date" value={to} onChange={e=>setTo(e.target.value)} className="rounded-full border border-line px-3 py-1.5 text-[11px]"/></>}</div>
    {error&&<div className="mb-5 rounded-xl border border-brick/20 bg-brick/10 px-4 py-3 text-sm text-brick">{error}</div>}
    {loading&&!data?<div className="grid gap-4 lg:grid-cols-2"><div className="h-72 animate-pulse rounded-2xl bg-ink/5"/><div className="h-72 animate-pulse rounded-2xl bg-ink/5"/></div>:data&&<>
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">{statuses.map(s=><div key={s} className="rounded-2xl border border-line bg-white p-4 shadow-sm"><p className="text-[10px] uppercase tracking-widest text-ink/35">{s}</p><p className="mt-2 font-display text-2xl font-semibold">{data.counts[s]}</p></div>)}</div>
      <div className="mb-5 grid gap-3 md:grid-cols-3">
        <div className="rounded-2xl border border-line bg-white p-4 shadow-sm"><p className="text-[10px] uppercase tracking-widest text-ink/35">Completion rate</p><p className="mt-2 font-display text-2xl font-semibold">{data.total ? Math.round((data.counts.completed/data.total)*100) : 0}%</p><p className="mt-1 text-[11px] text-ink/40">Completed scans in this range</p></div>
        <div className="rounded-2xl border border-line bg-white p-4 shadow-sm"><p className="text-[10px] uppercase tracking-widest text-ink/35">Needs attention</p><p className="mt-2 font-display text-2xl font-semibold">{data.counts.failed + data.counts.queued}</p><p className="mt-1 text-[11px] text-ink/40">Failed + waiting scans</p></div>
        <div className="rounded-2xl border border-line bg-white p-4 shadow-sm"><p className="text-[10px] uppercase tracking-widest text-ink/35">Peak day</p><p className="mt-2 font-display text-lg font-semibold">{data.daily.length ? data.daily.reduce((a,b)=>b.total>a.total?b:a).label : "—"}</p><p className="mt-1 text-[11px] text-ink/40">{data.daily.length ? `${Math.max(...data.daily.map(r=>r.total))} incoming scans` : "No scans in range"}</p></div>
      </div>
      <div className={loading ? "grid gap-4 lg:grid-cols-[1.6fr_1fr] opacity-60 transition-opacity" : "grid gap-4 lg:grid-cols-[1.6fr_1fr]"}><BarChart rows={data.daily} title="Daily incoming scans"/><Donut data={data.counts}/></div>
      <div className={loading ? "mt-4 grid gap-4 lg:grid-cols-2 opacity-60 transition-opacity" : "mt-4 grid gap-4 lg:grid-cols-2"}><LineChart rows={data.weekly}/><BarChart rows={data.monthly} title="Monthly incoming scans"/></div>
      <p className="mt-5 text-[11px] text-ink/35">{lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"})} · ` : ""}Range: {data.from} → {data.to} · {data.total} incoming scans. Export includes daily, weekly and monthly breakdowns.</p>
    </>}
  </div></div></AppShell>;
}
