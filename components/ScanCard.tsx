"use client";

import Image from "next/image";
import type { ScanSummary } from "@/lib/api";

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
  queued: "border-l-slate",
  processing: "border-l-amber",
  completed: "border-l-sage",
  failed: "border-l-brick",
};

export default function ScanCard({ scan }: { scan: ScanSummary }) {
  return (
    <div
      className={`rounded-md border border-line border-l-[3px] bg-white/70 p-3 shadow-sm ${
        accentByStatus[scan.status] ?? "border-l-slate"
      }`}
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="font-mono text-[11px] text-ink/60">
          {scan.scan_id.slice(0, 8)}…
        </span>
        <span className="font-mono text-[10px] text-ink/40">
          {timeAgo(scan.status === "queued" ? scan.created_at : scan.updated_at)}
        </span>
      </div>

      {(scan.front_image_url || scan.side_image_url) && (
        <div className="mb-2 flex gap-1.5">
          {[scan.front_image_url, scan.side_image_url].map((src, i) =>
            src ? (
              <div
                key={i}
                className="relative h-16 w-12 overflow-hidden rounded bg-ink/5"
              >
                <Image
                  src={src}
                  alt={i === 0 ? "front" : "side"}
                  fill
                  sizes="48px"
                  className="object-cover"
                  unoptimized
                />
              </div>
            ) : null
          )}
        </div>
      )}

      <div className="flex items-center justify-between text-xs">
        <span className="text-ink/70">{scan.user_id ?? "unknown user"}</span>
        {scan.gender && (
          <span className="rounded-full bg-ink/5 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-ink/50">
            {scan.gender}
          </span>
        )}
      </div>

      {scan.status === "failed" && scan.error && (
        <p className="mt-2 line-clamp-2 rounded bg-brick/10 px-2 py-1 text-[11px] text-brick">
          {scan.error}
        </p>
      )}

      {scan.status === "completed" && scan.daz_template && (
        <p className="mt-2 font-mono text-[10px] text-sage">
          {scan.daz_template}
        </p>
      )}
    </div>
  );
}
