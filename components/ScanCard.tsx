"use client";

import { useEffect, useRef, useState, type CSSProperties, type DragEvent } from "react";
import Image from "next/image";
import { loadSettings, resolveBackendAssetUrl, type ScanSummary } from "@/lib/api";
import ScanDetailModal from "./ScanDetailModal";

function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const diffSec = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.round(diffHr / 24)}d ago`;
}

const accentByStatus: Record<string, string> = {
  queued: "border-l-slate", processing: "border-l-amber", completed: "border-l-sage", failed: "border-l-brick",
};

function Thumb({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const imgRef = useRef<HTMLImageElement | null>(null);
  useEffect(() => { setFailed(false); setLoaded(false); }, [src]);
  useEffect(() => { if (imgRef.current?.complete && imgRef.current.naturalWidth > 0) setLoaded(true); }, [src]);
  if (failed) return <div className="relative flex h-14 w-11 items-center justify-center overflow-hidden rounded bg-ink/10"><span className="text-center text-[8px] leading-tight text-ink/40">image<br />unavailable</span></div>;
  return <div className="relative h-14 w-11 overflow-hidden rounded bg-ink/5">{!loaded && <div className="absolute inset-0 animate-pulse bg-ink/10" />}<Image ref={imgRef} src={src} alt={alt} fill sizes="48px" className={`object-cover transition-opacity duration-300 ${loaded ? "opacity-100" : "opacity-0"}`} unoptimized onLoad={() => setLoaded(true)} onError={() => setFailed(true)} /></div>;
}

export default function ScanCard({ scan, style, onRetried, onMoved, draggable = false, deleteMode = false, deleting = false, onDelete, onDropBefore, compact = false, displayStatus }: { scan: ScanSummary; style?: CSSProperties; onRetried?: () => void; onMoved?: () => void; draggable?: boolean; deleteMode?: boolean; deleting?: boolean; onDelete?: (scanId: string) => void; onDropBefore?: (scanId: string, targetScanId: string) => void; compact?: boolean; displayStatus?: "delivered" }) {
  const [open, setOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const imageSettings = loadSettings();
  const frontSrc = resolveBackendAssetUrl(imageSettings, scan.front_image_url);
  const sideSrc = resolveBackendAssetUrl(imageSettings, scan.side_image_url);
  const shownStatus = displayStatus ?? scan.status;

  const handleDragStart = (e: DragEvent<HTMLDivElement>) => {
    if (!draggable) { e.preventDefault(); return; }
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/scan-id", scan.scan_id);
    e.dataTransfer.setData("text/scan-status", scan.status);
    setDragging(true);
  };

  const handleClick = () => {
    if (deleteMode && scan.status !== "completed") {
      onDelete?.(scan.scan_id);
      return;
    }
    if (!deleteMode) setOpen(true);
  };

  return (
    <div
      style={style}
      role="button"
      tabIndex={0}
      draggable={draggable}
      onDragStart={handleDragStart}
      onDragEnd={() => setDragging(false)}
      onClick={handleClick}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleClick(); } }}
      onDragOver={(e) => {
        if (scan.status === "queued" && e.dataTransfer.types.includes("text/scan-id")) { e.preventDefault(); e.currentTarget.classList.add("ring-2", "ring-blueprint/30"); }
      }}
      onDragLeave={(e) => e.currentTarget.classList.remove("ring-2", "ring-blueprint/30")}
      onDrop={(e) => {
        e.preventDefault();
        e.currentTarget.classList.remove("ring-2", "ring-blueprint/30");
        const sourceId = e.dataTransfer.getData("text/scan-id");
        const sourceStatus = e.dataTransfer.getData("text/scan-status");
        // Only consume the drop when this is a queued-to-queued reorder.
        // For failed/processing -> queue and queued -> processing, let the
        // column-level drop handler receive the event.
        if (sourceId && sourceId !== scan.scan_id && scan.status === "queued" && sourceStatus === "queued") {
          e.stopPropagation();
          onDropBefore?.(sourceId, scan.scan_id);
        }
      }}
      className={`${compact ? "p-2" : "p-3"} min-w-0 cursor-pointer animate-fade-in-up rounded-lg border border-line border-l-[3px] bg-white/70 shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md ${accentByStatus[scan.status] ?? "border-l-slate"} ${draggable ? "cursor-grab active:cursor-grabbing" : ""} ${dragging ? "scale-[.98] opacity-45" : ""}`}
    >
      {open && <ScanDetailModal scan={scan} displayStatus={displayStatus} onClose={() => setOpen(false)} onRetried={onRetried} />}
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="truncate font-mono text-[11px] text-ink/60">{scan.scan_id.slice(0, 8)}…</span>
        <div className="flex shrink-0 items-center gap-1">
          <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${shownStatus === "delivered" ? "bg-sage/10 text-sage" : scan.status === "failed" ? "bg-brick/10 text-brick" : scan.status === "processing" ? "bg-amber/10 text-amber" : scan.status === "queued" ? "bg-slate/10 text-slate" : "bg-sage/10 text-sage"}`}>{shownStatus}</span>
          <span className="font-mono text-[10px] text-ink/40">{timeAgo(scan.status === "queued" ? scan.created_at : scan.updated_at)}</span>
          {onDelete && scan.status !== "completed" && (
            <button
              type="button"
              aria-label={`Delete scan ${scan.scan_id.slice(0, 8)}`}
              title="Delete scan"
              disabled={deleting}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onDelete(scan.scan_id);
              }}
              onKeyDown={(e) => e.stopPropagation()}
              className={`ml-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-transparent text-ink/30 transition hover:border-brick/20 hover:bg-brick/10 hover:text-brick focus:outline-none focus:ring-2 focus:ring-brick/20 ${deleting ? "cursor-wait opacity-40" : ""}`}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="m19 6-1 15H6L5 6" /><path d="M10 11v6M14 11v6" />
              </svg>
            </button>
          )}
        </div>
      </div>
      {(frontSrc || sideSrc) && <div className={`${compact ? "mb-1.5" : "mb-2"} flex gap-1.5`}>{frontSrc && <Thumb src={frontSrc} alt="front" />}{sideSrc && <Thumb src={sideSrc} alt="side" />}</div>}
      {scan.image_analysis && (() => {
        const a = scan.image_analysis;
        const front = a.card?.front;
        const side = a.card?.side;
        const warnings = a.issues?.length ?? 0;
        const analyzing = a.status === "analyzing";
        const state = analyzing ? "analyzing" : a.status === "error" ? "error" : warnings > 0 || a.status === "warning" ? "warning" : "ok";
        const stateClass = state === "ok" ? "bg-sage/10 text-sage" : state === "warning" ? "bg-amber/10 text-amber" : state === "error" ? "bg-brick/10 text-brick" : "bg-blueprint/10 text-blueprint";
        const angle = (v?: number | null) => v == null ? "—" : `${Math.round(v)}°`;
        const stageLabel = a.stage === "storing_images" ? "saving images" : a.stage === "analyzing_front" ? "checking front" : a.stage === "analyzing_side" ? "checking side" : a.stage === "complete" ? "complete" : "preparing";
        const progress = Math.max(0, Math.min(100, Number(a.progress ?? 0)));
        return <div className={`relative mb-2 overflow-hidden rounded-md border px-2 py-1.5 ${analyzing ? "border-blueprint/20 bg-blueprint/[0.035]" : "border-line/70 bg-ink/[0.025]"}`}>
          {analyzing && <div className="pointer-events-none absolute inset-y-0 left-0 w-1/3 -translate-x-full bg-blueprint/[0.08] animate-[scan-sweep_1.4s_ease-in-out_infinite]" />}
          <div className="relative flex items-center gap-1.5">
            {analyzing && <span className="h-2.5 w-2.5 animate-spin rounded-full border-[1.5px] border-blueprint/20 border-t-blueprint" />}
            <span className={`rounded px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider ${stateClass}`}>{analyzing ? "Analyzing images" : "Image QC"}</span>
            <span className="text-[9px] text-ink/40">{analyzing ? stageLabel : warnings ? `${warnings} warning${warnings === 1 ? "" : "s"}` : "ready"}</span>
            {!analyzing && <><span className="ml-auto text-[9px] font-mono text-ink/45">F {angle(front?.left_arm_deg)} / {angle(front?.right_arm_deg)}</span><span className="text-[9px] font-mono text-ink/45">S {angle(side?.left_arm_deg)} / {angle(side?.right_arm_deg)}</span></>}
          </div>
          {analyzing ? <div className="relative mt-1.5 flex items-center gap-2"><div className="h-1 flex-1 overflow-hidden rounded-full bg-blueprint/10"><div className="h-full rounded-full bg-blueprint/60 transition-[width] duration-500" style={{ width: `${progress}%` }} /></div><span className="w-7 text-right font-mono text-[8px] text-blueprint/60">{progress}%</span></div> : warnings > 0 && <p className="relative mt-1 truncate text-[9px] text-amber">{a.issues?.[0]}</p>}
        </div>;
      })()}
      <div className="flex items-center justify-between gap-2 text-xs"><span className="truncate text-ink/70">{scan.user_id ?? "unknown user"}</span>{scan.gender && <span className="shrink-0 rounded-full bg-ink/5 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-ink/50">{scan.gender}</span>}</div>
      {scan.status === "failed" && scan.error && <p className="mt-2 line-clamp-2 break-words rounded bg-brick/10 px-2 py-1 text-[11px] text-brick">{scan.error}</p>}
      {scan.status === "completed" && scan.daz_template && <p className="mt-2 truncate font-mono text-[10px] text-sage">{scan.daz_template}</p>}
      {shownStatus === "delivered" && <p className="mt-2 text-[10px] font-semibold uppercase tracking-[.12em] text-sage">✓ Result delivered</p>}
      {scan.delivery_status === "failed" && scan.status === "completed" && <p className="mt-2 line-clamp-2 rounded bg-amber/10 px-2 py-1 text-[10px] text-amber">Delivery failed — click to review/retry</p>}
      {scan.result?.measurements_output && shownStatus === "delivered" && (() => { const m=scan.result.measurements_output; const vals=[m.height_cm,m.weight_kg,m.bust_cm ?? m.chest_cm,m.waist_cm,m.hips_cm].filter(v=>v!=null); return vals.length ? <p className="mt-1 font-mono text-[10px] text-ink/45">{vals.slice(0,5).map((v,i)=>String(v)).join(" · ")}</p> : null; })()}
      {draggable && <p className="mt-1.5 text-[9px] uppercase tracking-[.14em] text-ink/25">{scan.status === "queued" ? "drag to arrange or process" : "drag to queue"}</p>}
    </div>
  );
}
