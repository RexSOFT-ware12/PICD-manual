"use client";

import { useState } from "react";
import { bulkRetry, bulkDelete, ApiError, type ConnectionSettings as Settings } from "@/lib/api";

export default function BulkToolbar({
  settings,
  selectedIds,
  onClear,
  onDone,
}: {
  settings: Settings;
  selectedIds: string[];
  onClear: () => void;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (selectedIds.length === 0) return null;

  const summarize = (results: { ok: boolean }[]) => {
    const okCount = results.filter((r) => r.ok).length;
    return `${okCount}/${results.length} succeeded`;
  };

  const handleRetry = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const { results } = await bulkRetry(settings, selectedIds);
      setMessage(`Retry: ${summarize(results)}`);
      onDone();
    } catch (e) {
      setMessage(e instanceof ApiError ? e.message : "Bulk retry failed.");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Delete ${selectedIds.length} scan(s)? This can't be undone.`)) return;
    setBusy(true);
    setMessage(null);
    try {
      const { results } = await bulkDelete(settings, selectedIds);
      setMessage(`Delete: ${summarize(results)}`);
      onDone();
    } catch (e) {
      setMessage(e instanceof ApiError ? e.message : "Bulk delete failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="animate-fade-in-up fixed bottom-5 left-1/2 z-30 flex -translate-x-1/2 items-center gap-3 rounded-full border border-line bg-white/95 px-4 py-2 shadow-lg backdrop-blur-sm">
      <span className="text-xs font-medium text-ink/70">{selectedIds.length} selected</span>
      {message && <span className="text-xs text-ink/50">{message}</span>}
      <button
        onClick={handleRetry}
        disabled={busy}
        className="rounded-full bg-amber px-3 py-1 text-xs font-medium text-ink transition hover:brightness-110 disabled:cursor-wait disabled:opacity-50"
      >
        Retry selected
      </button>
      <button
        onClick={handleDelete}
        disabled={busy}
        className="rounded-full bg-brick/90 px-3 py-1 text-xs font-medium text-white transition hover:brightness-110 disabled:cursor-wait disabled:opacity-50"
      >
        Delete selected
      </button>
      <button onClick={onClear} className="text-xs text-ink/40 hover:text-ink/70">
        clear
      </button>
    </div>
  );
}
