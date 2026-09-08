"use client";

import type { ScanSummary, ScanStatus } from "@/lib/api";
import ScanCard from "./ScanCard";

const dotByStatus: Record<ScanStatus, string> = {
  queued: "bg-slate",
  processing: "bg-amber",
  completed: "bg-sage",
  failed: "bg-brick",
};

export default function Column({
  status,
  label,
  scans,
  count,
}: {
  status: ScanStatus;
  label: string;
  scans: ScanSummary[];
  count: number;
}) {
  return (
    <div className="flex min-w-0 flex-col">
      <div className="mb-3 flex items-center gap-2 px-1">
        <span className={`h-2 w-2 rounded-full ${dotByStatus[status]}`} />
        <h2 className="font-display text-sm font-semibold text-ink">
          {label}
        </h2>
        <span className="ml-auto font-mono text-xs text-ink/40">{count}</span>
      </div>
      <div className="scrollbar-thin flex max-h-[calc(100vh-180px)] flex-col gap-2 overflow-y-auto rounded-lg bg-ink/[0.03] p-2">
        {scans.length === 0 && (
          <p className="px-2 py-6 text-center text-xs text-ink/30">
            nothing here
          </p>
        )}
        {scans.map((scan) => (
          <ScanCard key={scan.scan_id} scan={scan} />
        ))}
      </div>
    </div>
  );
}
