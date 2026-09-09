"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AppShell from "@/components/AppShell";
import { ApiError, fetchCSVImportJob, loadSettings, startCSVImport, type CSVImportJob } from "@/lib/api";

const STEPS = [
  ["file", "CSV received", "Reading the uploaded file"],
  ["header", "Extracting header", "Reading column names from the first row"],
  ["collection", "Finding collection", "Deriving the MongoDB collection from the filename"],
  ["checking", "Checking collection", "Checking whether the target collection already exists"],
  ["replace", "Replacing data", "Clearing the existing collection before the new rows are written"],
  ["insert", "Writing rows", "Inserting the CSV rows into MongoDB"],
  ["archive", "Archiving CSV", "Moving the processed file into csv_imports/processed"],
  ["complete", "Import complete", "The database now contains the imported CSV"],
] as const;

function stageNumber(job: CSVImportJob | null) {
  if (!job) return -1;
  if (job.status === "failed") return 99;
  if (job.stage === "reading" || job.stage === "queued") return 0;
  return job.stage_index ?? 0;
}
function StageIcon({state}:{state:"done"|"active"|"idle"|"failed"}) {
  if(state==="done") return <span className="flex h-7 w-7 items-center justify-center rounded-full bg-sage/10 text-sm text-sage">✓</span>;
  if(state==="failed") return <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brick/10 text-sm text-brick">!</span>;
  if(state==="active") return <span className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-blueprint/20 border-t-blueprint animate-spin"/>;
  return <span className="flex h-7 w-7 items-center justify-center rounded-full border border-line bg-paper text-[9px] text-ink/25"/>;
}

