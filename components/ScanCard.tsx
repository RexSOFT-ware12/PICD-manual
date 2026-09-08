"use client";

import { useEffect, useRef, useState, type CSSProperties, type DragEvent } from "react";
import Image from "next/image";
import type { ScanSummary } from "@/lib/api";
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
  if (failed) return <div className="relative flex h-16 w-12 items-center justify-center overflow-hidden rounded bg-ink/10"><span className="text-center text-[8px] leading-tight text-ink/40">image<br />unavailable</span></div>;
  return <div className="relative h-16 w-12 overflow-hidden rounded bg-ink/5">{!loaded && <div className="absolute inset-0 animate-pulse bg-ink/10" />}<Image ref={imgRef} src={src} alt={alt} fill sizes="48px" className={`object-cover transition-opacity duration-300 ${loaded ? "opacity-100" : "opacity-0"}`} unoptimized onLoad={() => setLoaded(true)} onError={() => setFailed(true)} /></div>;
}

export default function ScanCard({ scan, style, onRetried, onMoved, draggable = false, deleteMode = false, deleting = false, onDelete, onDropBefore }: { scan: ScanSummary; style?: CSSProperties; onRetried?: () => void; onMoved?: () => void; draggable?: boolean; deleteMode?: boolean; deleting?: boolean; onDelete?: (scanId: string) => void; onDropBefore?: (scanId: string, targetScanId: string) => void }) {
  const [open, setOpen] = useState(false);
  const [dragging, setDragging] = useState(false);

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
        e.preventDefault(); e.stopPropagation(); e.currentTarget.classList.remove("ring-2", "ring-blueprint/30");
        const sourceId = e.dataTransfer.getData("text/scan-id");
        const sourceStatus = e.dataTransfer.getData("text/scan-status");
        if (sourceId && sourceId !== scan.scan_id && scan.status === "queued" && sourceStatus === "queued") onDropBefore?.(sourceId, scan.scan_id);
      }}
      className={`min-w-0 cursor-pointer animate-fade-in-up rounded-md border border-line border-l-[3px] bg-white/70 p-3 shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md ${accentByStatus[scan.status] ?? "border-l-slate"} ${draggable ? "cursor-grab active:cursor-grabbing" : ""} ${dragging ? "scale-[.98] opacity-45" : ""}`}
    >
      {open && <ScanDetailModal scan={scan} onClose={() => setOpen(false)} onRetried={onRetried} />}
      <div className="mb-2 flex items-center justify-between gap-2"><span className="truncate font-mono text-[11px] text-ink/60">{scan.scan_id.slice(0, 8)}…</span><span className="shrink-0 font-mono text-[10px] text-ink/40">{timeAgo(scan.status === "queued" ? scan.created_at : scan.updated_at)}</span></div>
      {(scan.front_image_url || scan.side_image_url) && <div className="mb-2 flex gap-1.5">{scan.front_image_url && <Thumb src={scan.front_image_url} alt="front" />}{scan.side_image_url && <Thumb src={scan.side_image_url} alt="side" />}</div>}
      <div className="flex items-center justify-between gap-2 text-xs"><span className="truncate text-ink/70">{scan.user_id ?? "unknown user"}</span>{scan.gender && <span className="shrink-0 rounded-full bg-ink/5 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-ink/50">{scan.gender}</span>}</div>
      {scan.status === "failed" && scan.error && <p className="mt-2 line-clamp-2 break-words rounded bg-brick/10 px-2 py-1 text-[11px] text-brick">{scan.error}</p>}
      {scan.status === "completed" && scan.daz_template && <p className="mt-2 truncate font-mono text-[10px] text-sage">{scan.daz_template}</p>}
      {draggable && <p className="mt-2 text-[9px] uppercase tracking-[.14em] text-ink/25">drag to queue</p>}
    </div>
  );
}
