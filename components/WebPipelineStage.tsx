"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { completeWebProcessing, uploadWebArtifact, fetchWebArtifact, loadSettings, startWebProcessing, fetchScans, type ConnectionSettings } from "@/lib/api";

type Stage = "photo" | "artwork";

function absoluteUrl(settings: ConnectionSettings, path: string) {
  return `${settings.baseUrl.replace(/\/$/, "")}${path}`;
}

async function fetchBlob(settings: ConnectionSettings, path: string) {
  const res = await fetch(absoluteUrl(settings, path), {
    credentials: "include",
    headers: settings.apiKey ? { "X-API-Key": settings.apiKey } : undefined,
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Could not load source image (${res.status}).`);
  return res.blob();
}

async function imageFromBlob(blob: Blob) {
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function removeBackgroundBrowser(blob: Blob, onProgress: (s: string) => void) {
  onProgress("Loading browser AI…");
  // Keep the AI package out of the Next.js webpack graph. Next 14's webpack
  // pipeline is not compatible with the package's current ESM/ONNX imports.
  // The browser loads the official ESM build directly and the model is cached
  // after its first run.
  const loadModule = new Function(
    "url",
    "return import(url)"
  ) as (url: string) => Promise<any>;
  const mod = await loadModule(
    "https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.7.0/+esm"
  );
  const removeBackground = mod.removeBackground ?? mod.default;
  if (typeof removeBackground !== "function") throw new Error("The AI background-removal module did not load correctly.");
  return await removeBackground(blob, {
    model: "isnet_fp16",
    output: { format: "image/png", type: "foreground" },
    progress: (key: string, current: number, total: number) => {
      const pct = total ? Math.round((current / total) * 100) : 0;
      onProgress(String(key).startsWith("fetch") ? `Downloading AI model… ${pct}%` : `Detecting subject… ${pct}%`);
    },
  });
}

function canvasToDataUrl(img: HTMLImageElement, maxWidth = 1400) {
  const scale = Math.min(1, maxWidth / Math.max(1, img.naturalWidth));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
  return { data: canvas.toDataURL("image/png"), width: canvas.width, height: canvas.height };
}

async function buildArtworkSvg(frontBlob: Blob, sideBlob: Blob, onProgress: (s: string) => void) {
  const frontPng = await removeBackgroundBrowser(frontBlob, onProgress);
  onProgress("Processing side image…");
  const sidePng = await removeBackgroundBrowser(sideBlob, onProgress);
  onProgress("Building Photo Workspace result…");
  const [front, side] = await Promise.all([imageFromBlob(frontPng), imageFromBlob(sidePng)]);
  const f = canvasToDataUrl(front);
  const s = canvasToDataUrl(side);
  const height = Math.max(f.height, s.height);
  const gap = 48;
  const width = f.width + gap + s.width;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="#ffffff"/>
  <image href="${f.data}" x="0" y="0" width="${f.width}" height="${f.height}" preserveAspectRatio="none"/>
  <image href="${s.data}" x="${f.width + gap}" y="0" width="${s.width}" height="${s.height}" preserveAspectRatio="none"/>
</svg>`;
}

export default function WebPipelineStage({ scanId, stage }: { scanId: string; stage: Stage }) {
  const router = useRouter();
  const [settings] = useState(loadSettings);
  const [status, setStatus] = useState("Preparing…");
  const [error, setError] = useState<string | null>(null);
  const [svg, setSvg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!settings.baseUrl) throw new Error("Backend connection is not configured.");
        if (stage === "photo") {
          await startWebProcessing(settings, scanId).catch((e: any) => {
            // The drag action already reserves the session; a second start is harmless.
            if (e?.status !== 409) throw e;
          });
          const scans = await fetchScans(settings, { q: scanId, limit: 5 });
          const scan = scans.scans.find((x) => x.scan_id === scanId);
          if (!scan) throw new Error("Scan was not found.");
          const frontPath = `/monitor/scans/${encodeURIComponent(scanId)}/image/front`;
          const sidePath = `/monitor/scans/${encodeURIComponent(scanId)}/image/side`;
          setStatus("Downloading front and side images…");
          const [front, side] = await Promise.all([fetchBlob(settings, frontPath), fetchBlob(settings, sidePath)]);
          const result = await buildArtworkSvg(front, side, m => !cancelled && setStatus(m));
          if (cancelled) return;
          await uploadWebArtifact(settings, scanId, result);
          setStatus("Photo Workspace complete. Opening Artwork…");
          window.setTimeout(() => { if (!cancelled) router.replace(`/illustrator?pipeline=${encodeURIComponent(scanId)}`); }, 300);
        } else {
          setStatus("Opening the Artwork result…");
          const result = await fetchWebArtifact(settings, scanId);
          if (cancelled) return;
          setSvg(result.svg);
          setStatus("Artwork is ready. Releasing desktop DAZ…");
          // Re-submit the same final SVG so the server has an explicit Artwork
          // completion event. This endpoint also releases the DAZ worker.
          await completeWebProcessing(settings, scanId, result.svg);
          setStatus("Artwork complete. DAZ Studio is now running on the desktop worker.");
          window.setTimeout(() => { if (!cancelled) router.replace(`/?pipeline=${encodeURIComponent(scanId)}`); }, 900);
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message || String(e));
      }
    })();
    return () => { cancelled = true; };
  }, [scanId, stage, settings, router]);

  return (
    <div className="flex h-full min-h-0 items-center justify-center bg-[#f4f3ef] p-8">
      <div className="w-full max-w-2xl rounded-2xl border border-line bg-white p-7 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blueprint/10 text-blueprint text-lg">{stage === "photo" ? "▧" : "✎"}</div>
          <div>
            <p className="text-[9px] font-bold uppercase tracking-[.16em] text-ink/35">PICD web pipeline</p>
            <h1 className="mt-1 font-display text-xl font-semibold">{stage === "photo" ? "Photo Workspace" : "Artwork"}</h1>
          </div>
        </div>
        <div className="mt-7 rounded-xl border border-line bg-paper p-4">
          <div className="flex items-center gap-3">
            {!error && <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-blueprint" />}
            <p className="text-sm font-medium">{error ? "Pipeline stopped" : status}</p>
          </div>
          <p className="mt-2 text-xs leading-5 text-ink/45">
            {stage === "photo"
              ? "The browser is performing the Photo Workspace equivalent of the Photoshop image-preparation stage."
              : "The browser is handing the completed Artwork SVG to the desktop processing agent. Photoshop and Illustrator remain untouched on this run."}
          </p>
        </div>
        {svg && <div className="mt-5 overflow-hidden rounded-xl border border-line bg-white"><img src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`} alt="Artwork preview" className="block max-h-[420px] w-full object-contain" /></div>}
        {error && <div className="mt-5 rounded-xl border border-brick/20 bg-brick/5 px-4 py-3 text-xs leading-5 text-brick">{error}</div>}
      </div>
    </div>
  );
}
