export type ScanStatus = "queued" | "processing" | "completed" | "failed";

export interface ScanSummary {
  scan_id: string;
  user_id: string | null;
  status: ScanStatus;
  gender: "female" | "male" | null;
  created_at: string | null;
  updated_at: string | null;
  error: string | null;
  front_image_url: string | null;
  side_image_url: string | null;
  daz_template: string | null;
  processing_started_at?: string | null;
  completed_at?: string | null;
  failed_at?: string | null;
  client_input: {
    height?: number | null;
    weight?: number | null;
    age?: number | null;
    bust?: number | null;
    chest?: number | null;
    waist?: number | null;
    hips?: number | null;
    bra_cup_size?: string | null;
  } | null;
}

export interface ScanListResponse {
  total: number;
  limit: number;
  skip: number;
  scans: ScanSummary[];
}

export interface StatsResponse {
  counts: Record<ScanStatus, number>;
  total: number;
  queue_depth: number;
  processing: boolean;
  avg_processing_seconds?: number | null;
  avg_wait_seconds?: number | null;
  completed_today?: number;
  failed_today?: number;
}

export interface ConnectionSettings {
  baseUrl: string;
  apiKey: string;
}


export interface AuthAdmin { username: string; is_super_admin: boolean; permissions: string[]; }
export interface AuthMe extends AuthAdmin {}

function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const csrf = typeof window !== "undefined" ? window.sessionStorage.getItem("picd-csrf") : null;
  return { ...extra, ...(csrf ? { "X-CSRF-Token": csrf } : {}) };
}

export async function loginAdmin(settings: ConnectionSettings, username: string, password: string) {
  if (!settings.baseUrl) throw new ApiError("No backend URL configured yet.");
  const res = await fetch(`${settings.baseUrl.replace(/\/$/, "")}/auth/login`, {
    method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }), cache: "no-store",
  });
  if (!res.ok) {
    let detail = `Login failed (${res.status})`;
    try { const b = await res.json(); if (typeof b?.detail === "string") detail = b.detail; } catch {}
    throw new ApiError(detail, res.status);
  }
  const data = await res.json() as { admin: AuthAdmin; expires_at: string; csrf_token: string };
  if (typeof window !== "undefined") window.sessionStorage.setItem("picd-csrf", data.csrf_token);
  return data;
}

export async function fetchCurrentAdmin(settings: ConnectionSettings) {
  return request<AuthMe>("/auth/me", settings);
}

export async function logoutAdmin(settings: ConnectionSettings) {
  if (!settings.baseUrl) return;
  const res = await fetch(`${settings.baseUrl.replace(/\/$/, "")}/auth/logout`, { method: "POST", credentials: "include", headers: authHeaders(), cache: "no-store" });
  if (!res.ok) { let detail = `Logout failed (${res.status})`; try { const b = await res.json(); if (typeof b?.detail === "string") detail = b.detail; } catch {} throw new ApiError(detail, res.status); }
  if (typeof window !== "undefined") window.sessionStorage.removeItem("picd-csrf");
}

export interface AdminRecord extends AuthAdmin { id: string; active: boolean; created_at: string | null; last_login_at: string | null; }
export interface AdminsResponse { items: AdminRecord[]; permissions: { key: string; label: string }[]; }
export function fetchAdmins(settings: ConnectionSettings) { return request<AdminsResponse>("/auth/admins", settings); }
export function createAdmin(settings: ConnectionSettings, body: { username: string; password: string; permissions: string[] }) { return postJson<AdminRecord>("/auth/admins", settings, body); }
export function updateAdmin(settings: ConnectionSettings, id: string, body: { active?: boolean; permissions?: string[]; password?: string }) { return patchJson<AdminRecord>(`/auth/admins/${encodeURIComponent(id)}`, settings, body); }

const SETTINGS_KEY = "picd-monitor-settings";

export function loadSettings(): ConnectionSettings {
  if (typeof window === "undefined") {
    return { baseUrl: "", apiKey: "" };
  }
  const raw = window.localStorage.getItem(SETTINGS_KEY);
  if (!raw) {
    return {
      baseUrl: process.env.NEXT_PUBLIC_API_BASE_URL ?? "",
      apiKey: "",
    };
  }
  try {
    const parsed = JSON.parse(raw) as ConnectionSettings;
    return {
      baseUrl: parsed.baseUrl || process.env.NEXT_PUBLIC_API_BASE_URL || "",
      apiKey: "",
    };
  } catch {
    return { baseUrl: process.env.NEXT_PUBLIC_API_BASE_URL ?? "", apiKey: "" };
  }
}

export function saveSettings(settings: ConnectionSettings) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

