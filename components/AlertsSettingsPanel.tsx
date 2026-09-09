"use client";

import { useEffect, useState } from "react";
import {
  fetchConfig,
  updateConfig,
  testAlert,
  ApiError,
  type ConnectionSettings as Settings,
  type DashboardConfig,
} from "@/lib/api";

const DEFAULTS: DashboardConfig = {
  stuck_threshold_minutes: 20,
  alert_webhook_url: "",
  alert_on_failure: false,
  alert_on_stuck: false,
};

export default function AlertsSettingsPanel({ settings }: { settings: Settings }) {
  const [open, setOpen] = useState(false);
  const [config, setConfig] = useState<DashboardConfig>(DEFAULTS);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !settings.baseUrl) return;
    fetchConfig(settings)
      .then(setConfig)
      .catch(() => {});
  }, [open, settings]);

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const saved = await updateConfig(settings, config);
      setConfig(saved);
      setMessage("Saved.");
    } catch (e) {
      setMessage(e instanceof ApiError ? e.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  const runTest = async () => {
    setTesting(true);
    setMessage(null);
    try {
      await testAlert(settings);
      setMessage("Test alert sent.");
    } catch (e) {
      setMessage(e instanceof ApiError ? e.message : "Test failed.");
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        title="Alerts & thresholds"
        className="flex items-center gap-2 rounded-full border border-white/15 px-3 py-1.5 text-xs text-paper/70 transition hover:border-white/30 hover:text-paper"
      >
        alerts
      </button>
      {open && (
        <div className="animate-pop-in absolute right-0 top-10 z-20 w-80 origin-top-right rounded-lg border border-white/10 bg-[#16202f] p-4 shadow-xl">
          <p className="mb-3 font-display text-sm text-paper">Alerts &amp; thresholds</p>

          <label className="mb-1 block text-[11px] uppercase tracking-wide text-paper/50">
            Stuck-job threshold (minutes)
          </label>
          <input
            type="number"
            min={1}
            value={config.stuck_threshold_minutes}
            onChange={(e) => setConfig((c) => ({ ...c, stuck_threshold_minutes: Number(e.target.value) || 1 }))}
            className="mb-3 w-full rounded border border-white/15 bg-white/5 px-2 py-1.5 font-mono text-xs text-paper outline-none focus:border-amber"
          />

          <label className="mb-1 block text-[11px] uppercase tracking-wide text-paper/50">
            Alert webhook URL (Slack-compatible)
          </label>
          <input
            value={config.alert_webhook_url}
            onChange={(e) => setConfig((c) => ({ ...c, alert_webhook_url: e.target.value }))}
            placeholder="https://hooks.slack.com/services/…"
            className="mb-3 w-full rounded border border-white/15 bg-white/5 px-2 py-1.5 font-mono text-xs text-paper outline-none focus:border-amber"
          />

          <label className="mb-1.5 flex items-center gap-2 text-xs text-paper/70">
            <input
              type="checkbox"
              checked={config.alert_on_failure}
              onChange={(e) => setConfig((c) => ({ ...c, alert_on_failure: e.target.checked }))}
            />
            Alert on scan failure
          </label>
          <label className="mb-3 flex items-center gap-2 text-xs text-paper/70">
            <input
              type="checkbox"
              checked={config.alert_on_stuck}
              onChange={(e) => setConfig((c) => ({ ...c, alert_on_stuck: e.target.checked }))}
            />
            Alert on stuck scans
          </label>

          <div className="flex gap-2">
            <button
              onClick={save}
              disabled={saving || !settings.baseUrl}
              className="flex-1 rounded bg-amber py-1.5 text-xs font-medium text-ink transition-all hover:brightness-110 active:scale-[0.98] disabled:cursor-wait disabled:opacity-50"
            >
              Save
            </button>
            <button
              onClick={runTest}
              disabled={testing || !settings.baseUrl || !config.alert_webhook_url}
              className="flex-1 rounded border border-white/15 py-1.5 text-xs text-paper/70 transition hover:border-white/30 hover:text-paper disabled:cursor-wait disabled:opacity-50"
            >
              Send test
            </button>
          </div>
          {message && <p className="mt-2 text-[11px] text-paper/50">{message}</p>}
        </div>
      )}
    </div>
  );
}
