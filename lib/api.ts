export type ScanStatus = "queued" | "processing" | "completed" | "failed";
export type DeliveryStatus = "pending" | "sending" | "delivered" | "failed" | "not_configured";

export interface ImageAnalysisSummary {
  status: "ok" | "warning" | "error" | "analyzing";
  sharpness?: number | null;
  brightness?: number | null;
  resolution?: string | null;
  left_arm_deg?: number | null;
  right_arm_deg?: number | null;
  pose_confidence?: number | null;
  issues?: string[];
}

export interface ImageAnalysis {
  version?: number;
  status?: "ok" | "warning" | "error" | "analyzing";
  stage?: string;
  progress?: number;
  issues?: string[];
  card?: { front?: ImageAnalysisSummary; side?: ImageAnalysisSummary };
  images?: Record<string, unknown>;
}

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
  result?: {
    scan_id: string;
    user_id: string;
    status: ScanStatus;
    processed_at: string;
    measurements_output?: {
      height_cm?: number | null; weight_kg?: number | null; bust_cm?: number | null; chest_cm?: number | null;
      waist_cm?: number | null; hips_cm?: number | null; shoulder_width_cm?: number | null; inseam_cm?: number | null;
    } | null;
    daz_model?: { template: string; sliders: Record<string, number> } | null;
    source_svg_key?: string | null;
    error?: string | null;
  } | null;
  delivery_status?: DeliveryStatus;
  delivered_at?: string | null;
  delivery_error?: string | null;
  delivery_attempts?: number;
  has_stored_images?: boolean;
  image_analysis?: ImageAnalysis | null;
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
  delivered?: number;
}

export interface ConnectionSettings {
  baseUrl: string;
  apiKey: string;
}


export interface AuthAdmin { username: string; is_super_admin: boolean; permissions: string[]; }
export interface AuthMe extends AuthAdmin { csrf_token?: string; }

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
  const me = await request<AuthMe>("/auth/me", settings);
  // Keep the CSRF token in sync with the authenticated HttpOnly session.
  try {
    const csrf = await request<{ csrf_token: string }>("/auth/csrf", settings);
    if (typeof window !== "undefined" && csrf?.csrf_token) window.sessionStorage.setItem("picd-csrf", csrf.csrf_token);
  } catch {}
  return me;
}

async function refreshCSRF(settings: ConnectionSettings): Promise<void> {
  const csrf = await request<{ csrf_token: string }>("/auth/csrf", settings);
  if (typeof window !== "undefined" && csrf?.csrf_token) window.sessionStorage.setItem("picd-csrf", csrf.csrf_token);
}

export async function logoutAdmin(settings: ConnectionSettings) {
  if (!settings.baseUrl) return;
  const res = await fetch(`${settings.baseUrl.replace(/\/$/, "")}/auth/logout`, { method: "POST", credentials: "include", headers: authHeaders(), cache: "no-store" });
  if (!res.ok) { let detail = `Logout failed (${res.status})`; try { const b = await res.json(); if (typeof b?.detail === "string") detail = b.detail; } catch {} throw new ApiError(detail, res.status); }
  if (typeof window !== "undefined") window.sessionStorage.removeItem("picd-csrf");
}

export interface AdminRecord extends AuthAdmin { id: string; email: string; active: boolean; created_at: string | null; last_login_at: string | null; invitation_pending?: boolean; invitation_expires_at?: string | null; }
export interface AdminsResponse { items: AdminRecord[]; permissions: { key: string; label: string }[]; }
export function fetchAdmins(settings: ConnectionSettings) { return request<AdminsResponse>("/auth/admins", settings); }
export function createAdmin(settings: ConnectionSettings, body: { email: string; permissions: string[] }) { return postJson<AdminRecord>("/auth/admins", settings, body); }
export function updateAdmin(settings: ConnectionSettings, id: string, body: { active?: boolean; permissions?: string[]; password?: string }) { return patchJson<AdminRecord>(`/auth/admins/${encodeURIComponent(id)}`, settings, body); }
export function resendAdminInvitation(settings: ConnectionSettings, id: string) { return postJson<AdminRecord>(`/auth/admins/${encodeURIComponent(id)}/resend-invitation`, settings, {}); }
export function getInvitation(settings: ConnectionSettings, token: string) { return request<{ email: string; expires_at: string }>(`/auth/invitations/${encodeURIComponent(token)}`, settings); }
export function acceptInvitation(settings: ConnectionSettings, token: string, password: string) { return postJson<{ ok: boolean; email: string }>("/auth/invitations/accept", settings, { token, password }); }
export function hasPermission(permission: string): boolean {
  if (typeof window === "undefined") return false;
  try { const raw = window.sessionStorage.getItem("picd-auth-admin"); const admin = raw ? JSON.parse(raw) as AuthMe : null; return !!admin && (admin.is_super_admin || admin.permissions?.includes(permission)); } catch { return false; }
}

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
    const res = await fetch(url, {
      method: "POST",
      headers: authHeaders(settings.apiKey ? { "X-API-Key": settings.apiKey } : {}),
      credentials: "include",
      cache: "no-store",
    });
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

