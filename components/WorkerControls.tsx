"use client";

import { useEffect, useState } from "react";
import {
  fetchSystemInfo,
  pauseWorker,
  resumeWorker,
  restartWorker,
  ApiError,
  type ConnectionSettings as Settings,
  type SystemInfo,
} from "@/lib/api";

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export default function WorkerControls({
  settings,
  paused,
  onPausedChange,
}: {
  settings: Settings;
  paused: boolean;
  onPausedChange: (paused: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<SystemInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !settings.baseUrl) return;
    let cancelled = false;
    fetchSystemInfo(settings)
      .then((data) => !cancelled && setInfo(data))
      .catch(() => !cancelled && setInfo(null));
    return () => {
      cancelled = true;
    };
  }, [open, settings]);

  const togglePause = async () => {
    setBusy(true);
    setError(null);
    try {
      if (paused) {
        await resumeWorker(settings);
        onPausedChange(false);
      } else {
        await pauseWorker(settings);
        onPausedChange(true);
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Request failed.");
    } finally {
      setBusy(false);
    }
  };

  const handleRestart = async () => {
    setBusy(true);
    setError(null);
    try {
      await restartWorker(settings);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Request failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        title="Worker controls"
        className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition ${
          paused
            ? "border-amber/40 bg-amber/10 text-amber hover:border-amber/60"
            : "border-white/15 text-paper/70 hover:border-white/30 hover:text-paper"
        }`}
      >
        <span className={`h-1.5 w-1.5 rounded-full ${paused ? "bg-amber" : "bg-sage"}`} />
        {paused ? "worker paused" : "worker"}
      </button>
      {open && (
        <div className="animate-pop-in absolute right-0 top-10 z-20 w-80 origin-top-right rounded-lg border border-white/10 bg-[#16202f] p-4 shadow-xl">
          <p className="mb-3 font-display text-sm text-paper">Worker controls</p>

          <button
            onClick={togglePause}
            disabled={busy || !settings.baseUrl}
            className={`mb-2 w-full rounded py-1.5 text-xs font-medium transition-all active:scale-[0.98] disabled:cursor-wait disabled:opacity-50 ${
              paused ? "bg-sage text-ink hover:brightness-110" : "bg-amber text-ink hover:brightness-110"
            }`}
          >
            {paused ? "Resume worker" : "Pause worker (finish current job, take no more)"}
          </button>
          <button
            onClick={handleRestart}
            disabled={busy || !settings.baseUrl}
            className="mb-3 w-full rounded border border-white/15 py-1.5 text-xs text-paper/70 transition hover:border-white/30 hover:text-paper disabled:cursor-wait disabled:opacity-50"
          >
            Restart worker task
          </button>
          {error && <p className="mb-3 text-[11px] text-brick">{error}</p>}

          <div className="space-y-1.5 border-t border-white/10 pt-3 font-mono text-[11px] text-paper/50">
            {info ? (
              <>
                <div className="flex justify-between">
                  <span>commit</span>
                  <span className="text-paper/70">
                    {info.git.commit ?? "n/a"}
                    {info.git.dirty ? " *" : ""}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>branch</span>
                  <span className="text-paper/70">{info.git.branch ?? "n/a"}</span>
                </div>
                {info.git.last_commit_message && (
                  <p className="truncate text-paper/40" title={info.git.last_commit_message}>
                    “{info.git.last_commit_message}”
                  </p>
                )}
                <div className="flex justify-between">
                  <span>uptime</span>
                  <span className="text-paper/70">{formatUptime(info.process.uptime_seconds)}</span>
                </div>
                <div className="flex justify-between">
                  <span>queue depth</span>
                  <span className="text-paper/70">{info.worker.queue_depth}</span>
                </div>
              </>
            ) : (
              <p className="text-paper/30">{settings.baseUrl ? "loading…" : "connect a backend first"}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
