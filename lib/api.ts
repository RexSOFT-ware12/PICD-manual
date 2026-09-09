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
}

export interface ConnectionSettings {
  baseUrl: string;
  apiKey: string;
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
      apiKey: parsed.apiKey || "",
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
      headers: settings.apiKey ? { "X-API-Key": settings.apiKey } : undefined,
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
      throw new ApiError("Rejected — check the API key.", 401);
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
      headers: settings.apiKey ? { "X-API-Key": settings.apiKey } : undefined,
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
      throw new ApiError("Rejected — check the API key.", 401);
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

// ---------------------------------------------------------------------------
// v2 additions: live push, worker control, stuck watchdog, bulk actions,
// runtime config, alerts, system info. Mirrors the fetch pattern above —
// each function throws ApiError on failure so callers can share one
// error-handling path with the original endpoints.
// ---------------------------------------------------------------------------

async function requestV2<T>(
  path: string,
  settings: ConnectionSettings,
  init: RequestInit = {}
): Promise<T> {
  if (!settings.baseUrl) throw new ApiError("No backend URL configured yet.");
  const url = `${settings.baseUrl.replace(/\/$/, "")}${path}`;
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: {
        ...(settings.apiKey ? { "X-API-Key": settings.apiKey } : {}),
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...(init.headers || {}),
      },
      cache: "no-store",
    });
  } catch (e) {
    throw new ApiError("Couldn't reach the backend. Check the URL and that the tunnel/server is running.");
  }
  if (!res.ok) {
    if (res.status === 401) throw new ApiError("Rejected — check the API key.", 401);
    let detail = `Backend returned ${res.status}`;
    try {
      const body = await res.json();
      if (typeof body?.detail === "string") detail = body.detail;
    } catch {}
    throw new ApiError(detail, res.status);
  }
  return res.json() as Promise<T>;
}

/** Builds the ws:// or wss:// URL for the live push endpoint from
 * whatever http(s) base URL is configured. */
export function monitorWsUrl(settings: ConnectionSettings): string | null {
  if (!settings.baseUrl) return null;
  try {
    const httpUrl = new URL(settings.baseUrl);
    const wsProtocol = httpUrl.protocol === "https:" ? "wss:" : "ws:";
    const base = `${wsProtocol}//${httpUrl.host}${httpUrl.pathname.replace(/\/$/, "")}/monitor/ws`;
    return settings.apiKey ? `${base}?x_api_key=${encodeURIComponent(settings.apiKey)}` : base;
  } catch {
    return null;
  }
}

export interface WorkerPauseResponse {
  paused: boolean;
}

export function pauseWorker(settings: ConnectionSettings) {
  return requestV2<WorkerPauseResponse>("/monitor/queue/pause", settings, { method: "POST" });
}

export function resumeWorker(settings: ConnectionSettings) {
  return requestV2<WorkerPauseResponse>("/monitor/queue/resume", settings, { method: "POST" });
}

export function restartWorker(settings: ConnectionSettings) {
  return requestV2<{ restarted: boolean }>("/monitor/queue/restart-worker", settings, { method: "POST" });
}

export interface StuckScan {
  scan_id: string;
  updated_at: string | null;
  minutes_processing: number | null;
}

export interface StuckScansResponse {
  threshold_minutes: number;
  stuck: StuckScan[];
}

export function fetchStuckScans(settings: ConnectionSettings, signal?: AbortSignal) {
  return requestV2<StuckScansResponse>("/monitor/scans/stuck", settings, { signal });
}

export function forceFailScan(settings: ConnectionSettings, scanId: string) {
  return requestV2<{ scan_id: string; status: ScanStatus }>(
    `/monitor/scans/${encodeURIComponent(scanId)}/force-fail`,
    settings,
    { method: "POST" }
  );
}

export interface BulkResult {
  scan_id: string;
  ok: boolean;
  detail?: string;
}

export function bulkRetry(settings: ConnectionSettings, scanIds: string[]) {
  return requestV2<{ results: BulkResult[] }>("/monitor/scans/bulk-retry", settings, {
    method: "POST",
    body: JSON.stringify({ scan_ids: scanIds }),
  });
}

export function bulkDelete(settings: ConnectionSettings, scanIds: string[]) {
  return requestV2<{ results: BulkResult[] }>("/monitor/scans/bulk-delete", settings, {
    method: "POST",
    body: JSON.stringify({ scan_ids: scanIds }),
  });
}

export interface DashboardConfig {
  stuck_threshold_minutes: number;
  alert_webhook_url: string;
  alert_on_failure: boolean;
  alert_on_stuck: boolean;
}

export function fetchConfig(settings: ConnectionSettings) {
  return requestV2<DashboardConfig>("/monitor/config", settings);
}

export function updateConfig(settings: ConnectionSettings, patch: Partial<DashboardConfig>) {
  return requestV2<DashboardConfig>("/monitor/config", settings, {
    method: "PUT",
    body: JSON.stringify(patch),
  });
}

export function testAlert(settings: ConnectionSettings) {
  return requestV2<{ sent: boolean }>("/monitor/alerts/test", settings, { method: "POST" });
}

export interface SystemInfo {
  git: {
    commit: string | null;
    branch: string | null;
    last_commit_message: string | null;
    dirty: boolean;
  };
  worker: {
    paused: boolean;
    processing_scan_id: string | null;
    processing_since: string | null;
    queue_depth: number;
  };
  process: {
    uptime_seconds: number;
    pid: number;
  };
}

export function fetchSystemInfo(settings: ConnectionSettings, signal?: AbortSignal) {
  return requestV2<SystemInfo>("/monitor/system/info", settings, { signal });
}

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
      headers: settings.apiKey ? { "X-API-Key": settings.apiKey } : undefined,
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
      headers: settings.apiKey ? { "X-API-Key": settings.apiKey } : undefined,
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
      headers: settings.apiKey ? { "X-API-Key": settings.apiKey } : undefined,
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
      headers: settings.apiKey ? { "X-API-Key": settings.apiKey } : undefined,
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
