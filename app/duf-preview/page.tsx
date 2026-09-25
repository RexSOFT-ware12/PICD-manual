"use client";

import dynamic from "next/dynamic";
import AppShell from "@/components/AppShell";

// three.js touches the canvas/WebGL context, so it must never render on the server.
const Workspace = dynamic(() => import("@/components/Workspace"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-xs text-ink/40">
      Loading Duf Preview…
    </div>
  ),
});

export default function DufPreviewPage() {
  return (
    <AppShell>
      <div className="picd-duf-scope h-full min-h-0 overflow-hidden">
        <Workspace />
      </div>
    </AppShell>
  );
}
