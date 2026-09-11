"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import ConnectionSettingsPanel, { type ConnectionStatus } from "@/components/ConnectionSettings";
import ConfirmModal from "@/components/ConfirmModal";
import { NOTIFICATION_SOUNDS, loadNotificationSound, playNotificationSound, saveNotificationSound, type NotificationSound } from "@/lib/notificationSound";
import {
  ApiError,
  fetchHealth,
  fetchSystemState,
  fetchBodyAnalyzerConfig,
  updateBodyAnalyzerConfig,
  fetchClientEstimateConfig,
  fetchEmailSettings,
  loadSettings,
  runDiagnostics,
  saveEmailSettings,
  sendEmailTest,
  saveSettings,
  updateFeatures,
  updateSystemConfig,
  updateClientEstimateConfig,
  type ConnectionSettings,
  type ClientEstimateConfig,
  type BodyAnalyzerConfig,
  type EmailSettings,
  type HealthResponse,
  type SystemState,
} from "@/lib/api";

const featureLabels: Record<string, string> = {
  manual_processing: "Manual processing",
  auto_queue: "Automatic queue",
  drag_drop: "Drag & drop",
  auto_retry: "Automatic retry",
  priority_queue: "Priority queue",
  analytics: "Analytics",
  failure_alerts: "Failure alerts",
};

const configLabels: Record<string, string> = {
  worker_concurrency: "Worker concurrency",
  refresh_interval_seconds: "Refresh interval (sec)",
  max_retries: "Max retries",
  photoshop_timeout_seconds: "Photoshop timeout (sec)",
  illustrator_timeout_seconds: "Illustrator timeout (sec)",
  daz_timeout_seconds: "Daz timeout (sec)",
};

const estimateEllipseLabels: Record<string,string> = { chest:"Chest", bust:"Bust", upper_bust:"Upper bust", natural_waist:"Natural waist", below_waist:"Below waist", high_hip:"High hip", glute:"Glute", lower_hip:"Lower hip", thigh:"Thigh" };
const estimateSliderLabels: Record<string,string> = { weight:"Weight", body:"Body", hw1:"HW1", leg:"Leg", thigh_thickness_depth:"Thigh thickness depth", thigh_thickness_width:"Thigh thickness width", torso_width:"Torso width", chest_width:"Chest width", abdomen_width:"Abdomen width", abdomen_size:"Abdomen size", waist_size:"Waist size", waist_shape:"Waist shape" };

const events = [
  ["notify_scan_received", "New scan received", "When a new scan enters the monitor."],
  ["notify_scan_completed", "Scan completed", "When processing finishes successfully."],
  ["notify_scan_failed", "Scan failed", "When a scan finishes with an error."],
  ["notify_system_errors", "System errors", "Worker, API, or service errors."],
  ["notify_queue_warnings", "Queue warnings", "When queue health needs attention."],
] as const;

type EmailEventKey = (typeof events)[number][0];

function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const common = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (name === "mail") return <svg {...common}><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/></svg>;
  if (name === "settings") return <svg {...common}><path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-1.7 1.7-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56V20h-2.4v-.2a1.7 1.7 0 0 0-1.03-1.56 1.7 1.7 0 0 0-1.88.34l-.06.06-1.7-1.7.06-.06A1.7 1.7 0 0 0 8.46 15a1.7 1.7 0 0 0-1.56-1.03h-.2v-2.4h.2A1.7 1.7 0 0 0 8.46 10a1.7 1.7 0 0 0-.34-1.88l-.06-.06 1.7-1.7.06.06a1.7 1.7 0 0 0 1.88.34 1.7 1.7 0 0 0 1.03-1.56V5h2.4v.2a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.88-.34l.06-.06 1.7 1.7-.06.06A1.7 1.7 0 0 0 19.4 10a1.7 1.7 0 0 0 1.56 1.03h.2v2.4h-.2A1.7 1.7 0 0 0 19.4 15Z"/></svg>;
  if (name === "flag") return <svg {...common}><path d="M5 21V4"/><path d="M5 5c5-3 8 3 14 0v9c-6 3-9-3-14 0"/></svg>;
  if (name === "users") return <svg {...common}><path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2"/><circle cx="9.5" cy="7" r="4"/><path d="M17 11a4 4 0 0 0 0-8"/><path d="M21 21v-2a4 4 0 0 0-3-3.87"/></svg>;
  if (name === "database") return <svg {...common}><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v7c0 1.66 3.58 3 8 3s8-1.34 8-3V5"/><path d="M4 12v7c0 1.66 3.58 3 8 3s8-1.34 8-3v-7"/></svg>;
  if (name === "logs") return <svg {...common}><path d="M6 3h9l3 3v15H6z"/><path d="M14 3v4h4M9 12h6M9 16h6M9 8h2"/></svg>;
  if (name === "cloud") return <svg {...common}><path d="M17.5 19H9a5 5 0 1 1 1.6-9.74A6 6 0 0 1 22 11a4 4 0 0 1-4 4h-.5"/></svg>;
  if (name === "info") return <svg {...common}><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>;
  return <svg {...common}><circle cx="12" cy="12" r="9"/></svg>;
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`rounded-2xl border border-line bg-white shadow-sm ${className}`}>{children}</section>;
}

