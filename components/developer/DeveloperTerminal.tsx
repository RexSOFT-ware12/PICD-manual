"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";

type Props = { baseUrl: string; active?: boolean; fill?: boolean };
type TerminalState = "disconnected" | "connecting" | "connected" | "error";

export default function DeveloperTerminal({ baseUrl, active = true, fill = false }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const terminal = useRef<Terminal | null>(null);
  const fitAddon = useRef<FitAddon | null>(null);
  const socket = useRef<WebSocket | null>(null);
  const stateRef = useRef<TerminalState>("disconnected");
  const [state, setState] = useState<TerminalState>("disconnected");
  const [detail, setDetail] = useState("Connect to request a secure terminal session. Local or Cloud terminal mode must be enabled on the backend.");

  const updateState = (next: TerminalState, explanation: string) => {
    stateRef.current = next;
    setState(next);
    setDetail(explanation);
  };

  const connect = useCallback(async () => {
    if (!baseUrl || stateRef.current === "connecting" || stateRef.current === "connected") return;
    updateState("connecting", "Requesting a secure, single-use terminal ticket…");
    try {
      const csrf = window.sessionStorage.getItem("picd-csrf");
      const response = await fetch(`${baseUrl.replace(/\/$/, "")}/developer/terminal/ticket`, {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: { "Content-Type": "application/json", ...(csrf ? { "X-CSRF-Token": csrf } : {}) },
        body: "{}",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.detail || `Terminal ticket request failed (${response.status}).`);
      if (typeof payload.ticket !== "string" || !payload.ticket) {
        throw new Error("The backend did not return a terminal ticket. Update the backend terminal routes and try again.");
      }

      const url = new URL(`${baseUrl.replace(/\/$/, "")}/developer/terminal/ws`);
      url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
      url.searchParams.set("ticket", payload.ticket);
      const ws = new WebSocket(url);
      socket.current = ws;
      ws.onopen = () => {
        if (socket.current !== ws) return;
        updateState("connected", "Interactive terminal connected.");
        terminal.current?.writeln("\r\n\x1b[32mPICD terminal connected. Type commands below.\x1b[0m\r\n");
        terminal.current?.focus();
        const instance = terminal.current;
        if (instance) ws.send(JSON.stringify({ type: "resize", cols: instance.cols, rows: instance.rows }));
      };
      ws.onmessage = event => {
        if (typeof event.data !== "string") return;
        try {
          const message: unknown = JSON.parse(event.data);
          if (message && typeof message === "object" && "type" in message) {
            const packet = message as { type?: unknown; data?: unknown; message?: unknown };
            if (packet.type === "output" && typeof packet.data === "string") {
              terminal.current?.write(packet.data);
              return;
            }
            if (packet.type === "error" && typeof packet.message === "string") {
              terminal.current?.writeln(`\r\n\x1b[31m${packet.message}\x1b[0m`);
              return;
            }
          }
        } catch {
          // PTY output is normally raw terminal text rather than a JSON packet.
        }
        terminal.current?.write(event.data);
      };
      ws.onerror = () => {
        if (socket.current !== ws) return;
        updateState("error", "WebSocket failed. Check the backend terminal configuration, runner connection, and network access.");
        terminal.current?.writeln("\r\n\x1b[31mTerminal WebSocket connection failed.\x1b[0m");
      };
      ws.onclose = event => {
        if (socket.current !== ws) return;
        socket.current = null;
        if (stateRef.current !== "error") {
          const reason = event.reason ? ` ${event.reason}` : "";
          updateState("disconnected", `Terminal disconnected (code ${event.code}).${reason}`);
        }
      };
    } catch (error) {
      updateState("error", error instanceof Error ? error.message : "Could not connect to the terminal.");
    }
  }, [baseUrl]);

  useEffect(() => {
    if (!host.current) return;
    const term = new Terminal({
      cursorBlink: true,
      convertEol: true,
      fontFamily: '"SFMono-Regular", Consolas, monospace',
      fontSize: 12,
      theme: { background: "#10151e", foreground: "#d8dee9", cursor: "#8ab4f8", selectionBackground: "#34445d" },
      scrollback: 5000,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    fitAddon.current = fit;
    term.open(host.current);
    term.writeln("PICD Developer Studio · Interactive terminal");
    term.writeln("Connect to start a shell session.");
    term.onData(data => {
      if (socket.current?.readyState === WebSocket.OPEN) {
        socket.current.send(JSON.stringify({ type: "input", data }));
      }
    });
    terminal.current = term;

    const resize = () => {
      if (!host.current?.clientWidth || !host.current.clientHeight) return;
      fit.fit();
      if (socket.current?.readyState === WebSocket.OPEN) {
        socket.current.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }));
      }
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host.current);
    window.addEventListener("resize", resize);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", resize);
      socket.current?.close();
      socket.current = null;
      term.dispose();
      terminal.current = null;
      fitAddon.current = null;
    };
  }, []);

  useEffect(() => {
    if (!active) return;
    const frame = window.requestAnimationFrame(() => {
      if (host.current?.clientWidth && host.current.clientHeight) {
        fitAddon.current?.fit();
      }
      terminal.current?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [active]);

  const disconnect = () => {
    const ws = socket.current;
    if (ws) {
      socket.current = null;
      ws.close(1000, "Disconnected by user");
    }
    updateState("disconnected", "Terminal disconnected.");
  };

  return <section className={`${fill ? "flex h-full min-h-0 flex-col" : "mt-4"} overflow-hidden rounded-xl border border-[var(--picd-page-border)] bg-[#10151e] ${active ? "" : "hidden"}`}>
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-4 py-2 text-white">
      <div className="flex items-center gap-2 text-xs font-semibold">
        <span className={`h-2 w-2 rounded-full ${state === "connected" ? "bg-emerald-400" : state === "connecting" ? "bg-amber-400" : state === "error" ? "bg-red-400" : "bg-slate-500"}`} />
        Terminal <span className="font-normal text-slate-400">{state}</span>
      </div>
      <div className="flex gap-2">
        <button type="button" className="rounded-md border border-white/20 px-3 py-1.5 text-xs hover:bg-white/10 disabled:opacity-40" onClick={() => void connect()} disabled={!baseUrl || state === "connecting" || state === "connected"}>Connect</button>
        <button type="button" className="rounded-md border border-white/20 px-3 py-1.5 text-xs hover:bg-white/10 disabled:opacity-40" onClick={disconnect} disabled={state !== "connected" && state !== "connecting"}>Disconnect</button>
        <button type="button" className="rounded-md border border-white/20 px-3 py-1.5 text-xs hover:bg-white/10" onClick={() => terminal.current?.clear()}>Clear</button>
      </div>
    </div>
    <div ref={host} className={`${fill ? "min-h-0 flex-1" : "h-64"} w-full p-2`} />
    <p className="border-t border-white/10 px-4 py-2 text-[10px] text-slate-400">{detail} The terminal runs through the configured backend PTY. Never expose a local terminal agent directly to the public internet.</p>
  </section>;
}
