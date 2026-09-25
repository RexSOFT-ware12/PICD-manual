"use client";

import dynamic from "next/dynamic";
import AppShell from "@/components/AppShell";
import WebPipelineStage from "@/components/WebPipelineStage";
import { useEffect, useState } from "react";

const IllustratorEditor = dynamic(() => import("@/components/IllustratorEditor"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-xs text-ink/40">
      Loading PICD Artwork…
    </div>
  ),
});

export default function ArtworkPage() {
  const [pipeline, setPipeline] = useState<string | null>(null);
  useEffect(() => {
    setPipeline(new URLSearchParams(window.location.search).get("pipeline"));
  }, []);
  return (
    <AppShell>
      <div className="picd-creative-scope h-full min-h-0 overflow-hidden">
        {pipeline ? <WebPipelineStage scanId={pipeline} stage="artwork" /> : <IllustratorEditor />}
      </div>
    </AppShell>
  );
}
