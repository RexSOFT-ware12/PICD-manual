"use client";

import type { ScanSummary, ScanStatus } from "@/lib/api";
import { useAnimatedNumber } from "@/lib/useAnimatedNumber";
import ScanCard from "./ScanCard";

const dotByStatus: Record<ScanStatus, string> = {
  queued: "bg-slate",
  processing: "bg-amber",
  completed: "bg-sage",
  failed: "bg-brick",
};

// Cap the stagger so a big column doesn't take forever to finish animating in.
const MAX_STAGGER_MS = 240;
const STAGGER_STEP_MS = 30;

export default function Column({
  status,
  label,
  scans,
  count,
  onRetried,
}: {
  status: ScanStatus;
  label: string;
  scans: ScanSummary[];
  count: number;
  onRetried?: () => void;
}) {
  const animatedCount = useAnimatedNumber(count);

  return (
    <div className="flex min-w-0 animate-fade-in-up flex-col">
      <div className="mb-3 flex items-center gap-2 px-1">
        <span className="relative flex h-2 w-2">
          {status === "processing" && (
            <span
              className={`absolute inline-flex h-full w-full animate-ping rounded-full ${dotByStatus[status]} opacity-60`}
            />
          )}
          <span
            className={`relative inline-flex h-2 w-2 rounded-full ${dotByStatus[status]}`}
          />
        </span>
        <h2 className="font-display text-sm font-semibold text-ink">
          {label}
        </h2>
        <span className="ml-auto font-mono text-xs tabular-nums text-ink/40">
          {animatedCount}
        </span>
      </div>
      <div className="scrollbar-thin flex max-h-[calc(100vh-180px)] flex-col gap-2 overflow-y-auto rounded-lg bg-ink/[0.03] p-2">
        {scans.length === 0 && (
          <p className="animate-fade-in px-2 py-6 text-center text-xs text-ink/30">
            nothing here
          </p>
        )}
        {scans.map((scan, i) => (
          <ScanCard
            key={scan.scan_id}
            scan={scan}
            onRetried={onRetried}
            style={{
              animationDelay: `${Math.min(i * STAGGER_STEP_MS, MAX_STAGGER_MS)}ms`,
            }}
          />
        ))}
      </div>
    </div>
  );
}
