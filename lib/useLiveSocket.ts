"use client";

import { useEffect, useRef, useState } from "react";
import { monitorWsUrl, type ConnectionSettings } from "./api";

export type LiveEvent =
  | { type: "stats"; counts: Record<string, number>; total: number; queue_depth: number; processing: boolean; paused: boolean }
  | { type: "scan_update"; scan_id: string; status: string; error?: string }
  | { type: "heartbeat" };

const RECONNECT_DELAY_MS = 3000;

/**
 * Best-effort live push. Polling (in page.tsx) stays as the source of
 * truth and safety net — this just calls `onEvent` sooner than the next
 * poll would, and exposes whether the socket is currently connected so
 * the UI can show a "live" vs "polling" indicator. If the backend or
 * tunnel doesn't support WebSockets, this silently fails and the
 * dashboard keeps working exactly as it did before (5s polling).
 */
export function useLiveSocket(settings: ConnectionSettings, onEvent: (e: LiveEvent) => void) {
  const [connected, setConnected] = useState(false);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    const url = monitorWsUrl(settings);
    if (!url) {
      setConnected(false);
      return;
    }

    let cancelled = false;
    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    function connect() {
      if (cancelled) return;
      try {
        socket = new WebSocket(url as string);
      } catch {
        scheduleReconnect();
        return;
      }
      socket.onopen = () => setConnected(true);
      socket.onclose = () => {
        setConnected(false);
        scheduleReconnect();
      };
      socket.onerror = () => {
        socket?.close();
      };
      socket.onmessage = (msg) => {
        try {
          const parsed = JSON.parse(msg.data) as LiveEvent;
          onEventRef.current(parsed);
        } catch {
          // ignore malformed frames
        }
      };
    }

    function scheduleReconnect() {
      if (cancelled || reconnectTimer) return;
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connect();
      }, RECONNECT_DELAY_MS);
    }

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      socket?.close();
    };
    // settings.baseUrl/apiKey are the only inputs that should trigger a
    // reconnect — re-running on every `onEvent` identity change would
    // reconnect on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.baseUrl, settings.apiKey]);

  return { connected };
}
