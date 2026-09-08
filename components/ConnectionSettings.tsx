"use client";

import { useState } from "react";
import type { ConnectionSettings as Settings } from "@/lib/api";

export type ConnectionStatus =
  | "disconnected" // no baseUrl configured yet
  | "connecting" // baseUrl set, first fetch hasn't resolved yet
  | "ok" // last poll succeeded recently
  | "warn" // a poll failed but we haven't crossed the stale threshold yet
  | "error"; // stale (repeated failures) or blocked on a bad API key

const dotByStatus: Record<ConnectionStatus, string> = {
  disconnected: "bg-slate",
  connecting: "bg-amber animate-pulse",
  ok: "bg-sage",
  warn: "bg-amber",
  error: "bg-brick",
};

const labelByStatus: Record<ConnectionStatus, string> = {
  disconnected: "not connected",
  connecting: "connecting…",
  ok: "connected",
  warn: "connection issue",
  error: "connection lost",
};

export default function ConnectionSettingsPanel({
  settings,
  status,
  onSave,
}: {
  settings: Settings;
  status: ConnectionStatus;
  onSave: (s: Settings) => void;
}) {
  const [open, setOpen] = useState(false);
  const [baseUrl, setBaseUrl] = useState(settings.baseUrl);
  const [apiKey, setApiKey] = useState(settings.apiKey);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        title={labelByStatus[status]}
        className="flex items-center gap-2 rounded-full border border-white/15 px-3 py-1.5 text-xs text-paper/70 transition hover:border-white/30 hover:text-paper"
      >
        <span className={`h-1.5 w-1.5 rounded-full ${dotByStatus[status]}`} />
        connection
      </button>
      {open && (
        <div className="absolute left-0 top-10 z-20 w-72 rounded-lg border border-white/10 bg-[#16202f] p-4 shadow-xl">
          <p className="mb-3 flex items-center gap-2 font-display text-sm text-paper">
            Backend connection
            <span className="flex items-center gap-1 text-[10px] font-normal normal-case tracking-normal text-paper/40">
              <span className={`h-1.5 w-1.5 rounded-full ${dotByStatus[status]}`} />
              {labelByStatus[status]}
            </span>
          </p>
          <label className="mb-1 block text-[11px] uppercase tracking-wide text-paper/50">
            API base URL
          </label>
          <input
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://your-tunnel.trycloudflare.com"
            className="mb-3 w-full rounded border border-white/15 bg-white/5 px-2 py-1.5 font-mono text-xs text-paper outline-none focus:border-amber"
          />
          <label className="mb-1 block text-[11px] uppercase tracking-wide text-paper/50">
            API key (X-API-Key)
          </label>
          <input
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="optional, if SCANS_API_KEY is set"
            type="password"
            className="mb-4 w-full rounded border border-white/15 bg-white/5 px-2 py-1.5 font-mono text-xs text-paper outline-none focus:border-amber"
          />
          <button
            onClick={() => {
              onSave({ baseUrl: baseUrl.trim(), apiKey: apiKey.trim() });
              setOpen(false);
            }}
            className="w-full rounded bg-amber py-1.5 text-xs font-medium text-ink transition hover:brightness-110"
          >
            Save & reconnect
          </button>
          <p className="mt-3 text-[11px] leading-relaxed text-paper/40">
            Stored only in this browser. Point it at your tunnel URL
            (Cloudflare Tunnel / ngrok / Tailscale Funnel) — a Mac on your
            desk, not Vercel, runs the actual pipeline.
          </p>
        </div>
      )}
    </div>
  );
}
