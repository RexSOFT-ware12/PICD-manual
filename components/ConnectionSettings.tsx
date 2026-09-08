"use client";

import { useState } from "react";
import type { ConnectionSettings as Settings } from "@/lib/api";

export default function ConnectionSettingsPanel({
  settings,
  onSave,
}: {
  settings: Settings;
  onSave: (s: Settings) => void;
}) {
  const [open, setOpen] = useState(false);
  const [baseUrl, setBaseUrl] = useState(settings.baseUrl);
  const [apiKey, setApiKey] = useState(settings.apiKey);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-full border border-white/15 px-3 py-1.5 text-xs text-paper/70 transition hover:border-white/30 hover:text-paper"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-amber" />
        connection
      </button>
      {open && (
        <div className="absolute left-0 top-10 z-20 w-72 rounded-lg border border-white/10 bg-[#16202f] p-4 shadow-xl">
          <p className="mb-3 font-display text-sm text-paper">
            Backend connection
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
