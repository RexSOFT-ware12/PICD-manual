"use client";

import { useEffect, useRef, useState } from "react";
import {
  fetchDeveloperTerminalJob,
  fetchDeveloperTerminalStatus,
  loadSettings,
  runDeveloperTerminalCommand,
  type DeveloperTerminalStatus,
} from "@/lib/api";

type Props = { baseUrl: string; active?: boolean; fill?: boolean; autoConnect?: boolean };
type TerminalMode = "cloud" | "local";

const wait = (ms: number) => new Promise(resolve => window.setTimeout(resolve, ms));

export default function DeveloperTerminal({ baseUrl, active = true, fill = false }: Props) {
  const outputRef = useRef<HTMLPreElement>(null);
  const historyPosition = useRef(0);
  const [status, setStatus] = useState<DeveloperTerminalStatus | null>(null);
  const [mode, setMode] = useState<TerminalMode>("cloud");
  const [command, setCommand] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [transcript, setTranscript] = useState("");
  const [currentOutput, setCurrentOutput] = useState("");
  const [running, setRunning] = useState(false);
  const [detail, setDetail] = useState("Checking which terminal modes are enabled…");

  useEffect(() => {
    let cancelled = false;
    if (!baseUrl) {
      setDetail("Configure the dashboard backend connection before running commands.");
      return;
    }
    fetchDeveloperTerminalStatus(loadSettings()).then(result => {
      if (cancelled) return;
      setStatus(result);
      const availableMode = result.modes.local ? "local" : result.modes.cloud ? "cloud" : null;
      if (availableMode) {
        setMode(availableMode);
        setDetail(`${result.note}${result.workspace ? ` Workspace: ${result.workspace}` : ""}`);
      } else {
        setDetail(result.note || "Terminal execution is disabled. Enable a secure local or cloud terminal on the backend.");
      }
    }).catch(error => {
      if (!cancelled) setDetail(error instanceof Error ? error.message : "Could not check terminal availability.");
    });
    return () => { cancelled = true; };
  }, [baseUrl]);

  useEffect(() => {
    if (outputRef.current) outputRef.current.scrollTop = outputRef.current.scrollHeight;
  }, [transcript, currentOutput]);

  const execute = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const submitted = command.trim();
    if (!submitted || running || !status?.modes[mode]) return;

    setCommand("");
    setHistory(existing => [...existing, submitted]);
    historyPosition.current = history.length + 1;
    setTranscript(existing => `${existing}${existing && !existing.endsWith("\n") ? "\n" : ""}$ ${submitted}\n`);
    setCurrentOutput("");
    setRunning(true);
    try {
      const { job_id } = await runDeveloperTerminalCommand(loadSettings(), submitted, mode);
      let job = await fetchDeveloperTerminalJob(loadSettings(), job_id);
      setCurrentOutput(job.output || "");
      while (job.status === "running") {
        await wait(750);
        job = await fetchDeveloperTerminalJob(loadSettings(), job_id);
        setCurrentOutput(job.output || "");
      }
      const exit = job.exit_code === null ? "" : `\n[process exited with code ${job.exit_code}]`;
      setTranscript(existing => `${existing}${job.output || "(no output)"}${exit}\n`);
      setCurrentOutput("");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Command failed.";
      setTranscript(existing => `${existing}${message}\n`);
      setCurrentOutput("");
    } finally {
      setRunning(false);
    }
  };

  const changeHistory = (direction: -1 | 1) => {
    if (!history.length) return;
    const nextPosition = Math.max(0, Math.min(history.length, historyPosition.current + direction));
    historyPosition.current = nextPosition;
    setCommand(nextPosition === history.length ? "" : history[nextPosition]);
  };

  const modeAvailable = !!status?.modes[mode];
  const modesAvailable = !!status?.modes.cloud || !!status?.modes.local;

  return <section className={`${fill ? "flex h-full min-h-0 flex-col" : "mt-4"} overflow-hidden rounded-xl border border-[var(--picd-page-border)] bg-[#10151e] ${active ? "" : "hidden"}`}>
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-4 py-2 text-white">
      <div className="flex items-center gap-2 text-xs font-semibold">
        <span className={`h-2 w-2 rounded-full ${running ? "bg-amber-400" : modeAvailable ? "bg-emerald-400" : "bg-slate-500"}`} />
        Terminal
        <span className="font-normal text-slate-400">{running ? "running command" : modeAvailable ? "ready" : "unavailable"}</span>
      </div>
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-1.5 text-[10px] text-slate-400">
          Mode
          <select value={mode} onChange={event => setMode(event.target.value as TerminalMode)} disabled={running} className="rounded border border-white/20 bg-[#10151e] px-2 py-1.5 text-xs text-white">
            <option value="cloud" disabled={!status?.modes.cloud}>Cloud</option>
            <option value="local" disabled={!status?.modes.local}>Local</option>
          </select>
        </label>
        <button type="button" className="rounded-md border border-white/20 px-3 py-1.5 text-xs hover:bg-white/10" onClick={() => { setTranscript(""); setCurrentOutput(""); }}>Clear</button>
      </div>
    </div>
    <div className={`${fill ? "min-h-0 flex-1" : "h-64"} flex flex-col overflow-hidden p-3 font-mono text-xs text-slate-200`}>
      <pre ref={outputRef} aria-live="polite" className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-words leading-5">{transcript}{currentOutput}{running && !currentOutput ? "\nRunning…" : ""}</pre>
      <form onSubmit={execute} className="mt-2 flex items-center gap-2 border-t border-white/10 pt-2">
        <span className="shrink-0 text-emerald-400" aria-hidden="true">$</span>
        <input
          value={command}
          onChange={event => setCommand(event.target.value)}
          onKeyDown={event => {
            if (event.key === "ArrowUp") { event.preventDefault(); changeHistory(-1); }
            if (event.key === "ArrowDown") { event.preventDefault(); changeHistory(1); }
          }}
          disabled={running || !modeAvailable}
          aria-label="Terminal command"
          autoComplete="off"
          spellCheck={false}
          placeholder={modeAvailable ? "Enter a command and press Enter" : "Terminal mode is not enabled"}
          className="min-w-0 flex-1 bg-transparent text-xs text-white outline-none placeholder:text-slate-500 disabled:cursor-not-allowed"
        />
        <button type="submit" disabled={running || !modeAvailable || !command.trim()} className="rounded border border-white/20 px-2.5 py-1 text-[10px] font-semibold text-white hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40">{running ? "Running…" : "Run"}</button>
      </form>
    </div>
    <p className="border-t border-white/10 px-4 py-2 text-[10px] text-slate-400">
      {detail || (!modesAvailable ? "No terminal mode is enabled." : "")} Commands run as backend jobs; each command starts independently and does not keep interactive shell state such as a changed directory.
    </p>
  </section>;
}