class ApiError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(
  path: string,
  settings: ConnectionSettings,
  signal?: AbortSignal
): Promise<T> {
  if (!settings.baseUrl) {
    throw new ApiError("No backend URL configured yet.");
  }
  const url = `${settings.baseUrl.replace(/\/$/, "")}${path}`;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: authHeaders(settings.apiKey ? { "X-API-Key": settings.apiKey } : {}),
      credentials: "include",
      cache: "no-store",
      signal,
    });
  } catch (e) {
    // Let AbortError propagate as-is so callers can distinguish
    // "cancelled because a newer request came in" from a real failure.
    if (e instanceof DOMException && e.name === "AbortError") {
      throw e;
    }
    throw new ApiError(
      "Couldn't reach the backend. Check the URL and that the tunnel/server is running."
    );
  }
  if (!res.ok) {
    if (res.status === 401) {
      throw new ApiError("Authentication required or session expired.", 401);
    }
    throw new ApiError(`Backend returned ${res.status}`, res.status);
  }
  return res.json() as Promise<T>;
}

export function fetchStats(settings: ConnectionSettings, signal?: AbortSignal) {
  return request<StatsResponse>("/monitor/stats", settings, signal);
}

export function fetchScans(
  settings: ConnectionSettings,
  opts: { status?: ScanStatus; q?: string; limit?: number; skip?: number; from?: string; to?: string } = {},
  signal?: AbortSignal
) {
  const params = new URLSearchParams();
  if (opts.status) params.set("status", opts.status);
  if (opts.q) params.set("q", opts.q);
  if (opts.from) params.set("from", opts.from);
  if (opts.to) params.set("to", opts.to);
  params.set("limit", String(opts.limit ?? 100));
  params.set("skip", String(opts.skip ?? 0));
  return request<ScanListResponse>(
    `/monitor/scans?${params.toString()}`,
    settings,
    signal
  );
}

export interface RetryResponse {
  scan_id: string;
  status: ScanStatus;
  queue_position?: number;
}

export async function retryScan(
  settings: ConnectionSettings,
  scanId: string,
  signal?: AbortSignal
): Promise<RetryResponse> {
  if (!settings.baseUrl) {
    throw new ApiError("No backend URL configured yet.");
  }
  const url = `${settings.baseUrl.replace(/\/$/, "")}/monitor/scans/${encodeURIComponent(
    scanId
  )}/retry`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: authHeaders(settings.apiKey ? { "X-API-Key": settings.apiKey } : {}),
      credentials: "include",
      signal,
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") {
      throw e;
    }
    throw new ApiError(
      "Couldn't reach the backend. Check the URL and that the tunnel/server is running."
    );
  }
  if (!res.ok) {
    if (res.status === 401) {
      throw new ApiError("Authentication required or session expired.", 401);
    }
    // The retry endpoint returns a useful {detail} on 404/409/422 —
    // surface that instead of just the status code where we can.
    let detail = `Backend returned ${res.status}`;
    try {
      const body = await res.json();
      if (typeof body?.detail === "string") detail = body.detail;
    } catch {
      // body wasn't JSON — fall back to the generic message above
    }
    throw new ApiError(detail, res.status);
  }
  return res.json() as Promise<RetryResponse>;
}

export function isAbortError(e: unknown): boolean {
  return e instanceof DOMException && e.name === "AbortError";
}

export { ApiError };

export interface TriggerResponse {
  scan_id: string;
  status: ScanStatus;
}

export async function triggerNextScan(
  settings: ConnectionSettings
): Promise<TriggerResponse> {
  if (!settings.baseUrl) throw new ApiError("No backend URL configured yet.");
  const url = `${settings.baseUrl.replace(/\/$/, "")}/monitor/queue/trigger-next`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: authHeaders(settings.apiKey ? { "X-API-Key": settings.apiKey } : {}),
      credentials: "include",
      cache: "no-store",
    });
  } catch {
    throw new ApiError(
      "Couldn't reach the backend. Check the URL and that the tunnel/server is running."
    );
  }
  if (!res.ok) {
    let detail = `Backend returned ${res.status}`;
    try {
      const body = await res.json();
      if (typeof body?.detail === "string") detail = body.detail;
    } catch {}
    throw new ApiError(detail, res.status);
  }
  return res.json() as Promise<TriggerResponse>;
}


export interface ProcessScanResponse {
  scan_id: string;
  status: ScanStatus;
  message?: string;
}

