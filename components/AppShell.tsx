"use client";

import type { ReactNode, CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { fetchCurrentAdmin, fetchUICustomization, loadSettings, logoutAdmin, type AuthMe, type UICustomization } from "@/lib/api";
import NotificationCenter from "@/components/NotificationCenter";

const defaultNav = [
  { id:"dashboard", href: "/", label: "Dashboard", icon: "▦", section: "Monitor", permission: "scans.read", visible:true, order:1 },
  { id:"analytics", href: "/analytics", label: "Analytics", icon: "◒", section: "Monitor", permission: "analytics.read", visible:true, order:2 },
  { id:"notifications", href: "/notifications", label: "Notifications", icon: "♢", section: "Monitor", permission: "alerts.read", visible:true, order:3 },
  { id:"workers", href: "/workers", label: "Workers", icon: "⚙", section: "Control", permission: "workers.read", visible:true, order:4 },
  { id:"logs", href: "/logs", label: "System logs", icon: "≡", section: "Control", permission: "logs.read", visible:true, order:5 },
  { id:"audit", href: "/audit", label: "Audit logs", icon: "✓", section: "Control", permission: "audit.read", visible:true, order:6 },
  { id:"gam", href: "/gam", label: "GAM", icon: "◇", section: "Control", permission: "gam.read", visible:true, order:7 },
  { id:"csv-import", href: "/csv-import", label: "CSV importer", icon: "⇅", section: "Control", permission: "csv.read", visible:true, order:8 },
  { id:"daz-assets", href: "/daz-assets", label: "Daz Assets", icon: "◈", section: "Control", permission: "daz.read", visible:true, order:9 },
  { id:"system", href: "/system", label: "System settings", icon: "⌘", section: "Admin", permission: "system.read", visible:true, order:10 },
  { id:"admins", href: "/admins", label: "Admin accounts", icon: "♙", section: "Admin", permission: "admins.manage", visible:true, order:11 },
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
  // Keep the authenticated user in module memory across client-side route changes.
  // The module cache is empty during the initial server render, so this remains
  // hydration-safe while preventing the sign-in screen from flashing on every
  // sidebar navigation. sessionStorage is only read after mount.
  const [admin, setAdmin] = useState<AuthMe | null>(() => sessionAdminCache);
  const [checking, setChecking] = useState(() => !sessionAdminCache);
  const [loggingOut, setLoggingOut] = useState(false);
  const [ui, setUi] = useState<UICustomization | null>(null);
  const settings = useMemo(() => loadSettings(), []);
  const connected = !!settings.baseUrl;

  useEffect(() => {
    let cancelled = false;
    const cached = sessionAdminCache ?? readCachedAdmin();
    if (cached) {
      setAdmin(cached);
      setChecking(false);
    }
    if (!settings.baseUrl) { setChecking(false); router.replace("/login"); return; }
    // On client-side route changes, keep rendering from the already-authenticated
    // module cache and validate the HttpOnly session silently in the background.
    // On a fresh load there is no module cache, so we wait for the real session check.
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

  useEffect(() => {
    if (!admin || !settings.baseUrl) return;
    fetchUICustomization(settings).then(setUi).catch(() => {});
  }, [admin, settings]);

  // This hook must run on every render. It cannot live below the auth loading
  // return, otherwise the shell renders a different number/order of hooks when
  // authentication changes and React throws minified error #310.
  const [activeSetting, setActiveSetting] = useState("overview");
  const rawNavigation = Array.isArray(ui?.navigation) ? ui.navigation : [];
  const navigation = (rawNavigation.length ? rawNavigation : defaultNav)
    .filter((item): item is typeof defaultNav[number] => !!item && typeof item === "object" && typeof item.href === "string" && typeof item.id === "string")
    .map((item, index) => ({
      ...item,
      label: typeof item.label === "string" && item.label.trim() ? item.label : item.id,
      section: typeof item.section === "string" && item.section.trim() ? item.section : "Monitor",
      icon: typeof item.icon === "string" ? item.icon : "•",
      permission: typeof item.permission === "string" ? item.permission : "scans.read",
      visible: item.visible !== false,
      order: Number.isFinite(Number(item.order)) ? Number(item.order) : index + 1,
    }))
    .sort((a,b) => a.order - b.order);
  const theme = ui?.theme;
  // Keep concrete theme shapes even while the customization request is loading.
  // Using {} here widens the type and makes strict TypeScript builds fail on property access.
  const pageTheme = theme?.page ?? {
    background: "#f3f2ed",
    surface: "#ffffff",
    border: "#d9d8d2",
    text: "#1b2430",
    muted_text: "#6b7280",
    accent: "#315f9f",
    success: "#4f8a6d",
    warning: "#b7791f",
    error: "#b84a4a",
  };
  const sidebarTheme = theme?.sidebar ?? {
    background: "#17202b",
    text: "#f7f7f3",
    muted_text: "rgba(247,247,243,.55)",
    section_text: "rgba(247,247,243,.42)",
    active_background: "#315f9f",
    active_text: "#ffffff",
    hover_background: "rgba(255,255,255,.08)",
    border: "rgba(255,255,255,.10)",
    width_px: 248,
  };
  const layoutTheme = theme?.layout ?? { density: "comfortable" as const, sidebar_shadow: true };

  if (checking || !admin) {
    return <div className="flex h-screen items-center justify-center bg-paper"><div className="rounded-2xl border border-line bg-white px-7 py-6 text-center shadow-sm"><div className="mx-auto mb-3 h-2.5 w-2.5 animate-pulse rounded-full bg-blueprint"/><p className="font-display text-sm font-semibold">Signing you in…</p><p className="mt-1 text-xs text-ink/40">Preparing your dashboard</p></div></div>;
  }

  const can = (permission: string) => admin.is_super_admin || admin.permissions.includes(permission) || (permission === "admins.manage" && admin.is_super_admin);
  const visibleNav = navigation.filter((item) => item.visible !== false && can(item.permission));
  const settingsItems = [
    { id: "email", label: "Email notifications", icon: "✉", permission: "system.read" },
    { id: "sound", label: "Notification sound", icon: "♪", permission: "system.read" },
    { id: "operations", label: "Operations", icon: "◌", permission: "system.read" },
    { id: "features", label: "Feature flags", icon: "⚑", permission: "system.read" },
    { id: "estimate", label: "Client Estimate", icon: "◇", permission: "system.read" },
    { id: "body", label: "Body Analyzer", icon: "◉", permission: "system.read" },
    { id: "global", label: "Global Variables", icon: "⌁", permission: "system.read" },
    { id: "appearance", label: "Appearance & Navigation", icon: "▤", permission: "system.read" },
    { id: "general", label: "Connection & Runtime", icon: "⚙", permission: "system.read" },
    { id: "access", label: "Users & Access", icon: "♙", permission: "system.read" },
    { id: "database", label: "Database", icon: "▥", permission: "system.read" },
    { id: "logs", label: "Diagnostics & Logs", icon: "≡", permission: "system.read" },
  ];
  const settingsOpen = pathname === "/system";
  // Avoid useSearchParams in the shared shell so every route can be statically prerendered.
  // The query string is only needed for highlighting a nested settings item.
  useEffect(() => {
    if (!settingsOpen) { setActiveSetting("overview"); return; }
    try {
      setActiveSetting(new URLSearchParams(window.location.search).get("section") || "overview");
    } catch {
      setActiveSetting("overview");
    }
  }, [settingsOpen, pathname]);
  const regularNav = visibleNav.filter(item => item.id !== "system");
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
      <div className="desktop-dashboard picd-theme-root flex h-screen min-h-0 overflow-hidden" style={{"--picd-page-bg": pageTheme.background, "--picd-page-surface": pageTheme.surface, "--picd-page-border": pageTheme.border, "--picd-page-text": pageTheme.text, "--picd-page-muted": pageTheme.muted_text, "--picd-page-accent": pageTheme.accent, "--picd-success": pageTheme.success, "--picd-warning": pageTheme.warning, "--picd-error": pageTheme.error, "--picd-sidebar-bg": sidebarTheme.background, "--picd-sidebar-text": sidebarTheme.text, "--picd-sidebar-muted": sidebarTheme.muted_text, "--picd-sidebar-section": sidebarTheme.section_text, "--picd-sidebar-active-bg": sidebarTheme.active_background, "--picd-sidebar-active-text": sidebarTheme.active_text, "--picd-sidebar-hover": sidebarTheme.hover_background, "--picd-sidebar-border": sidebarTheme.border, "--picd-sidebar-width": `${Number(sidebarTheme.width_px) || 248}px` } as CSSProperties}>
        <aside className="picd-sidebar flex h-full shrink-0 flex-col px-4 py-5" style={{width:`${Number(sidebarTheme.width_px) || 248}px`}}>
          <Link href="/" className="picd-sidebar-brand mb-7 block px-3"><p className="font-display text-lg font-semibold leading-tight">Scan Queue<br/>Monitor</p><p className="mt-1 text-xs text-paper/45">PICD measurement pipeline</p></Link>
          <div className="picd-sidebar-live mb-3 flex items-center justify-between gap-2 px-1"><span className="text-[9px] font-bold uppercase tracking-[.18em] text-paper/25">Live center</span><NotificationCenter/></div>
          <div className="picd-sidebar-status mb-4 rounded-xl px-3 py-2.5"><div className="flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${connected ? "bg-sage" : "bg-amber"}`}/><span className="text-[11px] font-semibold">{connected ? "Backend connected" : "Backend URL missing"}</span></div><p className="mt-1 truncate text-[10px] text-paper/35">{connected ? settings.baseUrl : "Set NEXT_PUBLIC_API_BASE_URL or use login"}</p></div>
          <div className="picd-sidebar-signed mb-4 rounded-xl px-3 py-2.5"><p className="text-[9px] uppercase tracking-[.16em] text-paper/30">Signed in</p><div className="mt-1 flex items-center justify-between gap-2"><span className="truncate text-[11px] font-semibold">{admin.username}</span>{admin.is_super_admin && <span className="rounded-full bg-white/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-paper/60">Super admin</span>}</div></div>
          <nav className="flex-1 overflow-y-auto scrollbar-thin">{regularNav.map(item => { const heading=item.section!==lastSection; lastSection=item.section; const active=pathname===item.href || (item.href!=="/" && pathname.startsWith(item.href)); return <div key={item.href}>{heading&&<p className="picd-sidebar-section mb-2 mt-4 px-3 text-[9px] font-bold uppercase tracking-[.18em]">{item.section}</p>}<Link href={item.href} className={`picd-sidebar-link mb-1 flex items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-medium transition ${active?"is-active":""}`}><span className="w-4 text-center text-sm opacity-80">{item.icon}</span><span>{item.label}</span>{active&&<span className="ml-auto h-1.5 w-1.5 rounded-full bg-blueprint"/>}</Link></div>; })}{can("system.read") && <div className="mt-4"><p className="picd-sidebar-section mb-2 px-3 text-[9px] font-bold uppercase tracking-[.18em]">Settings</p><div className="space-y-2">{[["Notifications",settingsItems.filter(x=>["email","sound"].includes(x.id))],["Processing",settingsItems.filter(x=>["operations","features","estimate","body","global"].includes(x.id))],["Workspace",settingsItems.filter(x=>["appearance","general"].includes(x.id))],["Access & Data",settingsItems.filter(x=>["access","database"].includes(x.id))],["Diagnostics",settingsItems.filter(x=>x.id==="logs")]].map(([group,items]) => <div key={String(group)}><p className="px-3 pb-1 text-[8px] font-bold uppercase tracking-[.13em] text-paper/25">{String(group)}</p><div>{(items as typeof settingsItems).map(x => <Link key={x.id} href={`/system?section=${x.id}`} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-[10px] font-medium transition ${settingsOpen && activeSetting === x.id ? "bg-white/10 text-white" : "text-paper/45 hover:bg-white/[.06] hover:text-paper/80"}`}><span className="w-4 text-center text-[12px] opacity-80">{x.icon}</span><span>{x.label}</span>{settingsOpen && activeSetting === x.id && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-blueprint"/>}</Link>)}</div></div>)}</div></div>}</nav>
          <button onClick={signOut} disabled={loggingOut} className="picd-sidebar-signout mt-4 rounded-xl px-3 py-2.5 text-left text-[11px] font-semibold transition disabled:opacity-50">{loggingOut ? "Signing out…" : "Sign out"}</button>
          <div className="picd-sidebar-footer mt-3 border-t pt-4 px-3"><p className="text-[9px] uppercase tracking-[.18em] text-paper/25">PICD Control Center</p><p className="mt-1 text-[10px] leading-relaxed text-paper/35">Protected by server-side authentication and role-based permissions.</p></div>
        </aside>
        <main className="picd-main min-w-0 flex-1 overflow-hidden">{children}</main>
      </div>
    </>
  );
}
