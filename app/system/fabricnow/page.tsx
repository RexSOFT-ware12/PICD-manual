"use client";

import { useEffect, useRef, useState } from "react";
import AppShell from "@/components/AppShell";
import {
  ApiError,
  fetchFabricNowConfig,
  loadSettings,
  updateFabricNowConfig,
  type FabricNowConfig,
} from "@/lib/api";

const defaultConfig: FabricNowConfig = {
  api_url: process.env.NEXT_PUBLIC_FABRICNOW_API_URL || "https://stream-sell.de.r.appspot.com",
  company_id: "",
  google_client_id:
    process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ||
    "644454908483-j1p3b4kehp0f5mnad7ptn5nvio4i3kmf.apps.googleusercontent.com",
  api_key_configured: false,
};

export default function FabricNowSettingsPage() {
  const [config, setConfig] = useState(defaultConfig);
  const apiKeyRef = useRef<HTMLInputElement>(null);
  const [clearApiKey, setClearApiKey] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const settings = loadSettings();
    if (!settings.baseUrl) {
      setError("Configure the PICD backend connection before editing integration settings.");
      setLoading(false);
      return;
    }
    fetchFabricNowConfig(settings)
      .then((loaded) => {
        if (!cancelled) setConfig({
          ...defaultConfig,
          ...loaded,
          api_url: loaded.api_url || defaultConfig.api_url,
          google_client_id: loaded.google_client_id || defaultConfig.google_client_id,
        });
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof ApiError
          ? `${e.message}. The PICD backend needs the FabricNow settings endpoint described in GARMENT_EXTRACTOR_BACKEND_DRAFT.md.`
          : "Could not load FabricNow settings from the PICD backend.");
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  async function save() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const apiUrl = new URL(config.api_url.trim());
      if (apiUrl.protocol !== "https:" && apiUrl.protocol !== "http:") {
        throw new Error("The FabricNow API URL must start with https:// or http://.");
      }
      if (apiUrl.protocol !== "https:" && !["localhost", "127.0.0.1", "[::1]"].includes(apiUrl.hostname)) {
        throw new Error("Use HTTPS for the FabricNow API outside local development.");
      }
      const updated = await updateFabricNowConfig(loadSettings(), {
        api_url: apiUrl.toString().replace(/\/$/, ""),
        company_id: config.company_id.trim(),
        google_client_id: config.google_client_id.trim(),
        ...(apiKeyRef.current?.value ? { api_key: apiKeyRef.current.value } : {}),
        ...(clearApiKey ? { clear_api_key: true } : {}),
      });
      setConfig({
        ...defaultConfig,
        ...updated,
        api_url: updated.api_url || apiUrl.toString().replace(/\/$/, ""),
        google_client_id: updated.google_client_id || config.google_client_id,
      });
      if (apiKeyRef.current) apiKeyRef.current.value = "";
      setClearApiKey(false);
      setMessage("FabricNow settings saved securely on the PICD backend.");
    } catch (e) {
      setError(e instanceof ApiError
        ? `${e.message}. The PICD backend must implement the secure settings endpoint; see GARMENT_EXTRACTOR_BACKEND_DRAFT.md.`
        : e instanceof Error ? e.message : "Could not save FabricNow settings.");
    } finally {
      setBusy(false);
    }
  }

  return <AppShell>
    <div className="h-full overflow-y-auto bg-paper px-7 py-6">
      <div className="mx-auto max-w-5xl">
        <header className="mb-5">
          <p className="text-[10px] font-bold uppercase tracking-[.18em] text-ink/30">Admin · Integrations</p>
          <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight">FabricNow</h1>
          <p className="mt-1 text-sm text-ink/45">Configure the FabricNow service used by Garment Extractor.</p>
        </header>

        {error && <div role="alert" className="mb-4 rounded-xl border border-brick/20 bg-brick/5 px-4 py-3 text-sm leading-5 text-brick">{error}</div>}
        {message && <div role="status" className="mb-4 rounded-xl border border-sage/20 bg-sage/5 px-4 py-3 text-sm text-sage">{message}</div>}

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <section className="rounded-2xl border border-line bg-white p-5 shadow-sm">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div><h2 className="font-display text-lg font-semibold">Connection settings</h2><p className="mt-1 text-xs leading-5 text-ink/45">These values are stored on the authenticated PICD backend. The API key is write-only and is never returned to this page.</p></div>
              <span className={`shrink-0 rounded-full px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider ${config.api_key_configured ? "bg-sage/10 text-sage" : "bg-amber/10 text-amber"}`}>{config.api_key_configured ? "Key configured" : "Key needed"}</span>
            </div>

            <div className="space-y-4">
              <label className="block text-xs font-semibold text-ink/60">FabricNow API URL
                <input type="url" inputMode="url" autoCapitalize="none" autoCorrect="off" value={config.api_url} onChange={(e) => setConfig({ ...config, api_url: e.target.value })} placeholder="https://stream-sell.de.r.appspot.com" className="mt-1.5 h-11 w-full rounded-xl border border-line bg-paper px-3 font-mono text-sm outline-none focus:border-blueprint" />
                <span className="mt-1 block text-[10px] font-normal text-ink/35">This is the FabricNow API host, not the PICD backend URL.</span>
              </label>
              <label className="block text-xs font-semibold text-ink/60">Company ID <span className="font-normal text-ink/35">(optional, if required by the API key)</span>
                <input value={config.company_id} onChange={(e) => setConfig({ ...config, company_id: e.target.value })} autoComplete="off" className="mt-1.5 h-11 w-full rounded-xl border border-line bg-paper px-3 font-mono text-sm outline-none focus:border-blueprint" />
              </label>
              <label className="block text-xs font-semibold text-ink/60">Google Client ID
                <input value={config.google_client_id} onChange={(e) => setConfig({ ...config, google_client_id: e.target.value })} autoComplete="off" className="mt-1.5 h-11 w-full rounded-xl border border-line bg-paper px-3 font-mono text-sm outline-none focus:border-blueprint" />
                <span className="mt-1 block text-[10px] font-normal text-ink/35">Client IDs are public identifiers. The documented garment endpoint uses a server-side bearer key.</span>
              </label>

              <label className="block text-xs font-semibold text-ink/60">FabricNow API key
                <input ref={apiKeyRef} type="password" onChange={() => setClearApiKey(false)} autoComplete="new-password" spellCheck={false} placeholder={config.api_key_configured ? "Enter a new key to replace the saved key" : "Paste the FabricNow API key"} className="mt-1.5 h-11 w-full rounded-xl border border-line bg-white px-3 font-mono text-sm outline-none focus:border-blueprint" />
                <span className="mt-1 block text-[10px] font-normal text-ink/35">The key is sent to the authenticated PICD settings endpoint and is not saved in browser storage. Use HTTPS outside local development.</span>
              </label>
              {config.api_key_configured && <label className="flex items-center gap-2 text-xs text-ink/55"><input type="checkbox" checked={clearApiKey} onChange={(e) => { setClearApiKey(e.target.checked); if (e.target.checked && apiKeyRef.current) apiKeyRef.current.value = ""; }} className="h-4 w-4 accent-blueprint" /> Remove the stored API key</label>}

              <div className="flex justify-end border-t border-line pt-4">
                <button type="button" onClick={() => void save()} disabled={busy || loading} className="rounded-xl bg-blueprint px-5 py-3 text-xs font-semibold text-paper shadow-sm disabled:cursor-wait disabled:opacity-50">{busy ? "Saving…" : "Save FabricNow settings"}</button>
              </div>
            </div>
          </section>

          <aside className="space-y-4">
            <section className="rounded-2xl border border-line bg-white p-5 shadow-sm">
              <p className="text-[9px] font-bold uppercase tracking-[.15em] text-ink/30">Garment Extractor</p>
              <h2 className="mt-1 font-display text-base font-semibold">API endpoint</h2>
              <code className="mt-3 block break-all rounded-lg bg-paper px-3 py-2 font-mono text-[10px] text-ink/60">POST {config.api_url.replace(/\/$/, "")}/api/garment-tool/process</code>
              <p className="mt-2 text-[10px] leading-4 text-ink/40">The PICD backend will proxy uploads and keep the bearer key server-side.</p>
            </section>
            <section className="rounded-2xl border border-blueprint/15 bg-blueprint/[.035] p-5">
              <h2 className="text-xs font-semibold text-blueprint">Backend requirement</h2>
              <p className="mt-2 text-[10px] leading-4 text-blueprint/65">The current PICD backend must add the secure configuration and upload proxy endpoints before these settings can be saved or images processed. The implementation draft is included with this change.</p>
            </section>
          </aside>
        </div>
      </div>
    </div>
  </AppShell>;
}