export async function processSelectedScan(
  settings: ConnectionSettings,
  scanId: string,
  signal?: AbortSignal
): Promise<ProcessScanResponse> {
  if (!settings.baseUrl) throw new ApiError("No backend URL configured yet.");
  const url = `${settings.baseUrl.replace(/\/$/, "")}/monitor/scans/${encodeURIComponent(scanId)}/process`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: authHeaders(settings.apiKey ? { "X-API-Key": settings.apiKey } : {}),
      credentials: "include",
      cache: "no-store",
      signal,
    });
    if (!res.ok) {
      let detail = `Backend returned ${res.status}`;
      try { const body = await res.json(); if (typeof body?.detail === "string") detail = body.detail; } catch {}
      throw new ApiError(detail, res.status);
    }
    return res.json() as Promise<ProcessScanResponse>;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    throw new ApiError("Couldn't reach the backend. Check the URL and that the tunnel/server is running.");
  }
}

export interface MoveScanResponse {
  scan_id: string;
  status: ScanStatus;
  queue_position?: number | null;
  message?: string;
}

export async function moveScanToQueue(
  settings: ConnectionSettings,
  scanId: string,
  signal?: AbortSignal
): Promise<MoveScanResponse> {
  if (!settings.baseUrl) throw new ApiError("No backend URL configured yet.");
  const url = `${settings.baseUrl.replace(/\/$/, "")}/monitor/scans/${encodeURIComponent(scanId)}/move-to-queue`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: authHeaders(settings.apiKey ? { "X-API-Key": settings.apiKey } : {}),
      credentials: "include",
      cache: "no-store",
      signal,
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    throw new ApiError("Couldn't reach the backend. Check the URL and that the tunnel/server is running.");
  }
  if (!res.ok) {
    let detail = `Backend returned ${res.status}`;
    try {
      const body = await res.json();
      if (typeof body?.detail === "string") detail = body.detail;
    } catch {}
    throw new ApiError(detail, res.status);
  }
  return res.json() as Promise<MoveScanResponse>;
}

export interface AnalyticsBucket {
  key: string;
  label: string;
  total: number;
  queued: number;
  processing: number;
  completed: number;
  failed: number;
}

export interface AnalyticsResponse {
  from: string;
  to: string;
  total: number;
  counts: Record<ScanStatus, number>;
  daily: AnalyticsBucket[];
  weekly: AnalyticsBucket[];
  monthly: AnalyticsBucket[];
}

export async function fetchAnalytics(
  settings: ConnectionSettings,
  from?: string,
  to?: string,
  signal?: AbortSignal
) {
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  return request<AnalyticsResponse>(`/monitor/analytics?${params.toString()}`, settings, signal);
}

export interface DeleteScanResponse {
  scan_id: string;
  status: ScanStatus;
  deleted: boolean;
  pending: boolean;
  message?: string;
}

export async function deleteScan(settings: ConnectionSettings, scanId: string, signal?: AbortSignal): Promise<DeleteScanResponse> {
  if (!settings.baseUrl) throw new ApiError("No backend URL configured yet.");
  const url = `${settings.baseUrl.replace(/\/$/, "")}/monitor/scans/${encodeURIComponent(scanId)}`;
  try {
    const res = await fetch(url, {
      method: "DELETE",
      headers: authHeaders(settings.apiKey ? { "X-API-Key": settings.apiKey } : {}),
      credentials: "include",
      cache: "no-store",
      signal,
    });
    if (!res.ok) {
      let detail = `Backend returned ${res.status}`;
      try { const body = await res.json(); if (typeof body?.detail === "string") detail = body.detail; } catch {}
      throw new ApiError(detail, res.status);
    }
    return res.json() as Promise<DeleteScanResponse>;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    throw new ApiError("Couldn't reach the backend. Check the URL and that the tunnel/server is running.");
  }
}

export interface ReorderScanResponse { scan_id: string; status: "queued"; queue_order: number; }

export async function reorderScan(settings: ConnectionSettings, scanId: string, beforeScanId?: string): Promise<ReorderScanResponse> {
  if (!settings.baseUrl) throw new ApiError("No backend URL configured yet.");
  const params = beforeScanId ? `?before_scan_id=${encodeURIComponent(beforeScanId)}` : "";
  const url = `${settings.baseUrl.replace(/\/$/, "")}/monitor/scans/${encodeURIComponent(scanId)}/reorder${params}`;
  try {
    const res = await fetch(url, { method: "POST", headers: settings.apiKey ? { "X-API-Key": settings.apiKey } : undefined, cache: "no-store" });
    if (!res.ok) {
      let detail = `Backend returned ${res.status}`;
      try { const body = await res.json(); if (typeof body?.detail === "string") detail = body.detail; } catch {}
      throw new ApiError(detail, res.status);
    }
    return res.json() as Promise<ReorderScanResponse>;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError("Couldn't reach the backend. Check the URL and that the tunnel/server is running.");
  }
}

