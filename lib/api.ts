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
  opts: { status?: ScanStatus; q?: string; limit?: number; skip?: number } = {},
  signal?: AbortSignal
) {
  const params = new URLSearchParams();
  if (opts.status) params.set("status", opts.status);
  if (opts.q) params.set("q", opts.q);
  params.set("limit", String(opts.limit ?? 100));
  params.set("skip", String(opts.skip ?? 0));
  return request<ScanListResponse>(
    `/monitor/scans?${params.toString()}`,
    settings,
    signal
  );
}

export function isAbortError(e: unknown): boolean {
  return e instanceof DOMException && e.name === "AbortError";
}

export { ApiError };
