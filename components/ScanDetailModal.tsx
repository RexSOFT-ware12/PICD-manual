"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { ApiError, isAbortError, loadSettings, retryScan, type ScanSummary } from "@/lib/api";

const statusLabel: Record<string, string> = {
  queued: "Queued",
  processing: "Processing",
  completed: "Completed",
  failed: "Failed",
};

const statusColor: Record<string, string> = {
  queued: "bg-slate/10 text-slate",
  processing: "bg-amber/10 text-amber",
  completed: "bg-sage/10 text-sage",
  failed: "bg-brick/10 text-brick",
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

function DetailImage({ src, alt }: { src: string; alt: string }) {
  return (
    <div className="relative aspect-[3/4] w-full overflow-hidden rounded-md bg-ink/5">
      <Image
        src={src}
        alt={alt}
        fill
        sizes="(max-width: 640px) 90vw, 320px"
        className="object-cover"
        unoptimized
      />
      <span className="absolute bottom-1.5 left-1.5 rounded bg-ink/60 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-paper">
        {alt}
      </span>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5 text-sm">
      <span className="text-ink/40">{label}</span>
      <span className="truncate text-right font-mono text-[13px] text-ink/80">
        {value}
      </span>
    </div>
  );
}

export default function ScanDetailModal({
  scan,
  onClose,
  onRetried,
}: {
  scan: ScanSummary;
  onClose: () => void;
  /** Called after a successful retry so the board can refresh sooner
   * than the next poll tick, instead of waiting up to REFRESH_MS. */
  onRetried?: () => void;
}) {
  const [retryState, setRetryState] = useState<
    "idle" | "retrying" | "done" | "error"
  >("idle");
  const [retryError, setRetryError] = useState<string | null>(null);

  // Esc to close, and lock background scroll while open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  const handleRetry = async () => {
    setRetryState("retrying");
    setRetryError(null);
    try {
      await retryScan(loadSettings(), scan.scan_id);
      setRetryState("done");
      onRetried?.();
    } catch (e) {
      if (isAbortError(e)) return;
      setRetryState("error");
      setRetryError(e instanceof ApiError ? e.message : "Retry failed.");
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex animate-fade-in items-center justify-center bg-ink/40 p-4 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="animate-pop-in max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-paper p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="font-mono text-xs text-ink/40">{scan.scan_id}</p>
            <span
              className={`mt-1.5 inline-block rounded-full px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide ${
                statusColor[scan.status] ?? "bg-slate/10 text-slate"
              }`}
            >
              {statusLabel[scan.status] ?? scan.status}
            </span>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded-full p-1 text-lg leading-none text-ink/40 transition hover:bg-ink/5 hover:text-ink/70"
          >
            ×
          </button>
        </div>

        {(scan.front_image_url || scan.side_image_url) && (
          <div className="mb-4 grid grid-cols-2 gap-3">
            {scan.front_image_url && (
              <DetailImage src={scan.front_image_url} alt="front" />
            )}
            {scan.side_image_url && (
              <DetailImage src={scan.side_image_url} alt="side" />
            )}
          </div>
        )}

        <div className="divide-y divide-line">
          <Row label="User" value={scan.user_id ?? "unknown"} />
          <Row label="Gender" value={scan.gender ?? "—"} />
          <Row label="Created" value={formatDate(scan.created_at)} />
          <Row label="Updated" value={formatDate(scan.updated_at)} />
          {scan.daz_template && (
            <Row label="Daz template" value={scan.daz_template} />
          )}
        </div>

        {scan.status === "failed" && scan.error && (
          <div className="mt-3 rounded bg-brick/10 px-3 py-2 text-[12px] text-brick">
            <p className="mb-0.5 font-medium">Error</p>
            <p className="break-words">{scan.error}</p>
          </div>
        )}

        {scan.status === "failed" && (
          <div className="mt-3">
            {retryState === "done" ? (
              <p className="rounded bg-sage/10 px-3 py-2 text-[12px] font-medium text-sage">
                Re-queued — it&apos;ll pick up on the next worker cycle.
              </p>
            ) : (
              <button
                onClick={handleRetry}
                disabled={retryState === "retrying"}
                className="w-full rounded-md bg-blueprint px-3 py-2 text-[13px] font-medium text-paper transition hover:bg-blueprint/90 disabled:cursor-wait disabled:opacity-60"
              >
                {retryState === "retrying" ? "Retrying…" : "Retry scan"}
              </button>
            )}
            {retryState === "error" && retryError && (
              <p className="mt-1.5 break-words text-[11px] text-brick">
                {retryError}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
