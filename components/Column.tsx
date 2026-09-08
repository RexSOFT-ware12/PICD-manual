"use client";

import type { DragEvent } from "react";
import type { ScanSummary, ScanStatus } from "@/lib/api";
import { useAnimatedNumber } from "@/lib/useAnimatedNumber";
import ScanCard from "./ScanCard";

const dotByStatus: Record<ScanStatus, string> = {
  queued: "bg-slate",
  processing: "bg-amber",
  completed: "bg-sage",
  failed: "bg-brick",
};

const MAX_STAGGER_MS = 240;
const STAGGER_STEP_MS = 30;

export default function Column({
  status,
  label,
  scans,
  count,
  onRetried,
  onMoved,
  onDropScan,
}: {
  status: ScanStatus;
  label: string;
  scans: ScanSummary[];
  count: number;
  onRetried?: () => void;
  onMoved?: () => void;
  onDropScan?: (scanId: string, target: ScanStatus) => void;
}) {
  const animatedCount = useAnimatedNumber(count);

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const scanId = e.dataTransfer.getData("text/scan-id");
    if (scanId) onDropScan?.(scanId, status);
    e.currentTarget.classList.remove("ring-2", "ring-blueprint/30");
  };

  return (
    <div className="flex min-w-0 animate-fade-in-up flex-col">
      <div className="mb-3 flex items-center gap-2 px-1">
        <span className="relative flex h-2 w-2">
          {status === "processing" && <span className={`absolute inline-flex h-full w-full animate-ping rounded-full ${dotByStatus[status]} opacity-60`} />}
          <span className={`relative inline-flex h-2 w-2 rounded-full ${dotByStatus[status]}`} />
        </span>
        <h2 className="font-display text-sm font-semibold text-ink">{label}</h2>
        <span className="ml-auto font-mono text-xs tabular-nums text-ink/40">{animatedCount}</span>
      </div>
      <div
        onDragOver={(e) => {
          if (status !== "queued") return;
          e.preventDefault();
          e.currentTarget.classList.add("ring-2", "ring-blueprint/30");
        }}
        onDragLeave={(e) => e.currentTarget.classList.remove("ring-2", "ring-blueprint/30")}
        onDrop={status === "queued" ? handleDrop : undefined}
        className={`scrollbar-thin flex max-h-[calc(100vh-180px)] min-h-20 flex-col gap-2 overflow-y-auto rounded-lg bg-ink/[0.03] p-2 transition-shadow ${status === "queued" ? "ring-offset-2" : ""}`}
      >
        {scans.length === 0 && <p className="animate-fade-in px-2 py-6 text-center text-xs text-ink/30">{status === "queued" ? "drop a failed card here" : "nothing here"}</p>}
        {scans.map((scan, i) => (
          <ScanCard
            key={scan.scan_id}
            scan={scan}
            onRetried={onRetried}
            onMoved={onMoved}
            draggable={scan.status === "failed" || scan.status === "processing"}
            style={{ animationDelay: `${Math.min(i * STAGGER_STEP_MS, MAX_STAGGER_MS)}ms` }}
          />
        ))}
      </div>
    </div>
  );
}
