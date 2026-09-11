"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { ApiError, isAbortError, loadSettings, resolveBackendAssetUrl, retryDelivery, retryScan, type ScanSummary } from "@/lib/api";
import ConfirmModal from "@/components/ConfirmModal";

const statusLabel: Record<string, string> = {
  queued: "Queued",
  processing: "Processing",
  completed: "Completed",
  failed: "Failed",
  delivered: "Delivered",
};

const statusColor: Record<string, string> = {
  queued: "bg-slate/10 text-slate",
  processing: "bg-amber/10 text-amber",
  completed: "bg-sage/10 text-sage",
  failed: "bg-brick/10 text-brick",
  delivered: "bg-sage/10 text-sage",
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

function statusExplanation(status: string, error: string | null): string {
  if (status === "queued") {
    return "This scan has been received and safely held in the manual queue. It will not enter Photoshop, Illustrator, Python, or Daz Studio until an operator clicks “Process next scan” on the dashboard.";
  }
  if (status === "processing") {
    return "An operator released this scan from the manual queue and the single pipeline worker is processing it now.";
  }
  if (status === "completed") {
    return "The scan passed through the processing pipeline successfully and its result was recorded.";
  }
  return error
    ? "The pipeline stopped because of the error shown below. Review the reason before retrying the scan."
    : "The pipeline stopped before completion. Review the scan details and retry when ready.";
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

function ClientMeasurements({ input }: { input: NonNullable<ScanSummary["client_input"]> }) {
  const rows: Array<[string, string | number | null | undefined]> = [
    ["Height", input.height != null ? `${input.height} cm` : null],
    ["Weight", input.weight != null ? `${input.weight} kg` : null],
    ["Age", input.age],
    ["Bust", input.bust != null ? `${input.bust} cm` : null],
    ["Chest", input.chest != null ? `${input.chest} cm` : null],
    ["Waist", input.waist != null ? `${input.waist} cm` : null],
    ["Hips", input.hips != null ? `${input.hips} cm` : null],
    ["Bra cup", input.bra_cup_size],
  ];
  const visible = rows.filter(([, value]) => value !== null && value !== undefined && value !== "");
  if (!visible.length) return null;
  return (
    <section className="mt-4 rounded-xl border border-line bg-white/55 p-4">
      <div className="mb-3">
        <p className="text-[10px] font-semibold uppercase tracking-[.14em] text-blueprint/70">Client input</p>
        <p className="mt-0.5 text-xs text-ink/45">Measurements supplied for this client and used for processing review.</p>
      </div>
      <div className="grid grid-cols-2 gap-x-5 gap-y-1 divide-y divide-line/70">
        {visible.map(([label, value]) => (
          <Row key={label} label={label} value={String(value)} />
        ))}
      </div>
    </section>
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
  displayStatus,
}: {
  scan: ScanSummary;
  onClose: () => void;
  /** Called after a successful retry so the board can refresh sooner
   * than the next poll tick, instead of waiting up to REFRESH_MS. */
  onRetried?: () => void;
  displayStatus?: "delivered";
}) {
  const [retryState, setRetryState] = useState<
    "idle" | "retrying" | "done" | "error"
  >("idle");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);
  const [retryError, setRetryError] = useState<string | null>(null);
  const [confirmRetry, setConfirmRetry] = useState(false);
  const [deliveryState, setDeliveryState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [deliveryError, setDeliveryError] = useState<string | null>(null);
  const shownStatus = displayStatus ?? scan.status;
  const imageSettings = loadSettings();
  const frontSrc = resolveBackendAssetUrl(imageSettings, scan.front_image_url);
  const sideSrc = resolveBackendAssetUrl(imageSettings, scan.side_image_url);

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

  const handleDeliveryRetry = async () => {
    setDeliveryState("sending");
    setDeliveryError(null);
    try {
      await retryDelivery(loadSettings(), scan.scan_id);
      setDeliveryState("done");
      onRetried?.();
    } catch (e) {
      setDeliveryState("error");
      setDeliveryError(e instanceof ApiError ? e.message : "Delivery retry failed.");
    }
  };

  const handleRetry = async () => {
    setConfirmRetry(false);
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

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex animate-modal-backdrop items-center justify-center bg-ink/40 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="animate-modal-panel max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-white/60 bg-paper p-6 shadow-2xl shadow-ink/20 [will-change:transform,opacity]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="font-mono text-xs text-ink/40">{scan.scan_id}</p>
            <span
              className={`mt-1.5 inline-block rounded-full px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide ${
                statusColor[shownStatus] ?? "bg-slate/10 text-slate"
              }`}
            >
              {statusLabel[shownStatus] ?? shownStatus}
            </span>
            <p className="mt-2 max-w-xl text-xs leading-relaxed text-ink/45">{statusExplanation(shownStatus, scan.error)}</p>
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
            {frontSrc && (
              <DetailImage src={frontSrc} alt="front" />
            )}
            {sideSrc && (
              <DetailImage src={sideSrc} alt="side" />
            )}
          </div>
        )}

        <div className="divide-y divide-line">
          <Row label="Client" value={scan.user_id ?? "unknown"} />
          <Row label="Gender" value={scan.gender ?? "—"} />
          <Row label="Created" value={formatDate(scan.created_at)} />
          <Row label="Updated" value={formatDate(scan.updated_at)} />
          {scan.daz_template && (
            <Row label="Daz template" value={scan.daz_template} />
          )}
        </div>

        {scan.client_input && <ClientMeasurements input={scan.client_input} />}

        {scan.result?.measurements_output && (
          <section className="mt-4 rounded-xl border border-sage/20 bg-sage/5 p-4">
            <div className="mb-3"><p className="text-[10px] font-semibold uppercase tracking-[.14em] text-sage">Result measurements</p><p className="mt-0.5 text-xs text-ink/45">Output produced by the Photoshop → Illustrator → Python → DAZ pipeline.</p></div>
            <div className="grid grid-cols-2 gap-x-5 gap-y-1">
              {Object.entries(scan.result.measurements_output).filter(([,v]) => v !== null && v !== undefined).map(([key,value]) => <Row key={key} label={key.replaceAll("_", " ")} value={String(value)} />)}
            </div>
          </section>
        )}

        {scan.result?.daz_model && (
          <section className="mt-3 rounded-xl border border-line bg-white/55 p-4">
            <div className="mb-3"><p className="text-[10px] font-semibold uppercase tracking-[.14em] text-blueprint/70">DAZ result</p></div>
            <Row label="Template" value={scan.result.daz_model.template} />
            <div className="mt-2 grid grid-cols-2 gap-x-5 gap-y-1">
              {Object.entries(scan.result.daz_model.sliders || {}).map(([key,value]) => <Row key={key} label={key} value={String(value)} />)}
            </div>
            {scan.result.source_svg_key && <div className="mt-2"><Row label="SVG key" value={scan.result.source_svg_key} /></div>}
          </section>
        )}

        <section className="mt-3 rounded-xl border border-line bg-white/55 p-4">
          <div className="mb-3"><p className="text-[10px] font-semibold uppercase tracking-[.14em] text-blueprint/70">Delivery</p><p className="mt-0.5 text-xs text-ink/45">Downstream result delivery is independent from processing, so a delivery outage never requires re-running the desktop pipeline.</p></div>
          <div className="flex items-center justify-between gap-3">
            <div><p className="text-xs font-semibold text-ink/70">{scan.delivery_status === "delivered" ? "Delivered to Shopdrop" : scan.delivery_status === "failed" ? "Delivery failed" : scan.delivery_status === "sending" ? "Sending…" : "Waiting for delivery"}</p><p className="mt-0.5 font-mono text-[10px] text-ink/35">{formatDate(scan.delivered_at ?? null)}</p></div>
            {scan.delivery_status !== "delivered" && scan.result && <button type="button" onClick={handleDeliveryRetry} disabled={deliveryState === "sending"} className="rounded-lg bg-blueprint px-3 py-2 text-[11px] font-semibold text-paper disabled:opacity-50">{deliveryState === "sending" ? "Sending…" : "Retry delivery"}</button>}
          </div>
          {(scan.delivery_error || deliveryError) && <p className="mt-2 break-words rounded bg-amber/10 px-2 py-1.5 text-[11px] text-amber">{deliveryError || scan.delivery_error}</p>}
          {deliveryState === "done" && <p className="mt-2 rounded bg-sage/10 px-2 py-1.5 text-[11px] font-medium text-sage">Delivery accepted. The board will update on the next refresh.</p>}
        </section>

        <section className="mt-4 rounded-xl border border-line bg-white/55 p-4">
          <div className="mb-3"><p className="text-[10px] font-semibold uppercase tracking-[.14em] text-blueprint/70">Processing timeline</p><p className="mt-0.5 text-xs text-ink/45">A concise audit trail for this scan.</p></div>
          <div className="space-y-3">
            {[
              ["Scan received", scan.created_at, true],
              ["Processing started", scan.processing_started_at ?? null, !!scan.processing_started_at],
              [scan.status === "failed" ? "Processing failed" : "Processing completed", scan.status === "failed" ? scan.failed_at ?? null : scan.completed_at ?? null, !!(scan.status === "failed" ? scan.failed_at : scan.completed_at)],
            ].map(([label, at, active], i) => (
              <div key={String(label)} className="flex items-start gap-3">
                <div className="mt-1 flex flex-col items-center"><span className={`h-2.5 w-2.5 rounded-full ${active ? "bg-blueprint" : "bg-ink/15"}`} />{i < 2 && <span className="mt-1 h-5 w-px bg-line" />}</div>
                <div className="min-w-0"><p className={`text-xs font-semibold ${active ? "text-ink/75" : "text-ink/30"}`}>{String(label)}</p><p className="mt-0.5 font-mono text-[10px] text-ink/35">{formatDate(at as string | null)}</p></div>
              </div>
            ))}
          </div>
        </section>

        {scan.status === "failed" && scan.error && (
          <div className="mt-3 rounded bg-brick/10 px-3 py-2 text-[12px] text-brick">
            <p className="mb-0.5 font-medium">Why processing stopped</p>
            <p className="break-words">{scan.error}</p>
          </div>
        )}

        {scan.status === "failed" && (
          <div className="mt-3">
            {retryState === "done" ? (
              <p className="rounded bg-sage/10 px-3 py-2 text-[12px] font-medium text-sage">
                Re-queued — waiting for a manual trigger from the dashboard.
              </p>
            ) : (
              <button
                onClick={() => setConfirmRetry(true)}
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
      <ConfirmModal open={confirmRetry} title="Retry this scan?" message={`Scan ${scan.scan_id.slice(0, 12)}… will be placed back into the manual queue. It will not start automatically.`} confirmLabel="Retry scan" onConfirm={handleRetry} onCancel={() => setConfirmRetry(false)} />
    </div>,
    document.body
  );
}