function EmailSidebar({ email }: { email: EmailSettings | null }) {
  return <aside className="space-y-3">
    <Card className="p-4">
      <div className="flex items-center gap-2"><span className="rounded-lg bg-paper p-2 text-blueprint"><Icon name="cloud" size={17}/></span><h3 className="text-xs font-semibold">Email configuration</h3></div>
      <dl className="mt-4 space-y-3 text-[10px]">
        <div className="flex justify-between gap-4"><dt className="text-ink/40">Provider</dt><dd className="text-right font-medium">Cloudflare Email Service</dd></div>
        <div className="flex justify-between gap-4"><dt className="text-ink/40">Domain</dt><dd className="text-right font-medium">picds-manual.com</dd></div>
        <div className="flex justify-between gap-4"><dt className="text-ink/40">From address</dt><dd className="max-w-[155px] truncate text-right font-medium">{email?.from_email || "alerts@picds-manual.com"}</dd></div>
        <div className="flex justify-between gap-4"><dt className="text-ink/40">Recipients</dt><dd className="font-medium">{email?.recipients.length ?? 0}</dd></div>
        <div className="flex items-center justify-between gap-4"><dt className="text-ink/40">Status</dt><dd className={`flex items-center gap-1.5 font-semibold ${email?.cloudflare_configured ? "text-sage" : "text-amber"}`}><span className="h-1.5 w-1.5 rounded-full bg-current"/>{email?.cloudflare_configured ? "Connected" : "Setup needed"}</dd></div>
      </dl>
    </Card>
    <Card className="p-4">
      <h3 className="text-xs font-semibold">Quick info</h3>
      <ul className="mt-3 space-y-3 text-[10px] leading-4 text-ink/50">
        {[
          "The domain is onboarded with Cloudflare Email Service.",
          "The API token stays securely on the backend.",
          "You can add multiple notification recipients.",
          "Email sending is asynchronous and will not block the scan queue.",
        ].map(item => <li key={item} className="flex gap-2"><span className="mt-1 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full bg-sage/15 text-sage">✓</span><span>{item}</span></li>)}
      </ul>
    </Card>
    <div className="rounded-2xl border border-blueprint/15 bg-[#edf6ff] p-4">
      <div className="flex gap-2.5"><span className="text-blueprint"><Icon name="info" size={18}/></span><div><h3 className="text-xs font-semibold text-blueprint">Need help?</h3><p className="mt-1 text-[10px] leading-4 text-blueprint/65">For setup instructions, see EMAIL_SETUP.md in the backend package or Cloudflare Email Service documentation.</p></div></div>
    </div>
  </aside>;
}

