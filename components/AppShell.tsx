"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { fetchCurrentAdmin, loadSettings, logoutAdmin, type AuthMe } from "@/lib/api";
import NotificationCenter from "@/components/NotificationCenter";

const nav = [
  { href: "/", label: "Dashboard", icon: "▦", section: "Monitor", permission: "scans.read" },
  { href: "/analytics", label: "Analytics", icon: "◒", section: "Monitor", permission: "analytics.read" },
  { href: "/notifications", label: "Notifications", icon: "♢", section: "Monitor", permission: "alerts.read" },
  { href: "/workers", label: "Workers", icon: "⚙", section: "Control", permission: "system.read" },
  { href: "/logs", label: "System logs", icon: "≡", section: "Control", permission: "logs.read" },
  { href: "/audit", label: "Audit logs", icon: "✓", section: "Control", permission: "audit.read" },
  { href: "/gam", label: "GAM", icon: "◇", section: "Control", permission: "gam.read" },
  { href: "/csv-import", label: "CSV importer", icon: "⇅", section: "Control", permission: "csv.read" },
  { href: "/daz-assets", label: "Daz Assets", icon: "◈", section: "Control", permission: "daz.read" },
  { href: "/system", label: "System settings", icon: "⌘", section: "Admin", permission: "system.read" },
  { href: "/admins", label: "Admin accounts", icon: "♙", section: "Admin", permission: "admins.manage" },
];

let sessionAdminCache: AuthMe | null = null;
const ADMIN_CACHE_KEY = "picd-auth-admin";

function readCachedAdmin(): AuthMe | null {
  if (sessionAdminCache) return sessionAdminCache;
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(ADMIN_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AuthMe;
    if (parsed?.username && Array.isArray(parsed.permissions)) {
      sessionAdminCache = parsed;
      return parsed;
    }
  } catch {}
  return null;
}

function cacheAdmin(admin: AuthMe) {
  sessionAdminCache = admin;
  if (typeof window !== "undefined") {
    try { window.sessionStorage.setItem(ADMIN_CACHE_KEY, JSON.stringify(admin)); } catch {}
  }
}



export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [admin, setAdmin] = useState<AuthMe | null>(() => readCachedAdmin());
  const [, setChecking] = useState(() => !readCachedAdmin());
  const [loggingOut, setLoggingOut] = useState(false);
  const settings = useMemo(() => loadSettings(), []);
  const connected = !!settings.baseUrl;

  useEffect(() => {
    let cancelled = false;
    if (!settings.baseUrl) { setChecking(false); router.replace("/login"); return; }
    // Revalidate silently in the background. Cached session data keeps navigation instant.
    fetchCurrentAdmin(settings).then((me) => {
      if (!cancelled) { cacheAdmin(me); setAdmin(me); setChecking(false); }
    }).catch((error) => {
      if (!cancelled) {
        setChecking(false);
        if (error?.status === 401) {
          sessionAdminCache = null;
          try { window.sessionStorage.removeItem(ADMIN_CACHE_KEY); } catch {}
          setAdmin(null);
          router.replace("/login");
        }
      }
    });
    return () => { cancelled = true; };
  }, [router, settings]);

  if (!admin) {
    return <div className="flex h-screen items-center justify-center bg-paper"><div className="rounded-2xl border border-line bg-white px-7 py-6 text-center shadow-sm"><div className="mx-auto mb-3 h-2.5 w-2.5 animate-pulse rounded-full bg-blueprint"/><p className="font-display text-sm font-semibold">Signing you in…</p><p className="mt-1 text-xs text-ink/40">Preparing your dashboard</p></div></div>;
  }

  const can = (permission: string) => admin.is_super_admin || admin.permissions.includes(permission) || (permission === "admins.manage" && admin.is_super_admin);
  const visibleNav = nav.filter((item) => can(item.permission));
  let lastSection = "";

  const signOut = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try { await logoutAdmin(loadSettings()); } catch {}
    sessionAdminCache = null;
    try { window.sessionStorage.removeItem(ADMIN_CACHE_KEY); } catch {}
    router.replace("/login");
  };

  return (
    <>
      <div className="mobile-unavailable" role="status" aria-live="polite"><div className="mobile-unavailable-card"><p className="mobile-unavailable-kicker">PICD Scan Queue Monitor</p><h1>Desktop dashboard only</h1><p>This monitoring dashboard is designed for desktop screens and is not available on mobile devices.</p></div></div>
      <div className="desktop-dashboard flex h-screen min-h-0 overflow-hidden bg-paper">
        <aside className="flex h-full w-[248px] shrink-0 flex-col border-r border-white/10 bg-blueprint px-4 py-5 text-paper shadow-2xl shadow-blueprint/10">
          <Link href="/" className="mb-7 block px-3"><p className="font-display text-lg font-semibold leading-tight">Scan Queue<br/>Monitor</p><p className="mt-1 text-xs text-paper/45">PICD measurement pipeline</p></Link>
          <div className="mb-3 flex items-center justify-between gap-2 px-1"><span className="text-[9px] font-bold uppercase tracking-[.18em] text-paper/25">Live center</span><NotificationCenter/></div>
          <div className="mb-4 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5"><div className="flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${connected ? "bg-sage" : "bg-amber"}`}/><span className="text-[11px] font-semibold">{connected ? "Backend connected" : "Backend URL missing"}</span></div><p className="mt-1 truncate text-[10px] text-paper/35">{connected ? settings.baseUrl : "Set NEXT_PUBLIC_API_BASE_URL or use login"}</p></div>
          <div className="mb-4 rounded-xl border border-white/10 bg-white/[.035] px-3 py-2.5"><p className="text-[9px] uppercase tracking-[.16em] text-paper/30">Signed in</p><div className="mt-1 flex items-center justify-between gap-2"><span className="truncate text-[11px] font-semibold">{admin.username}</span>{admin.is_super_admin && <span className="rounded-full bg-white/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-paper/60">Super admin</span>}</div></div>
          <nav className="flex-1 overflow-y-auto scrollbar-thin">{visibleNav.map(item => { const heading=item.section!==lastSection; lastSection=item.section; const active=pathname===item.href || (item.href!=="/" && pathname.startsWith(item.href)); return <div key={item.href}>{heading&&<p className="mb-2 mt-4 px-3 text-[9px] font-bold uppercase tracking-[.18em] text-paper/25">{item.section}</p>}<Link href={item.href} className={`mb-1 flex items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-medium transition ${active?"bg-paper text-blueprint shadow-sm":"text-paper/55 hover:bg-white/7 hover:text-paper"}`}><span className="w-4 text-center text-sm opacity-80">{item.icon}</span><span>{item.label}</span>{active&&<span className="ml-auto h-1.5 w-1.5 rounded-full bg-blueprint"/>}</Link></div>; })}</nav>
          <button onClick={signOut} disabled={loggingOut} className="mt-4 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-left text-[11px] font-semibold text-paper/65 transition hover:bg-white/10 hover:text-paper disabled:opacity-50">{loggingOut ? "Signing out…" : "Sign out"}</button>
          <div className="mt-3 border-t border-white/10 pt-4 px-3"><p className="text-[9px] uppercase tracking-[.18em] text-paper/25">PICD Control Center</p><p className="mt-1 text-[10px] leading-relaxed text-paper/35">Protected by server-side authentication and role-based permissions.</p></div>
        </aside>
        <main className="min-w-0 flex-1 overflow-hidden">{children}</main>
      </div>
    </>
  );
}
