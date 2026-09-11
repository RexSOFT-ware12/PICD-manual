"use client";

import AppShell from "@/components/AppShell";
import { useEffect, useState } from "react";
import { fetchCurrentAdmin, loadSettings, type AuthMe } from "@/lib/api";

export default function ProfilePage() {
  const [admin, setAdmin] = useState<AuthMe | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCurrentAdmin(loadSettings()).then(setAdmin).catch(() => {}).finally(() => setLoading(false));
  }, []);

  return <AppShell><div className="h-full overflow-y-auto bg-paper px-8 py-7"><div className="mx-auto max-w-4xl"><header className="mb-7"><p className="text-[10px] font-bold uppercase tracking-[.18em] text-ink/30">Account</p><h1 className="mt-1 font-display text-3xl font-semibold">My profile</h1><p className="mt-1 text-sm text-ink/45">Your PICDs administrator account and access summary.</p></header><section className="overflow-hidden rounded-2xl border border-line bg-white shadow-sm"><div className="flex items-center gap-4 border-b border-line px-6 py-6"><div className="flex h-14 w-14 items-center justify-center rounded-full bg-blueprint font-display text-xl font-semibold text-paper">{admin?.username?.slice(0,1).toUpperCase() || "?"}</div><div><h2 className="font-display text-lg font-semibold">{loading ? "Loading profile…" : admin?.username || "Administrator"}</h2><p className="mt-1 text-xs text-ink/45">{admin?.is_super_admin ? "Super admin" : "Administrator"}</p></div></div><div className="grid grid-cols-2 gap-px bg-line"><div className="bg-white px-6 py-5"><p className="text-[9px] font-bold uppercase tracking-[.16em] text-ink/30">Username</p><p className="mt-2 text-sm font-semibold">{admin?.username || "—"}</p></div><div className="bg-white px-6 py-5"><p className="text-[9px] font-bold uppercase tracking-[.16em] text-ink/30">Role</p><p className="mt-2 text-sm font-semibold">{admin?.is_super_admin ? "Super admin" : "Administrator"}</p></div><div className="bg-white px-6 py-5"><p className="text-[9px] font-bold uppercase tracking-[.16em] text-ink/30">Permissions</p><p className="mt-2 text-sm font-semibold">{admin?.is_super_admin ? "All permissions" : `${admin?.permissions?.length || 0} permissions`}</p></div><div className="bg-white px-6 py-5"><p className="text-[9px] font-bold uppercase tracking-[.16em] text-ink/30">Session</p><p className="mt-2 text-sm font-semibold">Authenticated</p></div></div></section></div></div></AppShell>;
}