export default function CSVImportPage(){
  const settings=useMemo(()=>loadSettings(),[]);
  const [job,setJob]=useState<CSVImportJob|null>(null), [file,setFile]=useState<File|null>(null), [busy,setBusy]=useState(false), [error,setError]=useState<string|null>(null);
  const inputRef=useRef<HTMLInputElement>(null);
  const refresh=useCallback(async(id:string)=>{ try{const j=await fetchCSVImportJob(settings,id);setJob(j);return j;}catch(e){setError(e instanceof ApiError?e.message:"Could not read import status.");return null;}},[settings]);
  useEffect(()=>{ if(!job || (job.status!=="queued" && job.status!=="running")) return; const t=window.setInterval(()=>void refresh(job.id),700); return()=>window.clearInterval(t); },[job?.id,job?.status,refresh]);
  const begin=async()=>{if(!file||busy)return;setBusy(true);setError(null);try{const j=await startCSVImport(settings,file);setJob(j);setFile(null);if(inputRef.current)inputRef.current.value="";}catch(e){setError(e instanceof ApiError?e.message:"Could not start CSV import.");}finally{setBusy(false)}};
  const current=stageNumber(job);
  return <AppShell><div className="h-full overflow-hidden bg-paper px-8 py-6"><div className="mx-auto flex h-full min-h-0 max-w-[1400px] flex-col">
    <header className="shrink-0"><p className="text-[10px] font-bold uppercase tracking-[.18em] text-ink/30">Control · Data</p><div className="mt-1 flex items-end justify-between"><div><h1 className="font-display text-3xl font-semibold">CSV importer</h1><p className="mt-1 text-sm text-ink/45">Run the existing backend CSV import flow and watch every database step.</p></div>{job&&<span className={`rounded-full px-3 py-1.5 text-[9px] font-bold uppercase tracking-wider ${job.status==="completed"?"bg-sage/10 text-sage":job.status==="failed"?"bg-brick/10 text-brick":"bg-blueprint/5 text-blueprint"}`}>{job.status}</span>}</div></header>
    {error&&<div className="mt-4 shrink-0 rounded-xl border border-brick/20 bg-brick/5 px-4 py-3 text-xs text-brick">{error}</div>}
    <div className="mt-5 grid min-h-0 flex-1 grid-cols-[390px_1fr] gap-5 overflow-hidden">
      <section className="flex min-h-0 flex-col rounded-2xl border border-line bg-white p-5 shadow-sm"><div><p className="text-[9px] font-bold uppercase tracking-[.15em] text-ink/30">Input CSV</p><h2 className="mt-1 text-lg font-semibold">Drop a file to import</h2><p className="mt-1 text-xs leading-5 text-ink/40">The filename determines the MongoDB collection, matching the existing <span className="font-mono">csv_to_db.py</span> behavior.</p></div>
        <label className="mt-5 flex min-h-[190px] cursor-pointer flex-1 items-center justify-center rounded-2xl border border-dashed border-blueprint/20 bg-paper/50 text-center transition hover:bg-paper"><input ref={inputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={e=>{const f=e.target.files?.[0]??null;setError(null);setFile(f)}}/><div><div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-blueprint text-xl text-paper">⇅</div><p className="mt-4 text-sm font-semibold">{file?file.name:"Choose CSV"}</p><p className="mt-1 text-[10px] text-ink/35">CSV only · maximum 50 MB</p></div></label>
        {file&&<div className="mt-4 rounded-xl border border-line bg-paper/50 px-3 py-3"><div className="flex items-center justify-between"><span className="text-[10px] uppercase tracking-wider text-ink/35">Target collection</span><span className="font-mono text-xs font-semibold text-blueprint">{file.name.split(".")[0].split("__")[0]}</span></div><p className="mt-1 text-[10px] text-ink/35">The backend derives the collection from the filename before importing.</p></div>}
        <button onClick={begin} disabled={!file||busy||!!(job&&["queued","running"].includes(job.status))} className="mt-4 rounded-xl bg-blueprint px-4 py-3 text-xs font-semibold text-paper disabled:cursor-not-allowed disabled:opacity-35">{busy?"Starting…":job&&["queued","running"].includes(job.status)?"Import running…":"Run CSV import"}</button>
      </section>
      <section className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-line bg-white shadow-sm"><div className="shrink-0 border-b border-line px-6 py-5"><div className="flex items-center justify-between"><div><p className="text-[9px] font-bold uppercase tracking-[.15em] text-ink/30">Import pipeline</p><h2 className="mt-1 text-lg font-semibold">Database operation</h2></div>{job&&<div className="text-right"><p className="font-mono text-xs text-ink/50">{job.collection}</p><p className="mt-1 text-[9px] text-ink/30">{job.database}</p></div>}</div><div className="mt-4 h-1.5 overflow-hidden rounded-full bg-paper"><div className="h-full rounded-full bg-blueprint transition-all duration-500" style={{width:`${job?.progress??(job?5:0)}%`}}/></div></div>
        <div className="min-h-0 flex-1 overflow-auto p-6"><div className="space-y-1">{STEPS.map(([key,title,desc],i)=>{const done=job?.status==="completed" || (current>i);const active=!done && current===i && job?.status!=="failed";const failed=job?.status==="failed" && current===99 && i===Math.min(7, Math.max(0,job?.stage_index ?? 0));return <div key={key} className={`flex gap-4 rounded-xl px-3 py-3 transition ${active?"bg-blueprint/[.035]":""}`}><StageIcon state={failed?"failed":done?"done":active?"active":"idle"}/><div className="min-w-0 flex-1"><div className="flex items-center justify-between"><p className={`text-xs font-semibold ${active?"text-blueprint":done?"text-ink/65":"text-ink/35"}`}>{title}</p>{active&&<span className="text-[9px] font-bold uppercase tracking-wider text-blueprint">Working</span>}</div><p className="mt-1 text-[10px] leading-4 text-ink/35">{desc}</p></div></div>})}</div>
          {job&&<div className="mt-5 grid grid-cols-3 gap-3"><div className="rounded-xl border border-line bg-paper/40 p-3"><p className="text-[9px] uppercase tracking-wider text-ink/30">Columns</p><p className="mt-1 text-lg font-semibold">{job.columns_count||"—"}</p></div><div className="rounded-xl border border-line bg-paper/40 p-3"><p className="text-[9px] uppercase tracking-wider text-ink/30">Deleted</p><p className="mt-1 text-lg font-semibold">{job.deleted}</p></div><div className="rounded-xl border border-line bg-paper/40 p-3"><p className="text-[9px] uppercase tracking-wider text-ink/30">Inserted</p><p className="mt-1 text-lg font-semibold">{job.inserted}</p></div></div>}
          {(job?.headers?.length ?? 0)>0&&<div className="mt-5 rounded-xl border border-line bg-paper/40 p-4"><p className="text-[9px] font-bold uppercase tracking-wider text-ink/30">Extracted header</p><div className="mt-2 flex flex-wrap gap-1.5">{(job?.headers ?? []).map((h,i)=><span key={`${h}-${i}`} className="rounded-md border border-line bg-white px-2 py-1 font-mono text-[9px] text-ink/50">{h}</span>)}</div></div>}
          {(job?.logs?.length ?? 0)>0&&<div className="mt-5"><p className="text-[9px] font-bold uppercase tracking-wider text-ink/30">Importer log</p><div className="mt-2 max-h-48 overflow-auto rounded-xl bg-blueprint p-3 font-mono text-[9px] leading-5 text-paper/70">{(job?.logs ?? []).map((l,i)=><div key={i}>{l}</div>)}</div></div>}
          {job?.status==="failed"&&<div className="mt-4 rounded-xl border border-brick/20 bg-brick/5 px-4 py-3 text-xs text-brick">{job.error}</div>}
        </div></section>
    </div>
  </div></div></AppShell>;
}