export default function SystemPage() {
  const [state, setState] = useState<SystemState | null>(null);
  const [clientEstimate, setClientEstimate] = useState<ClientEstimateConfig | null>(null);
  const [bodyAnalyzer, setBodyAnalyzer] = useState<BodyAnalyzerConfig | null>(null);
  const [bodyAnalyzerMessage, setBodyAnalyzerMessage] = useState<string | null>(null);
  const [estimateMessage, setEstimateMessage] = useState<string | null>(null);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [email, setEmail] = useState<EmailSettings | null>(null);
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailMessage, setEmailMessage] = useState<string | null>(null);
  const [settings, setSettings] = useState<ConnectionSettings>({ baseUrl: "", apiKey: "" });
  const [diag, setDiag] = useState<{ name: string; ok: boolean; detail?: string; status?: "checking" | "done" }[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<{ kind: string; key?: string; value?: boolean } | null>(null);
  const [activeSection, setActiveSection] = useState("email");
  const [notificationSound, setNotificationSound] = useState<NotificationSound>("default");
  const loading = !!settings.baseUrl && (!state || !health || !email || !clientEstimate || !bodyAnalyzer);

  useEffect(() => { setSettings(loadSettings()); setNotificationSound(loadNotificationSound()); }, []);

  const load = useCallback(async () => {
    const s = loadSettings();
    if (!s.baseUrl) return;
    try {
      const [a, b, c, d, e] = await Promise.all([fetchSystemState(s), fetchHealth(s), fetchEmailSettings(s), fetchClientEstimateConfig(s), fetchBodyAnalyzerConfig(s)]);
      setState(a); setHealth(b); setEmail(c); setClientEstimate(d); setBodyAnalyzer(e); setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load system settings.");
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const selectSection = (id: string) => { setActiveSection(id); window.scrollTo({ top: 0, behavior: "smooth" }); };

  const control = async (k: string, v: boolean) => {
    try { setState(await updateFeatures(loadSettings(), { [k]: v })); }
    catch (e) { setError(e instanceof ApiError ? e.message : "Feature update failed."); }
  };

  const saveConfig = async () => {
    if (!state) return;
    try { setState(await updateSystemConfig(loadSettings(), state.config)); }
    catch (e) { setError(e instanceof ApiError ? e.message : "Configuration update failed."); }
  };

  const saveClientEstimate = async () => {
    if (!clientEstimate) return;
    setEstimateMessage(null);
    try {
      setClientEstimate(await updateClientEstimateConfig(loadSettings(), clientEstimate));
      setEstimateMessage("Client estimate settings saved. New scans use the updated values.");
    } catch (e) { setEstimateMessage(e instanceof ApiError ? e.message : "Client estimate settings failed to save."); }
  };

  const resetClientEstimate = async () => {
    setEstimateMessage(null);
    try {
      setClientEstimate(await updateClientEstimateConfig(loadSettings(), { _reset: true }));
      setEstimateMessage("Client estimate defaults restored.");
    } catch (e) { setEstimateMessage(e instanceof ApiError ? e.message : "Could not restore client estimate defaults."); }
  };

  const saveBodyAnalyzer = async () => {
    if (!bodyAnalyzer) return;
    setBodyAnalyzerMessage(null);
    try { setBodyAnalyzer(await updateBodyAnalyzerConfig(loadSettings(), bodyAnalyzer)); setBodyAnalyzerMessage("Body analyzer settings saved."); }
    catch (e) { setBodyAnalyzerMessage(e instanceof ApiError ? e.message : "Could not save body analyzer settings."); }
  };

  const resetBodyAnalyzer = async () => {
    setBodyAnalyzerMessage(null);
    try { setBodyAnalyzer(await updateBodyAnalyzerConfig(loadSettings(), { _reset: true })); setBodyAnalyzerMessage("Body analyzer defaults restored."); }
    catch (e) { setBodyAnalyzerMessage(e instanceof ApiError ? e.message : "Could not restore body analyzer defaults."); }
  };

  const diagnostics = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await runDiagnostics(loadSettings());
      const checks = result.checks;
      setDiag(checks.map(x => ({ ...x, status: "checking" as const })));
      for (let i = 0; i < checks.length; i++) {
        await new Promise(resolve => window.setTimeout(resolve, 420));
        setDiag(prev => prev ? prev.map((x, j) => j === i ? { ...checks[i], status: "done" as const } : x) : prev);
      }
    }
    catch (e) { setError(e instanceof ApiError ? e.message : "Diagnostics failed."); setDiag(null); }
    finally { setBusy(false); }
  };

  const saveEmail = async () => {
    if (!email) return;
    const recipients = email.recipients.map(x => x.trim()).filter(Boolean);
    setEmailBusy(true); setEmailMessage(null);
    try { setEmail(await saveEmailSettings(loadSettings(), { ...email, recipients })); setEmailMessage("Email settings saved."); }
    catch (e) { setEmailMessage(e instanceof ApiError ? e.message : "Could not save email settings."); }
    finally { setEmailBusy(false); }
  };

  const testEmail = async () => {
    setEmailBusy(true); setEmailMessage(null);
    try { await sendEmailTest(loadSettings()); setEmailMessage("Test email sent successfully."); }
    catch (e) { setEmailMessage(e instanceof ApiError ? e.message : "Test email failed."); }
    finally { setEmailBusy(false); }
  };

  const addRecipient = () => setEmail(email ? { ...email, recipients: [...email.recipients, ""] } : email);

  const removeRecipient = async (index: number) => {
    if (!email || emailBusy) return;
    const previous = email;
    const next = { ...email, recipients: email.recipients.filter((_, j) => j !== index) };
    setEmail(next);
    setEmailBusy(true);
    setEmailMessage(null);
    try {
      const recipients = next.recipients.map(x => x.trim()).filter(Boolean);
      const saved = await saveEmailSettings(loadSettings(), { ...next, recipients });
      setEmail(saved);
      setEmailMessage("Recipient removed and saved.");
    } catch (e) {
      setEmail(previous);
      setEmailMessage(e instanceof ApiError ? e.message : "Could not remove recipient.");
    } finally {
      setEmailBusy(false);
    }
  };
  const connectionStatus: ConnectionStatus = health?.status === "ok" ? "ok" : settings.baseUrl ? "error" : "disconnected";
  const save = (s: ConnectionSettings) => { saveSettings(s); setSettings(s); load(); };

  const confirmPending = async () => {
    if (!pending) return;
    const p = pending; setPending(null);
    if (p.kind.startsWith("feature:")) { await control(p.key!, p.value!); return; }
    await saveConfig();
  };

  const emailEnabledCount = useMemo(() => email ? events.filter(([k]) => email[k]).length : 0, [email]);

  return <AppShell>
    <div className="h-full overflow-y-auto bg-paper px-7 py-6">
      <div className="mx-auto max-w-[1400px]">
        <header className="mb-5 flex items-start justify-between gap-6">
          <div><p className="text-[10px] font-bold uppercase tracking-[.18em] text-ink/30">Admin</p><h1 className="mt-1 font-display text-3xl font-semibold tracking-tight">System Settings</h1><p className="mt-1 text-sm text-ink/45">Configure application settings, email notifications and system preferences.</p></div>
          <button onClick={load} className="rounded-xl border border-line bg-white px-4 py-2.5 text-xs font-semibold text-ink/60 shadow-sm transition hover:border-ink/20 hover:text-ink">Refresh</button>
        </header>

        {error && <div className="mb-4 rounded-xl border border-brick/20 bg-brick/10 px-4 py-3 text-sm text-brick">{error}</div>}

        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-white px-3 py-2 shadow-sm">
          {[
            ["email", "Email Notifications"],
            ["sound", "Notification Sound"],
            ["general", "General Settings"],
            ["features", "Feature Flags"],
            ["estimate", "Client Estimate"],
            ["body", "Body Analyzer"],
            ["access", "Users & Access"],
            ["database", "Database"],
            ["logs", "Logs"],
          ].map(([id, label]) => (
            <button key={id} onClick={() => selectSection(id)} className={`rounded-lg px-3 py-2 text-[10px] font-semibold transition ${activeSection === id ? "bg-blueprint text-paper" : "text-ink/50 hover:bg-paper hover:text-ink"}`}>{label}</button>
          ))}
        </div>

        {loading ? <div className="space-y-4">{Array.from({length:4}).map((_,i)=><div key={i} className="animate-pulse rounded-2xl border border-line bg-white p-6"><div className="h-5 w-48 rounded bg-ink/[.06]"/><div className="mt-3 h-3 w-80 rounded bg-ink/[.04]"/><div className="mt-6 grid grid-cols-2 gap-3"><div className="h-10 rounded-lg bg-ink/[.035]"/><div className="h-10 rounded-lg bg-ink/[.035]"/></div><div className="mt-4 h-20 rounded-xl bg-ink/[.035]"/></div>)}</div> : <div className="min-w-0 space-y-4">
            <Card className={`overflow-hidden ${activeSection === "email" ? "" : "hidden"}`}>
              <div id="system-email" className={`scroll-mt-5 ${activeSection !== "email" ? "hidden" : ""} border-b border-line px-5 py-5`}>
                <div className="flex items-start justify-between gap-5">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="rounded-xl bg-[#e7f1ff] p-2.5 text-blueprint"><Icon name="mail" size={22}/></div>
                    <div><h2 className="font-display text-lg font-semibold">Email Notifications</h2><p className="mt-1 max-w-2xl text-xs leading-5 text-ink/45">Cloudflare Email Service sends scan and system notifications from your domain. The Cloudflare API token stays secure on the backend and is never stored in the dashboard.</p></div>
                  </div>
                  <span className={`shrink-0 rounded-full px-3 py-2 text-[9px] font-bold tracking-wide ${email?.cloudflare_configured ? "bg-sage/10 text-sage" : "bg-amber/10 text-amber"}`}>{email?.cloudflare_configured ? "CLOUDFLARE READY" : "SETUP NEEDED"}</span>
                </div>
              </div>

              {email && <div className="grid grid-cols-[minmax(0,1fr)_250px] gap-6 px-5 py-5">
                <div className="min-w-0 space-y-5">
                  <label className="flex items-center justify-between rounded-xl border border-blueprint/15 bg-[#f6faff] px-4 py-3">
                    <span><b className="text-xs">Enable email notifications</b><span className="ml-2 text-[10px] text-ink/35">Cloudflare Email Service</span></span>
                    <input aria-label="Enable email notifications" type="checkbox" checked={email.enabled} onChange={e => setEmail({ ...email, enabled: e.target.checked })} className="h-4 w-4 accent-blueprint" />
                  </label>

                  <div className="grid grid-cols-2 gap-3">
                    <label className="text-[11px] font-semibold text-ink/55">From email<input value={email.from_email} onChange={e => setEmail({ ...email, from_email: e.target.value })} className="mt-1.5 h-10 w-full rounded-lg border border-line bg-white px-3 text-xs font-medium outline-none transition focus:border-blueprint/50" /></label>
                    <label className="text-[11px] font-semibold text-ink/55">Sender name<input value={email.from_name} onChange={e => setEmail({ ...email, from_name: e.target.value })} className="mt-1.5 h-10 w-full rounded-lg border border-line bg-white px-3 text-xs font-medium outline-none transition focus:border-blueprint/50" /></label>
                  </div>

                  <div>
                    <div className="mb-2 flex items-center justify-between"><div><span className="text-xs font-semibold">Recipients</span><span className="ml-2 text-[10px] text-ink/35">{email.recipients.length} configured</span></div><button onClick={addRecipient} className="rounded-lg border border-blueprint/25 bg-white px-3 py-1.5 text-[10px] font-bold text-blueprint transition hover:bg-[#f3f8ff]">+ Add recipient</button></div>
                    <div className="rounded-xl border border-line bg-paper/40">
                      <div className="max-h-[220px] overflow-y-auto p-1.5 scrollbar-thin">
                        {email.recipients.map((r, i) => <div key={`${i}-${r}`} className="group flex items-center gap-2 border-b border-line/70 px-2 py-1.5 last:border-0">
                          <span className="cursor-grab px-1 text-ink/20">⋮⋮</span>
                          <input type="email" value={r} onChange={e => { const a = [...email.recipients]; a[i] = e.target.value; setEmail({ ...email, recipients: a }); }} placeholder="name@example.com" className="min-w-0 flex-1 bg-transparent px-1 py-2 text-xs outline-none" />
                          <button aria-label={`Remove recipient ${i + 1}`} onClick={() => removeRecipient(i)} disabled={emailBusy} className="rounded-lg px-2 py-1.5 text-[10px] font-semibold text-ink/30 opacity-60 transition hover:bg-brick/10 hover:text-brick hover:opacity-100">Remove</button>
                        </div>)}
                        {email.recipients.length === 0 && <div className="px-3 py-5 text-center text-[10px] text-ink/35">No recipients configured. Add an email address above.</div>}
                      </div>
                    </div>
                    <p className="mt-1.5 text-[9px] text-ink/30">Add as many recipients as you need. The list scrolls inside the panel so the settings page stays stable.</p>
                  </div>

                  <div>
                    <div className="mb-2 flex items-end justify-between"><div><p className="text-xs font-semibold">Notification events</p><p className="mt-0.5 text-[10px] text-ink/35">Choose which events trigger an email.</p></div><span className="text-[9px] font-semibold text-ink/30">{emailEnabledCount}/{events.length} enabled</span></div>
                    <div className="grid grid-cols-2 gap-2">{events.map(([k, label, desc]) => <label key={k} className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-line bg-white px-3 py-2.5 transition hover:border-blueprint/20"><input type="checkbox" checked={email[k as EmailEventKey]} onChange={e => setEmail({ ...email, [k]: e.target.checked })} className="mt-0.5 h-4 w-4 shrink-0 accent-blueprint"/><span><span className="block text-[11px] font-semibold">{label}</span><span className="mt-0.5 block text-[9px] leading-4 text-ink/35">{desc}</span></span></label>)}</div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
                    <button disabled={emailBusy} onClick={saveEmail} className="rounded-lg bg-blueprint px-4 py-2.5 text-[11px] font-bold text-paper shadow-sm transition hover:brightness-110 disabled:opacity-40">Save email settings</button>
                    <button disabled={emailBusy || !email.recipients.filter(Boolean).length} onClick={testEmail} className="rounded-lg border border-line bg-white px-4 py-2.5 text-[11px] font-bold text-ink/60 transition hover:border-ink/20 disabled:opacity-40">Send test email</button>
                    <span className={`text-[10px] ${emailMessage?.includes("failed") || emailMessage?.includes("Could") ? "text-brick" : "text-ink/40"}`}>{emailMessage || ""}</span>
                  </div>
                </div>
                <EmailSidebar email={email} />
              </div>}
            </Card>

            <div id="system-sound" className={`scroll-mt-5 ${activeSection !== "sound" ? "hidden" : ""}`}><Card className="p-5">
              <div className="flex items-start justify-between gap-6">
                <div><h2 className="font-display font-semibold">Notification sound</h2><p className="mt-1 text-xs leading-5 text-ink/40">Choose the sound played when a new dashboard notification arrives. Your choice is saved on this browser.</p></div>
                <button onClick={() => playNotificationSound("incoming", notificationSound)} disabled={notificationSound === "silent"} className="shrink-0 rounded-lg border border-line bg-white px-3 py-2 text-[10px] font-bold text-ink/60 transition hover:border-blueprint/30 hover:text-blueprint disabled:cursor-not-allowed disabled:opacity-40">Test sound</button>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                {NOTIFICATION_SOUNDS.map(option => <button key={option.value} onClick={() => { setNotificationSound(option.value); saveNotificationSound(option.value); if (option.value !== "silent") playNotificationSound("incoming", option.value); }} className={`flex items-center justify-between rounded-xl border px-3 py-3 text-left transition ${notificationSound === option.value ? "border-blueprint/40 bg-[#f6faff]" : "border-line bg-white hover:border-blueprint/20"}`}>
                  <span><span className="block text-[11px] font-semibold">{option.label}</span><span className="mt-0.5 block text-[9px] leading-4 text-ink/35">{option.description}</span></span>
                  <span className={`ml-3 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${notificationSound === option.value ? "border-blueprint bg-blueprint" : "border-ink/15"}`}>{notificationSound === option.value && <span className="h-1.5 w-1.5 rounded-full bg-paper"/>}</span>
                </button>)}
              </div>
            </Card></div>

            <div id="system-general" className={`scroll-mt-5 ${activeSection !== "general" ? "hidden" : ""}`}><Card className="p-5"><div className="mb-4 flex items-start justify-between"><div><h2 className="font-display font-semibold">General settings</h2><p className="mt-1 text-xs text-ink/40">Backend connection used by the authenticated desktop dashboard.</p></div><ConnectionSettingsPanel settings={settings} status={connectionStatus} onSave={save}/></div></Card></div>

            <div id="system-features" className={`scroll-mt-5 ${activeSection !== "features" ? "hidden" : ""}`}><Card className="p-5"><h2 className="font-display font-semibold">Feature flags</h2><p className="mt-1 text-xs leading-5 text-ink/40">Turn optional operational capabilities on or off without editing source code. Automatic queue is OFF by default; when enabled, the next queued scan starts only after the current scan finishes.</p><div className="mt-4 grid grid-cols-2 gap-2">{state && Object.entries(state.features).map(([k, v]) => <button key={k} onClick={() => setPending({ kind: `feature:${k}`, key: k, value: !v })} className="flex items-center justify-between rounded-xl border border-line px-3 py-3 text-xs transition hover:border-blueprint/20"><span>{featureLabels[k] ?? k}</span><span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${v ? "bg-sage/10 text-sage" : "bg-ink/5 text-ink/35"}`}>{v ? "ON" : "OFF"}</span></button>)}</div></Card></div>

            <div id="system-estimate" className={`scroll-mt-5 ${activeSection !== "estimate" ? "hidden" : ""}`}><Card className="overflow-hidden">
              <div className="border-b border-line px-5 py-5 flex items-start justify-between gap-5"><div><h2 className="font-display font-semibold">Client estimate configuration</h2><p className="mt-1 max-w-3xl text-xs leading-5 text-ink/40">Tune the client-estimate calculation without editing Python. These values control state thresholds, ellipse perimeter corrections, slider percentages and safety limits. Changes apply to new processing runs.</p></div><div className="flex shrink-0 gap-2"><button onClick={resetClientEstimate} className="rounded-lg border border-line bg-white px-3 py-2 text-[11px] font-semibold text-ink/55">Restore defaults</button><button onClick={saveClientEstimate} disabled={!clientEstimate} className="rounded-lg bg-blueprint px-3 py-2 text-[11px] font-semibold text-paper disabled:opacity-40">Save estimate settings</button></div></div>
              {clientEstimate && <div className="space-y-5 px-5 py-5">
                <div><h3 className="text-xs font-semibold">State selection thresholds</h3><p className="mt-1 text-[10px] text-ink/35">Ratios used to decide between Gen8, HW2 and HW3 families.</p><div className="mt-3 grid grid-cols-2 gap-3">{Object.entries(clientEstimate.state_selection).map(([k,v])=><label key={k} className="text-[11px] font-semibold text-ink/55">{k === "hw3_width_ratio_limit" ? "HW3 glute width / circumference limit" : "HW2 high-hip / glute-width limit"}<input type="number" step="0.01" value={v} onChange={e=>setClientEstimate({...clientEstimate,state_selection:{...clientEstimate.state_selection,[k]:Number(e.target.value)}})} className="mt-1.5 h-10 w-full rounded-lg border border-line bg-white px-3 text-xs font-mono outline-none focus:border-blueprint/50"/></label>)}</div></div>
                <div><h3 className="text-xs font-semibold">Ellipse perimeter adjustments</h3><p className="mt-1 text-[10px] text-ink/35">Multipliers applied after the ellipse perimeter estimate. 1.00 means no correction.</p><div className="mt-3 grid grid-cols-3 gap-3">{Object.entries(clientEstimate.ellipse_adjustments).map(([k,v])=><label key={k} className="text-[11px] font-semibold text-ink/55">{estimateEllipseLabels[k] ?? k}<input type="number" step="0.001" value={v} onChange={e=>setClientEstimate({...clientEstimate,ellipse_adjustments:{...clientEstimate.ellipse_adjustments,[k]:Number(e.target.value)}})} className="mt-1.5 h-10 w-full rounded-lg border border-line bg-white px-3 text-xs font-mono outline-none focus:border-blueprint/50"/></label>)}</div></div>
                <div><h3 className="text-xs font-semibold">Optimal slider percentages</h3><p className="mt-1 text-[10px] text-ink/35">Starting slider percentages used by the ClientEstimate selection stage.</p><div className="mt-3 grid grid-cols-3 gap-3">{Object.entries(clientEstimate.slider_percentages).map(([k,v])=><label key={k} className="text-[11px] font-semibold text-ink/55">{estimateSliderLabels[k] ?? k}<input type="number" step="0.001" value={v} onChange={e=>setClientEstimate({...clientEstimate,slider_percentages:{...clientEstimate.slider_percentages,[k]:Number(e.target.value)}})} className="mt-1.5 h-10 w-full rounded-lg border border-line bg-white px-3 text-xs font-mono outline-none focus:border-blueprint/50"/></label>)}</div></div>
                <div className="grid grid-cols-[1fr_1fr] gap-5"><div><h3 className="text-xs font-semibold">Morph safety limits</h3><div className="mt-3 grid grid-cols-2 gap-3">{Object.entries(clientEstimate.morph_limits).map(([k,v])=><label key={k} className="text-[11px] font-semibold text-ink/55">{k.replaceAll("_"," ")}<input type="number" step="0.001" value={v} onChange={e=>setClientEstimate({...clientEstimate,morph_limits:{...clientEstimate.morph_limits,[k]:Number(e.target.value)}})} className="mt-1.5 h-10 w-full rounded-lg border border-line bg-white px-3 text-xs font-mono outline-none focus:border-blueprint/50"/></label>)}</div></div><div><h3 className="text-xs font-semibold">GAM fallback</h3><p className="mt-1 text-[10px] text-ink/35">Fallback value used when an active GAM circumference value is unavailable.</p><input type="number" step="1" value={clientEstimate.gam_fallback} onChange={e=>setClientEstimate({...clientEstimate,gam_fallback:Number(e.target.value)})} className="mt-3 h-10 w-full rounded-lg border border-line bg-white px-3 text-xs font-mono outline-none focus:border-blueprint/50"/></div></div>
                {estimateMessage && <div className={`rounded-xl px-3 py-2 text-[11px] ${estimateMessage.includes("failed") || estimateMessage.includes("Could") ? "bg-brick/10 text-brick" : "bg-sage/10 text-sage"}`}>{estimateMessage}</div>}
              </div>}
            </Card></div>

            <div id="system-body" className={`scroll-mt-5 ${activeSection !== "body" ? "hidden" : ""}`}><Card className="overflow-hidden">
              <div className="border-b border-line px-5 py-5 flex items-start justify-between gap-5"><div><h2 className="font-display font-semibold">Body analyzer configuration</h2><p className="mt-1 max-w-3xl text-xs leading-5 text-ink/40">Tune safe Body Analyzer calibration and search behavior without editing Python. Changes apply to new processing runs.</p></div><div className="flex shrink-0 gap-2"><button onClick={resetBodyAnalyzer} className="rounded-lg border border-line bg-white px-3 py-2 text-[11px] font-semibold text-ink/55">Restore defaults</button><button onClick={saveBodyAnalyzer} disabled={!bodyAnalyzer} className="rounded-lg bg-blueprint px-3 py-2 text-[11px] font-semibold text-paper disabled:opacity-40">Save analyzer settings</button></div></div>
              {bodyAnalyzer && <div className="space-y-5 px-5 py-5">
                <div><h3 className="text-xs font-semibold">Best-fit search</h3><p className="mt-1 text-[10px] text-ink/35">Controls the morph sweep used when selecting the closest body shape.</p><div className="mt-3 grid grid-cols-3 gap-3">{Object.entries(bodyAnalyzer.search).map(([k,v])=><label key={k} className="text-[11px] font-semibold text-ink/55">{k.replaceAll("_"," ")}<input type="number" step="0.001" value={v} onChange={e=>setBodyAnalyzer({...bodyAnalyzer,search:{...bodyAnalyzer.search,[k]:Number(e.target.value)}})} className="mt-1.5 h-10 w-full rounded-lg border border-line bg-white px-3 text-xs font-mono outline-none focus:border-blueprint/50"/></label>)}</div></div>
                <div><h3 className="text-xs font-semibold">Bust adjustment</h3><p className="mt-1 text-[10px] text-ink/35">Calibration coefficients used by the bust morph conversion.</p><div className="mt-3 grid grid-cols-4 gap-3">{Object.entries(bodyAnalyzer.bust_adjustment).map(([k,v])=><label key={k} className="text-[11px] font-semibold text-ink/55">{k.replaceAll("_"," ")}<input type="number" step="0.001" value={v} onChange={e=>setBodyAnalyzer({...bodyAnalyzer,bust_adjustment:{...bodyAnalyzer.bust_adjustment,[k]:Number(e.target.value)}})} className="mt-1.5 h-10 w-full rounded-lg border border-line bg-white px-3 text-xs font-mono outline-none focus:border-blueprint/50"/></label>)}</div></div>
                <div><h3 className="text-xs font-semibold">Height conversion</h3><div className="mt-3 grid grid-cols-2 gap-3">{Object.entries(bodyAnalyzer.height_conversion).map(([k,v])=><label key={k} className="text-[11px] font-semibold text-ink/55">{k.replaceAll("_"," ")}<input type="number" step="0.1" value={v} onChange={e=>setBodyAnalyzer({...bodyAnalyzer,height_conversion:{...bodyAnalyzer.height_conversion,[k]:Number(e.target.value)}})} className="mt-1.5 h-10 w-full rounded-lg border border-line bg-white px-3 text-xs font-mono outline-none focus:border-blueprint/50"/></label>)}</div></div>
                <div><h3 className="text-xs font-semibold">Body defaults</h3><p className="mt-1 text-[10px] text-ink/35">Fallback values used when source client measurements are unavailable.</p><div className="mt-3 grid grid-cols-4 gap-3">{Object.entries(bodyAnalyzer.body_defaults).map(([k,v])=><label key={k} className="text-[11px] font-semibold text-ink/55">{k.replaceAll("_"," ")}<input type="number" step="0.1" value={v} onChange={e=>setBodyAnalyzer({...bodyAnalyzer,body_defaults:{...bodyAnalyzer.body_defaults,[k]:Number(e.target.value)}})} className="mt-1.5 h-10 w-full rounded-lg border border-line bg-white px-3 text-xs font-mono outline-none focus:border-blueprint/50"/></label>)}</div></div>
                <div><h3 className="text-xs font-semibold">Shape selection</h3><div className="mt-3 grid grid-cols-2 gap-3">{Object.entries(bodyAnalyzer.shape_selection).map(([k,v])=><label key={k} className="flex items-center justify-between rounded-xl border border-line bg-white px-3 py-3 text-[11px] font-semibold text-ink/55">{k.replaceAll("_"," ")}{typeof v === "boolean" ? <input type="checkbox" checked={v} onChange={e=>setBodyAnalyzer({...bodyAnalyzer,shape_selection:{...bodyAnalyzer.shape_selection,[k]:e.target.checked}})} className="h-4 w-4 accent-blueprint"/> : <input type="number" min="1" step="1" value={v} onChange={e=>setBodyAnalyzer({...bodyAnalyzer,shape_selection:{...bodyAnalyzer.shape_selection,[k]:Number(e.target.value)}})} className="ml-3 h-9 w-28 rounded-lg border border-line bg-paper px-3 text-xs font-mono outline-none focus:border-blueprint"/>}</label>)}</div></div>
                {bodyAnalyzerMessage && <div className={`rounded-xl px-3 py-2 text-[11px] ${bodyAnalyzerMessage.includes("Could") ? "bg-brick/10 text-brick" : "bg-sage/10 text-sage"}`}>{bodyAnalyzerMessage}</div>}
              </div>}
            </Card></div>

            <div id="system-access" className={`scroll-mt-5 ${activeSection !== "access" ? "hidden" : ""}`}><Card className="p-5"><h2 className="font-display font-semibold">Users & access</h2><p className="mt-1 text-xs text-ink/40">Admin accounts and server-side permissions are managed from the Admin accounts page.</p></Card></div>
            <div id="system-database" className={`scroll-mt-5 ${activeSection !== "database" ? "hidden" : ""}`}><Card className="p-5"><h2 className="font-display font-semibold">Database</h2><p className="mt-1 text-xs text-ink/40">MongoDB powers persistent scan, alert and authentication storage. Connection secrets remain on the backend.</p></Card></div>

            <div id="system-logs" className={`scroll-mt-5 ${activeSection !== "logs" ? "hidden" : ""}`}><Card className="p-5"><div className="flex items-center justify-between"><div><h2 className="font-display font-semibold">Diagnostics & logs</h2><p className="mt-1 text-xs text-ink/40">Run live checks against API, MongoDB, queue, worker and scan storage.</p></div><button disabled={busy || !settings.baseUrl} onClick={diagnostics} className="rounded-lg border border-line px-3 py-2 text-[11px] font-semibold text-ink/60 disabled:opacity-40">{busy ? "Running checks…" : "Run full diagnostic"}</button></div>{busy && <div className="mt-4 rounded-xl border border-blueprint/15 bg-blueprint/5 px-4 py-3"><div className="flex items-center gap-3"><span className="h-4 w-4 animate-spin rounded-full border-2 border-blueprint/20 border-t-blueprint"/><div><p className="text-xs font-semibold text-blueprint">Live diagnostic in progress</p><p className="mt-0.5 text-[10px] text-blueprint/55">Checking each service and recording the result.</p></div></div><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-blueprint/10"><div className="h-full w-1/3 animate-pulse rounded-full bg-blueprint"/></div></div>}{diag && <div className="mt-4 grid grid-cols-2 gap-2">{diag.map((x, i) => <div key={x.name} className={`rounded-xl border px-3 py-3 transition-all duration-300 ${x.status === "checking" ? "border-blueprint/20 bg-blueprint/5" : x.ok ? "border-sage/15 bg-sage/10" : "border-brick/15 bg-brick/10"}`}><div className={`flex items-center gap-2 text-xs font-semibold ${x.status === "checking" ? "text-blueprint" : x.ok ? "text-sage" : "text-brick"}`}>{x.status === "checking" ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-blueprint/20 border-t-blueprint"/> : <span className={x.ok ? "text-sage" : "text-brick"}>{x.ok ? "✓" : "!"}</span>}<span>{x.name}</span></div><p className="mt-1 text-[10px] leading-4 text-ink/40">{x.status === "checking" ? "Checking…" : (x.detail || (x.ok ? "Check passed." : "Check failed."))}</p></div>)}</div>}</Card></div>

            <div className={activeSection === "general" ? "" : "hidden"}><Card className="p-5"><div className="flex items-center justify-between"><div><h2 className="font-display font-semibold">Runtime configuration</h2><p className="mt-1 text-xs text-ink/40">Safe runtime settings. Secrets and source code remain protected.</p></div><button onClick={() => setPending({ kind: "config" })} className="rounded-lg bg-blueprint px-3 py-2 text-[11px] font-semibold text-paper">Save</button></div><div className="mt-4 grid grid-cols-2 gap-3">{state && Object.entries(state.config).map(([k, v]) => <label key={k} className="text-xs text-ink/55">{configLabels[k] ?? k}<input type="number" min="0" value={v} onChange={e => setState({ ...state, config: { ...state.config, [k]: Number(e.target.value) } })} className="mt-1 w-full rounded-lg border border-line bg-paper px-3 py-2 font-mono text-xs outline-none focus:border-blueprint"/></label>)}</div></Card></div>

            <p className={`pb-5 text-[10px] text-ink/30 ${activeSection === "general" ? "" : "hidden"}`}>Platform: {health?.platform ?? "—"} · Python: {health?.python ?? "—"} · Mongo configured: {health?.mongo_configured ? "yes" : "no"}</p>
          </div>}
        </div>
      </div>
    <ConfirmModal open={!!pending} title={pending?.kind.startsWith("feature:") ? "Change this feature?" : "Save runtime configuration?"} message={pending?.kind.startsWith("feature:") ? "This changes an operational capability for the live dashboard. Confirm before applying the change." : "These runtime values will apply to the running backend. Review the values before saving."} confirmLabel="Apply change" busy={busy} onConfirm={() => void confirmPending()} onCancel={() => !busy && setPending(null)} />
  </AppShell>;
}
