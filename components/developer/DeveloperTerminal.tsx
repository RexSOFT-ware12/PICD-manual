"use client";
import { useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";

type Props = { baseUrl: string };
export default function DeveloperTerminal({ baseUrl }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const terminal = useRef<Terminal | null>(null);
  const socket = useRef<WebSocket | null>(null);
  const [state, setState] = useState<"disconnected" | "connecting" | "connected" | "error">("disconnected");
  const [detail, setDetail] = useState("Local workstation terminal is opt-in and requires the PICD local agent.");

  const connect = async () => {
    if (!baseUrl || state === "connecting" || state === "connected") return;
    setState("connecting"); setDetail("Requesting a secure one-time terminal ticket…");
    try {
      const csrf = typeof window !== "undefined" ? window.sessionStorage.getItem("picd-csrf") : null;
      const response = await fetch(`${baseUrl.replace(/\/$/, "")}/developer/terminal/ticket`, {
        method: "POST", credentials: "include", cache: "no-store",
        headers: { "Content-Type": "application/json", ...(csrf ? { "X-CSRF-Token": csrf } : {}) }, body: "{}",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.detail || `Terminal ticket failed (${response.status})`);
      const url = new URL(`${baseUrl.replace(/\/$/, "")}/developer/terminal/ws`);
      url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
      url.searchParams.set("ticket", payload.ticket);
      const ws = new WebSocket(url); socket.current = ws;
      ws.onopen = () => { setState("connected"); setDetail("Connected to the local PICD workstation."); terminal.current?.writeln("\r\n\x1b[32mPICD Developer Studio terminal connected.\x1b[0m\r\n"); };
      ws.onmessage = event => terminal.current?.write(String(event.data));
      ws.onerror = () => { setState("error"); setDetail("WebSocket connection failed. Check the local agent and network access."); };
      ws.onclose = () => { setState("disconnected"); setDetail("Terminal disconnected."); };
    } catch (error) { setState("error"); setDetail(error instanceof Error ? error.message : "Could not connect to terminal."); }
  };

  useEffect(() => {
    if (!host.current) return;
    const term = new Terminal({ cursorBlink: true, convertEol: true, fontFamily: '"SFMono-Regular", Consolas, monospace', fontSize: 12, theme: { background: "#10151e", foreground: "#d8dee9", cursor: "#8ab4f8", selectionBackground: "#34445d" }, scrollback: 5000 });
    const fit = new FitAddon(); term.loadAddon(fit); term.open(host.current); fit.fit();
    term.writeln("PICD Developer Studio · Local terminal"); term.writeln("Press Connect to start a shell session.");
    term.onData(data => { if (socket.current?.readyState === WebSocket.OPEN) socket.current.send(JSON.stringify({ type: "input", data })); });
    terminal.current = term;
    const resize = () => { fit.fit(); if (socket.current?.readyState === WebSocket.OPEN) socket.current.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows })); };
    window.addEventListener("resize", resize);
    return () => { window.removeEventListener("resize", resize); socket.current?.close(); term.dispose(); terminal.current = null; };
  }, []);

  return <section className="mt-4 overflow-hidden rounded-xl border border-[var(--picd-page-border)] bg-[#10151e]">
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-4 py-3 text-white">
      <div className="flex items-center gap-2 text-xs font-semibold"><span className={`h-2 w-2 rounded-full ${state === "connected" ? "bg-emerald-400" : state === "connecting" ? "bg-amber-400" : "bg-slate-500"}`} />Terminal <span className="font-normal text-slate-400">{state}</span></div>
      <div className="flex gap-2"><button className="rounded-md border border-white/20 px-3 py-1.5 text-xs hover:bg-white/10 disabled:opacity-40" onClick={connect} disabled={state === "connecting" || state === "connected"}>Connect</button><button className="rounded-md border border-white/20 px-3 py-1.5 text-xs hover:bg-white/10" onClick={() => socket.current?.close()}>Disconnect</button><button className="rounded-md border border-white/20 px-3 py-1.5 text-xs hover:bg-white/10" onClick={() => terminal.current?.clear()}>Clear</button></div>
    </div>
    <div ref={host} className="h-64 w-full p-2" />
    <p className="border-t border-white/10 px-4 py-2 text-[10px] text-slate-400">{detail} Commands execute on the machine running the local agent. Do not expose this agent directly to the public internet.</p>
  </section>;
}
