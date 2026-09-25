"use client";

import dynamic from "next/dynamic";
import AppShell from "@/components/AppShell";

const IllustratorEditor = dynamic(() => import("@/components/IllustratorEditor"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-xs text-ink/40">
      Loading PICD Artwork…
    </div>
  ),
});

export default function ArtworkPage() {
  return (
    <AppShell>
      <div className="picd-creative-scope h-full min-h-0 overflow-hidden">
        <IllustratorEditor />
      </div>
    </AppShell>
  );
}
