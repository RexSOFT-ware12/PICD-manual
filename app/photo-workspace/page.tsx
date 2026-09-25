"use client";

import dynamic from "next/dynamic";
import AppShell from "@/components/AppShell";
import WebPipelineStage from "@/components/WebPipelineStage";
import { useEffect, useState } from "react";

// Konva touches the DOM/canvas, so it must never be rendered on the server.
const Editor = dynamic(() => import("@/components/Editor"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-xs text-ink/40">
      Loading Photo Workspace…
    </div>
  ),
});

export default function PhotoWorkspacePage() {
  const [pipeline, setPipeline] = useState<string | null>(null);
  useEffect(() => {
    setPipeline(new URLSearchParams(window.location.search).get("pipeline"));
  }, []);
  return (
    <AppShell>
      <div className="picd-creative-scope h-full min-h-0 overflow-hidden">
        {pipeline ? <WebPipelineStage scanId={pipeline} stage="photo" /> : <Editor />}
      </div>
    </AppShell>
  );
}
