"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { loadSettings } from "@/lib/api";

const nav = [
  { href: "/", label: "Dashboard", icon: "▦", section: "Monitor" },
  { href: "/analytics", label: "Analytics", icon: "◒", section: "Monitor" },
  { href: "/workers", label: "Workers", icon: "⚙", section: "Control" },
  { href: "/logs", label: "System logs", icon: "≡", section: "Control" },
  { href: "/audit", label: "Audit logs", icon: "✓", section: "Control" },
  { href: "/system", label: "System settings", icon: "⌘", section: "Admin" },
];

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const connected = !!loadSettings().baseUrl;
  let lastSection = "";

  return (
    <>
      <div className="mobile-unavailable" role="status" aria-live="polite">
        <div className="mobile-unavailable-card">
          <p className="mobile-unavailable-kicker">PICD Scan Queue Monitor</p>
          <h1>Desktop dashboard only</h1>
          <p>This monitoring dashboard is designed for desktop screens and is not available on mobile devices.</p>
        </div>
      </div>
      <div className="desktop-dashboard flex h-screen min-h-0 overflow-hidden bg-paper">
        <aside className="flex h-full w-[248px] shrink-0 flex-col border-r border-white/10 bg-blueprint px-4 py-5 text-paper shadow-2xl shadow-blueprint/10">
          <Link href="/" className="mb-7 block px-3">
            <p className="font-display text-lg font-semibold leading-tight">Scan Queue<br />Monitor</p>
            <p className="mt-1 text-xs text-paper/45">PICD measurement pipeline</p>
          </Link>

          <div className="mb-5 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5">
            <div className="flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${connected ? "bg-sage" : "bg-amber"}`} />
              <span className="text-[11px] font-semibold">{connected ? "Backend connected" : "Not connected"}</span>
            </div>
            <p className="mt-1 truncate text-[10px] text-paper/35">{connected ? loadSettings().baseUrl : "Configure connection in System settings"}</p>
          </div>

          <nav className="flex-1 overflow-y-auto scrollbar-thin">
            {nav.map(item => {
              const heading = item.section !== lastSection;
              lastSection = item.section;
              const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
              return (
                <div key={item.href}>
                  {heading && <p className="mb-2 mt-4 px-3 text-[9px] font-bold uppercase tracking-[.18em] text-paper/25">{item.section}</p>}
                  <Link href={item.href} className={`mb-1 flex items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-medium transition ${active ? "bg-paper text-blueprint shadow-sm" : "text-paper/55 hover:bg-white/7 hover:text-paper"}`}>
                    <span className="w-4 text-center text-sm opacity-80">{item.icon}</span>
                    <span>{item.label}</span>
                    {active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-blueprint" />}
                  </Link>
                </div>
              );
            })}
          </nav>

          <div className="mt-5 border-t border-white/10 pt-4 px-3">
            <p className="text-[9px] uppercase tracking-[.18em] text-paper/25">PICD Control Center</p>
            <p className="mt-1 text-[10px] leading-relaxed text-paper/35">Operational controls are separated from monitoring and analytics.</p>
          </div>
        </aside>
        <main className="min-w-0 flex-1 overflow-hidden">{children}</main>
      </div>
    </>
  );
}
