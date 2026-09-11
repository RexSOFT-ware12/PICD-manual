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
  onDropBefore,
  deleteMode,
  deletingScan,
  onDelete,
  compact = false,
  boardStatus,
  canProcess = false,
  canMove = false,
  canReorder = false,
  canDelete = false,
}: {
  status: ScanStatus;
  label: string;
  scans: ScanSummary[];
  count: number;
  onRetried?: () => void;
  onMoved?: () => void;
  onDropScan?: (scanId: string, target: ScanStatus) => void;
  onDropBefore?: (scanId: string, targetScanId: string) => void;
  deleteMode?: boolean;
  deletingScan?: string | null;
  onDelete?: (scanId: string) => void;
  compact?: boolean;
  boardStatus?: "delivered";
  canProcess?: boolean;
  canMove?: boolean;
  canReorder?: boolean;
  canDelete?: boolean;
}) {
  const animatedCount = useAnimatedNumber(count);

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const scanId = e.dataTransfer.getData("text/scan-id");
    if (scanId) {
      const allowed = status === "processing" ? canProcess : status === "queued" ? canMove : false;
      if (allowed) onDropScan?.(scanId, status);
    }
    e.currentTarget.classList.remove("ring-2", "ring-blueprint/30");
  };

  return (
    <div className="flex h-full min-h-0 min-w-0 animate-fade-in-up flex-col">
      <div className="sticky top-0 z-10 mb-2 flex items-center gap-2 rounded-lg bg-paper/90 px-2 py-1.5 backdrop-blur-sm">
        <span className="relative flex h-2 w-2">
          {status === "processing" && <span className={`absolute inline-flex h-full w-full animate-ping rounded-full ${dotByStatus[status]} opacity-60`} />}
          <span className={`relative inline-flex h-2 w-2 rounded-full ${dotByStatus[status]}`} />
        </span>
        <h2 className="font-display text-sm font-semibold text-ink">{label}</h2>
        <span className="ml-auto font-mono text-xs tabular-nums text-ink/40">{animatedCount}</span>
      </div>
      <div
        onDragOver={(e) => {
          const allowed = status === "processing" ? canProcess : status === "queued" ? canMove : false;
          if (!allowed) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          e.currentTarget.classList.add("ring-2", "ring-blueprint/30", "bg-blueprint/[0.045]");
        }}
        onDragLeave={(e) => e.currentTarget.classList.remove("ring-2", "ring-blueprint/30", "bg-blueprint/[0.045]")}
        onDrop={handleDrop}
        className={`scrollbar-thin flex min-h-[220px] flex-1 flex-col gap-2 overflow-y-auto rounded-xl bg-ink/[0.035] p-2 transition-shadow ${status === "queued" || status === "processing" ? "ring-offset-2" : ""}`}
      >
        {scans.length === 0 && <div className="flex min-h-[180px] flex-1 items-center justify-center px-2 text-center text-xs text-ink/30">{status === "queued" ? "drop a failed card here" : status === "processing" ? "drop a queued card here to process it" : "drop cards anywhere in this field"}</div>}
        {scans.map((scan, i) => (
          <ScanCard
            key={scan.scan_id}
            scan={scan}
            onRetried={onRetried}
            onMoved={onMoved}
            draggable={(scan.status === "queued" && (canReorder || canProcess)) || ((scan.status === "failed" || scan.status === "processing") && canMove)}
            deleteMode={deleteMode}
            deleting={deletingScan === scan.scan_id}
            onDelete={canDelete ? onDelete : undefined}
            onDropBefore={canReorder ? onDropBefore : undefined}
            compact={compact}
            displayStatus={boardStatus}
            style={{ animationDelay: `${Math.min(i * STAGGER_STEP_MS, MAX_STAGGER_MS)}ms` }}
          />
        ))}
      </div>
    </div>
  );
}