export interface DeliveryRetryResponse { scan_id: string; delivered: boolean; delivery_status: DeliveryStatus; }
export const retryDelivery = (s: ConnectionSettings, scanId: string) => postJson<DeliveryRetryResponse>(`/monitor/scans/${encodeURIComponent(scanId)}/deliver`, s, {});

export function resolveBackendAssetUrl(settings: ConnectionSettings, src: string | null): string | null {
  if (!src) return null;
  if (/^https?:\/\//i.test(src)) return src;
  if (!settings.baseUrl) return src;
  return `${settings.baseUrl.replace(/\/$/, "")}/${src.replace(/^\//, "")}`;
}

export interface EmailSettings {
  enabled: boolean; provider: string; from_email: string; from_name: string; recipients: string[];
  notify_scan_received: boolean; notify_scan_completed: boolean; notify_scan_failed: boolean; notify_system_errors: boolean; notify_queue_warnings: boolean;
  cloudflare_configured?: boolean;
}

export interface ClientEstimateConfig {
  version: number;
  state_selection: { hw3_width_ratio_limit: number; hw2_high_hip_ratio_limit: number };
  ellipse_adjustments: Record<string, number>;
  slider_percentages: Record<string, number>;
  morph_limits: { minimum_valid_percent: number; maximum_valid_percent: number; overflow_threshold: number; overflow_morph_percent: number; overflow_total_excess: number };
  gam_fallback: number;
}

export interface BodyAnalyzerConfig {
  search: { morph_increment: number; start_morph_percent: number; maximum_morph_percent: number };
  bust_adjustment: { positive_base: number; positive_scale: number; negative_base: number; negative_scale: number };
  height_conversion: { thigh_y_offset_inches: number; natural_waist_to_high_hip_inches: number };
  body_defaults: { client_height: number; gl_new: number; nw_new: number; thea_y: number; tglu_y: number; twai_y: number; tcro_y: number };
  shape_selection: { body_level_count: number; use_busthigh8: boolean };
}

export interface SystemState { paused: boolean; maintenance: boolean; features: Record<string, boolean>; config: Record<string, number>; uptime_seconds: number; }
export interface HealthResponse { status: string; uptime_seconds: number; queue_depth: number; processing: boolean; mongo_configured: boolean; platform: string; python: string; tools: Record<string, boolean>; cloud_mode?: boolean; processing_agent_required?: boolean; processing_agent?: { online: boolean; agent_id?: string | null; last_seen?: string | null }; }
export interface SystemRow { at: string; level?: string; action: string; detail: string; }

async function postJson<T>(path: string, settings: ConnectionSettings, body: unknown): Promise<T> {
  if (!settings.baseUrl) throw new ApiError("No backend URL configured yet.");
  try {
    const res = await fetch(`${settings.baseUrl.replace(/\/$/, "")}${path}`, { method:"POST", headers:{"Content-Type":"application/json", ...authHeaders(settings.apiKey ? {"X-API-Key":settings.apiKey}: {})}, credentials:"include", body:JSON.stringify(body), cache:"no-store" });
    if (!res.ok) {
      let detail=`Backend returned ${res.status}`;
      try { const b=await res.json(); if(typeof b?.detail === "string") detail=b.detail; } catch {}
      if (res.status === 403 && detail === "CSRF validation failed") {
        await refreshCSRF(settings);
        const retry = await fetch(`${settings.baseUrl.replace(/\/$/, "")}${path}`, { method:"POST", headers:{"Content-Type":"application/json", ...authHeaders(settings.apiKey ? {"X-API-Key":settings.apiKey}: {})}, credentials:"include", body:JSON.stringify(body), cache:"no-store" });
        if (!retry.ok) { let retryDetail=`Backend returned ${retry.status}`; try { const b=await retry.json(); if(typeof b?.detail === "string") retryDetail=b.detail; } catch {} throw new ApiError(retryDetail,retry.status); }
        return retry.json();
      }
      throw new ApiError(detail,res.status);
    }
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
export const fetchBodyAnalyzerConfig = (s: ConnectionSettings) => request<BodyAnalyzerConfig>("/monitor/system/body-analyzer-config", s);
export const updateBodyAnalyzerConfig = (s: ConnectionSettings, body: BodyAnalyzerConfig | { _reset: boolean }) => postJson<BodyAnalyzerConfig>("/monitor/system/body-analyzer-config", s, body);
export const fetchClientEstimateConfig = (s: ConnectionSettings) => request<ClientEstimateConfig>("/monitor/system/client-estimate-config", s);
export const updateClientEstimateConfig = (s: ConnectionSettings, body: ClientEstimateConfig | { _reset: boolean }) => postJson<ClientEstimateConfig>("/monitor/system/client-estimate-config", s, body);
export const runDiagnostics = (s: ConnectionSettings) => postJson<{checks:{name:string;ok:boolean;detail?:string}[];ran_at:string}>("/monitor/system/diagnostics",s,{});
export const fetchEmailSettings = (s: ConnectionSettings) => request<EmailSettings>("/monitor/system/email", s);
export const saveEmailSettings = (s: ConnectionSettings, body: EmailSettings) => postJson<EmailSettings>("/monitor/system/email", s, body);
export const sendEmailTest = (s: ConnectionSettings) => postJson<{sent:boolean}>("/monitor/system/email/test", s, {});


export interface AlertItem { id: string; at: string; severity: "info" | "warning" | "critical" | "success"; title: string; message: string; source: string; read: boolean; }
export const fetchAlerts = (s: ConnectionSettings, limit = 50) => request<{items:AlertItem[]; unread:number}>(`/monitor/alerts?limit=${limit}`, s);
export const markAlertRead = (s: ConnectionSettings, id: string) => postJson<{ok:boolean}>(`/monitor/alerts/${encodeURIComponent(id)}/read`, s, {});
export const markAllAlertsRead = (s: ConnectionSettings) => postJson<{ok:boolean}>("/monitor/alerts/read-all", s, {});


export const GAM_COLUMNS = [
  "BODY PART", "BODY MORPH", "GEN8BOD100DEPTH", "GEN8BOD100WIDTH", "GEN8BOD100CIRCU",
  "GEN8BODWEI100DEPTH", "GEN8BODWEI100WIDTH", "GEN8BODWEI100CIRCU", "HW2BOD100DEPTH", "HW2BOD100WIDTH", "HW2BOD100CIRCU",
  "HW2BODWEI100DEPTH", "HW2BODWEI100WIDTH", "HW2BODWEI100CIRCU", "HW3BOD100DEPTH", "HW3BOD100WIDTH", "HW3BOD100CIRCU",
  "HW3BODWEI100DEPTH", "HW3BODWEI100WIDTH", "HW3BODWEI100CIRCU", "LevelSort",
] as const;
export type GAMColumn = typeof GAM_COLUMNS[number];
export type GAMRow = Record<GAMColumn, string | number | null> & { id: string; __order?: number };
export interface GAMListResponse { items: GAMRow[]; total: number; skip: number; limit: number; columns: string[]; }
export interface GAMMeta { collection: string; rows: number; body_morphs: string[]; body_parts: string[]; columns: string[]; canonical_files: string[]; }
export interface GAMImportPreview { filename: string; valid: boolean; rows: number; errors: string[]; preview: GAMRow[]; columns: string[]; }

export function fetchGAM(settings: ConnectionSettings, opts: {q?:string; body_part?:string; body_morph?:string; skip?:number; limit?:number} = {}, signal?: AbortSignal) {
  const p = new URLSearchParams(); if(opts.q)p.set("q",opts.q); if(opts.body_part)p.set("body_part",opts.body_part); if(opts.body_morph)p.set("body_morph",opts.body_morph); p.set("skip",String(opts.skip??0)); p.set("limit",String(opts.limit??100));
  return request<GAMListResponse>(`/monitor/gam?${p.toString()}`, settings, signal);
}
export const fetchGAMMeta = (s: ConnectionSettings) => request<GAMMeta>("/monitor/gam/meta", s);
export const createGAMRow = (s: ConnectionSettings, row: Record<string, unknown>) => postJson<GAMRow>("/monitor/gam", s, row);
export const updateGAMRow = (s: ConnectionSettings, id: string, row: Record<string, unknown>) => patchJson<GAMRow>(`/monitor/gam/${encodeURIComponent(id)}`, s, row);
export async function deleteGAMRow(settings: ConnectionSettings, id: string) {
  if (!settings.baseUrl) throw new ApiError("No backend URL configured yet.");
  try {
    const res = await fetch(`${settings.baseUrl.replace(/\/$/,"")}/monitor/gam/${encodeURIComponent(id)}`, { method:"DELETE", credentials:"include", headers:authHeaders(settings.apiKey ? {"X-API-Key":settings.apiKey}:{}), cache:"no-store" });
    if(!res.ok){ let detail=`Backend returned ${res.status}`; try{const b=await res.json();if(typeof b?.detail==="string")detail=b.detail;}catch{} throw new ApiError(detail,res.status); }
    return res.json() as Promise<{ok:boolean}>;
  } catch(e){ if(e instanceof ApiError) throw e; throw new ApiError("Couldn't reach the backend. Check the URL and that the tunnel/server is running."); }
}

async function uploadGAM(settings: ConnectionSettings, file: File, path: string, mode?: "replace"|"upsert") {
  if(!settings.baseUrl) throw new ApiError("No backend URL configured yet.");
  const qs = mode ? `?mode=${mode}` : "";
  try {
    const res = await fetch(`${settings.baseUrl.replace(/\/$/,"")}${path}${qs}`, { method:"POST", credentials:"include", headers:authHeaders({"Content-Type":file.type || "application/octet-stream", "X-GAM-Filename":file.name}), body:file, cache:"no-store" });
    if(!res.ok){ let detail=`Backend returned ${res.status}`; try{const b=await res.json();if(typeof b?.detail==="string")detail=b.detail;}catch{} throw new ApiError(detail,res.status); }
    return res.json();
  } catch(e){ if(e instanceof ApiError) throw e; throw new ApiError("Couldn't reach the backend. Check the URL and that the tunnel/server is running."); }
}
export const previewGAMImport = (s: ConnectionSettings, f: File) => uploadGAM(s,f,"/monitor/gam/import/preview");
export const importGAM = (s: ConnectionSettings, f: File, mode: "replace"|"upsert") => uploadGAM(s,f,"/monitor/gam/import",mode);

export interface CSVImportJob {
  id: string; filename: string; collection: string; database: string;
  status: "queued" | "running" | "completed" | "failed";
  stage: string; stage_index: number; progress: number;
  headers: string[]; columns_count: number; deleted: number; inserted: number;
  logs: string[]; error?: string; created_at: string; completed_at?: string;
}
export const startCSVImport = async (s: ConnectionSettings, file: File) => {
  if (!s.baseUrl) throw new ApiError("No backend URL configured yet.");
  const res = await fetch(`${s.baseUrl.replace(/\/$/,"")}/monitor/csv-import/jobs`, {
    method: "POST", credentials: "include",
    headers: authHeaders({"Content-Type": file.type || "application/octet-stream", "X-CSV-Filename": file.name}),
    body: file, cache: "no-store",
  });
  if (!res.ok) { let detail = `Backend returned ${res.status}`; try { const b = await res.json(); if (typeof b?.detail === "string") detail = b.detail; } catch {} throw new ApiError(detail, res.status); }
  return res.json() as Promise<CSVImportJob>;
};
export const fetchCSVImportJob = (s: ConnectionSettings, id: string) => request<CSVImportJob>(`/monitor/csv-import/jobs/${encodeURIComponent(id)}`, s);
export const fetchCSVImportStatus = (s: ConnectionSettings) => request<{active: CSVImportJob | null; pending_files: string[]}>("/monitor/csv-import/status", s);

export interface DazAsset {
  id: string;
  gender: "male" | "female";
  filename: string;
  version: number;
  size_bytes: number;
  sha256: string;
  active: boolean;
  created_at: string | null;
  created_by: string | null;
  activated_at?: string | null;
  activated_by?: string | null;
}
export interface DazAssetResponse { items: DazAsset[]; active: Record<string, DazAsset | undefined>; }

export const fetchDazAssets = (s: ConnectionSettings) => request<DazAssetResponse>("/monitor/daz-assets", s);
export async function uploadDazAsset(s: ConnectionSettings, file: File, gender: "male" | "female") {
  const res = await fetch(`${s.baseUrl.replace(/\/$/, "")}/monitor/daz-assets`, {
    method: "POST", credentials: "include",
    headers: authHeaders({ "Content-Type": "application/octet-stream", "X-DAZ-Filename": file.name, "X-DAZ-Gender": gender }),
    body: file, cache: "no-store",
  });
  if (!res.ok) { let detail = `DAZ asset upload failed (${res.status})`; try { const b=await res.json(); if(typeof b?.detail==="string") detail=b.detail; } catch {} throw new ApiError(detail,res.status); }
  return await res.json() as DazAsset;
}
export const activateDazAsset = (s: ConnectionSettings, id: string) => postJson<DazAsset>(`/monitor/daz-assets/${encodeURIComponent(id)}/activate`, s, {});
export async function deleteDazAsset(s: ConnectionSettings, id: string) {
  const res=await fetch(`${s.baseUrl.replace(/\/$/, "")}/monitor/daz-assets/${encodeURIComponent(id)}`,{method:"DELETE",credentials:"include",headers:authHeaders(),cache:"no-store"});
  if(!res.ok){let detail=`DAZ asset delete failed (${res.status})`;try{const b=await res.json();if(typeof b?.detail==="string")detail=b.detail}catch{}throw new ApiError(detail,res.status)}
  return await res.json() as {ok:boolean};
}
export async function downloadDazAsset(s: ConnectionSettings, id: string, filename: string) {
  const res=await fetch(`${s.baseUrl.replace(/\/$/, "")}/monitor/daz-assets/${encodeURIComponent(id)}/download`,{credentials:"include",headers:authHeaders(),cache:"no-store"});
  if(!res.ok){let detail=`DAZ asset download failed (${res.status})`;try{const b=await res.json();if(typeof b?.detail==="string")detail=b.detail}catch{}throw new ApiError(detail,res.status)}
  const blob=await res.blob(); const url=URL.createObjectURL(blob); const a=document.createElement("a"); a.href=url; a.download=filename; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}

export interface ProcessingWorker {
  id: string;
  worker_id: string;
  name: string;
  active: boolean;
  disabled: boolean;
  created_at: string;
  updated_at: string;
  last_seen: string | null;
  agent_id: string | null;
  current_scan_id: string | null;
  processed_count: number;
  last_result_at: string | null;
}
export interface WorkerListResponse { items: ProcessingWorker[]; }
export interface WorkerCredentialResponse { worker: ProcessingWorker; token: string; }
export const fetchWorkers = (s: ConnectionSettings) => request<WorkerListResponse>("/monitor/workers", s);
export const createWorker = (s: ConnectionSettings, body: {name:string; worker_id:string}) => postJson<WorkerCredentialResponse>("/monitor/workers", s, body);
export const renameWorker = (s: ConnectionSettings, workerId: string, name: string) => patchJson<{worker:ProcessingWorker}>(`/monitor/workers/${encodeURIComponent(workerId)}`, s, {name});
export const activateWorker = (s: ConnectionSettings, workerId: string) => postJson<{worker:ProcessingWorker}>(`/monitor/workers/${encodeURIComponent(workerId)}/activate`, s, {});
export const deactivateWorker = (s: ConnectionSettings, workerId: string) => postJson<{worker:ProcessingWorker}>(`/monitor/workers/${encodeURIComponent(workerId)}/deactivate`, s, {});
export const regenerateWorkerToken = (s: ConnectionSettings, workerId: string) => postJson<WorkerCredentialResponse>(`/monitor/workers/${encodeURIComponent(workerId)}/regenerate-token`, s, {});
export async function deleteWorker(s: ConnectionSettings, workerId: string) {
  if (!s.baseUrl) throw new ApiError("No backend URL configured yet.");
  const res = await fetch(`${s.baseUrl.replace(/\/$/, "")}/monitor/workers/${encodeURIComponent(workerId)}`, { method:"DELETE", headers:authHeaders(s.apiKey ? {"X-API-Key":s.apiKey}:{}), credentials:"include", cache:"no-store" });
  if (!res.ok) { let detail=`Backend returned ${res.status}`; try { const b=await res.json(); if(typeof b?.detail === "string") detail=b.detail; } catch {} throw new ApiError(detail,res.status); }
  return res.json() as Promise<{ok:boolean}>;
}