export interface EmailSettings {
  enabled: boolean; provider: string; from_email: string; from_name: string; recipients: string[];
  notify_scan_received: boolean; notify_scan_completed: boolean; notify_scan_failed: boolean; notify_system_errors: boolean; notify_queue_warnings: boolean;
  cloudflare_configured?: boolean;
}

export interface SystemState { paused: boolean; maintenance: boolean; features: Record<string, boolean>; config: Record<string, number>; uptime_seconds: number; }
export interface HealthResponse { status: string; uptime_seconds: number; queue_depth: number; processing: boolean; mongo_configured: boolean; platform: string; python: string; tools: Record<string, boolean>; }
export interface SystemRow { at: string; level?: string; action: string; detail: string; }

async function postJson<T>(path: string, settings: ConnectionSettings, body: unknown): Promise<T> {
  if (!settings.baseUrl) throw new ApiError("No backend URL configured yet.");
  try {
    const res = await fetch(`${settings.baseUrl.replace(/\/$/, "")}${path}`, { method:"POST", headers:{"Content-Type":"application/json", ...authHeaders(settings.apiKey ? {"X-API-Key":settings.apiKey}: {})}, credentials:"include", body:JSON.stringify(body), cache:"no-store" });
    if (!res.ok) { let detail=`Backend returned ${res.status}`; try { const b=await res.json(); if(typeof b?.detail === "string") detail=b.detail; } catch {} throw new ApiError(detail,res.status); }
    return res.json();
  } catch(e) { if(e instanceof ApiError) throw e; throw new ApiError("Couldn't reach the backend. Check the URL and that the tunnel/server is running."); }
}
async function patchJson<T>(path: string, settings: ConnectionSettings, body: unknown): Promise<T> {
  if (!settings.baseUrl) throw new ApiError("No backend URL configured yet.");
  try {
    const res = await fetch(`${settings.baseUrl.replace(/\/$/, "")}${path}`, { method: "PATCH", headers: { "Content-Type": "application/json", ...authHeaders(settings.apiKey ? { "X-API-Key": settings.apiKey } : {}) }, credentials: "include", body: JSON.stringify(body), cache: "no-store" });
    if (!res.ok) { let detail = `Backend returned ${res.status}`; try { const b = await res.json(); if (typeof b?.detail === "string") detail = b.detail; } catch {} throw new ApiError(detail, res.status); }
    return res.json();
  } catch (e) { if (e instanceof ApiError) throw e; throw new ApiError("Couldn't reach the backend. Check the URL and that the tunnel/server is running."); }
}

export const fetchSystemState = (s: ConnectionSettings) => request<SystemState>("/monitor/system/state", s);
export const fetchHealth = (s: ConnectionSettings) => request<HealthResponse>("/monitor/system/health", s);
export const fetchAudit = (s: ConnectionSettings) => request<{items:SystemRow[]}>("/monitor/system/audit", s);
export const fetchLogs = (s: ConnectionSettings, level="all") => request<{items:SystemRow[]}>(`/monitor/system/logs?level=${encodeURIComponent(level)}`, s);
export const updateSystemControl = (s: ConnectionSettings, body: {paused?:boolean;maintenance?:boolean}) => postJson<SystemState>("/monitor/system/control",s,body);
export const updateFeatures = (s: ConnectionSettings, body: Record<string,boolean>) => postJson<SystemState>("/monitor/system/features",s,body);
export const updateSystemConfig = (s: ConnectionSettings, body: Record<string,number>) => postJson<SystemState>("/monitor/system/config",s,body);
export const runDiagnostics = (s: ConnectionSettings) => postJson<{checks:{name:string;ok:boolean}[];ran_at:string}>("/monitor/system/diagnostics",s,{});
export const fetchEmailSettings = (s: ConnectionSettings) => request<EmailSettings>("/monitor/system/email", s);
export const saveEmailSettings = (s: ConnectionSettings, body: EmailSettings) => postJson<EmailSettings>("/monitor/system/email", s, body);
export const sendEmailTest = (s: ConnectionSettings) => postJson<{sent:boolean}>("/monitor/system/email/test", s, {});


export interface AlertItem { id: string; at: string; severity: "info" | "warning" | "critical" | "success"; title: string; message: string; source: string; read: boolean; }
export const fetchAlerts = (s: ConnectionSettings) => request<{items:AlertItem[]; unread:number}>("/monitor/alerts", s);
export const markAlertRead = (s: ConnectionSettings, id: string) => postJson<{ok:boolean}>(`/monitor/alerts/${encodeURIComponent(id)}/read`, s, {});
export const markAllAlertsRead = (s: ConnectionSettings) => postJson<{ok:boolean}>("/monitor/alerts/read-all", s, {});
