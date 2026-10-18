"use client";

import { ChangeEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import { ApiError, loadSettings, submitGarmentExtraction } from "@/lib/api";

const ACCEPTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function fileNameFromHeader(value: string | null) {
  const match = value?.match(/filename\*?=(?:UTF-8''|\")?([^\";]+)/i);
  return match?.[1]?.replace(/\"/g, "").trim() || "garment-extraction-result";
}

export default function GarmentExtractorPage() {
  const settings = useMemo(() => loadSettings(), []);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<unknown>(null);
  const [downloadBlob, setDownloadBlob] = useState<Blob | null>(null);
  const [downloadName, setDownloadName] = useState("garment-extraction-result");
  const inputId = "garment-image-upload";

  useEffect(() => {
    if (!file) { setPreviewUrl(null); return; }
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const chosen = event.target.files?.[0] || null;
    setError(null);
    setResult(null);
    setDownloadBlob(null);
    if (chosen && !ACCEPTED_TYPES.has(chosen.type)) {
      setFile(null);
      event.target.value = "";
      setError("Choose a PNG, JPEG, or WebP image.");
      return;
    }
    setFile(chosen);
  }

  async function extract() {
    if (!file || busy) return;
    setBusy(true);
    setError(null);
    setResult(null);
    setDownloadBlob(null);
    try {
      const response = await submitGarmentExtraction(settings, file);
      const contentType = response.headers.get("content-type") || "";
      if (contentType.toLowerCase().includes("json")) {
        setResult(await response.json());
      } else {
        setDownloadName(fileNameFromHeader(response.headers.get("content-disposition")));
        setDownloadBlob(await response.blob());
      }
    } catch (e) {
      setError(e instanceof ApiError
        ? `${e.message}.`
        : "Garment extraction failed. Check the PICD backend connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  function downloadResult() {
    if (!downloadBlob) return;
    const objectUrl = URL.createObjectURL(downloadBlob);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = downloadName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  }

  return <AppShell>
    <div className="h-full overflow-y-auto bg-paper px-7 py-6">
      <div className="mx-auto max-w-[1400px]">
        <header className="mb-5 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[.18em] text-ink/30">Workspace · FabricNow</p>
            <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight">Garment Extractor</h1>
            <p className="mt-1 text-sm text-ink/45">Upload a garment image to extract its garment package and parts.</p>
          </div>
          <Link href="/system/fabricnow" className="rounded-xl border border-line bg-white px-4 py-2.5 text-xs font-semibold text-ink/60 shadow-sm transition hover:border-blueprint/30 hover:text-blueprint">FabricNow settings</Link>
        </header>

        {error && <div role="alert" className="mb-4 rounded-xl border border-brick/20 bg-brick/5 px-4 py-3 text-sm leading-5 text-brick">{error}</div>}

        <div className="grid min-h-[500px] gap-5 lg:grid-cols-[minmax(330px,.8fr)_minmax(0,1.2fr)]">
          <section className="flex flex-col rounded-2xl border border-line bg-white p-5 shadow-sm">
            <div>
              <p className="text-[9px] font-bold uppercase tracking-[.15em] text-ink/30">Input</p>
              <h2 className="mt-1 font-display text-lg font-semibold">Garment image</h2>
              <p className="mt-1 text-xs leading-5 text-ink/45">Use one clear image of the garment. PNG, JPEG, and WebP are supported; file size limits are set by FabricNow.</p>
            </div>

            <label htmlFor={inputId} className="mt-5 flex min-h-[300px] cursor-pointer flex-1 items-center justify-center overflow-hidden rounded-2xl border border-dashed border-blueprint/25 bg-paper/45 p-4 text-center transition hover:bg-paper">
              <input id={inputId} type="file" accept="image/png,image/jpeg,image/webp" onChange={chooseFile} className="sr-only" />
              {previewUrl ? <div className="flex h-full w-full flex-col items-center justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={previewUrl} alt="Selected garment preview" className="max-h-[340px] max-w-full rounded-xl object-contain" />
                <p className="mt-3 max-w-full truncate text-xs font-semibold">{file?.name}</p>
                <p className="mt-1 text-[10px] text-ink/35">{file ? `${(file.size / 1024 / 1024).toFixed(2)} MB` : ""} · Click to choose another image</p>
              </div> : <div>
                <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-blueprint text-xl text-paper">✂</span>
                <p className="mt-4 text-sm font-semibold">Choose a garment image</p>
                <p className="mt-1 text-[10px] text-ink/35">PNG · JPEG · WebP</p>
              </div>}
            </label>

            <button type="button" onClick={() => void extract()} disabled={!file || busy} className="mt-4 min-h-12 rounded-xl bg-blueprint px-4 py-3 text-sm font-semibold text-paper shadow-sm transition hover:bg-blueprint/90 disabled:cursor-not-allowed disabled:opacity-40">{busy ? "Extracting garment…" : "Extract garment"}</button>
            <p className="mt-3 text-center text-[10px] leading-4 text-ink/35">The extractor uses the key from server-side storage; the image upload request does not include the key.</p>
          </section>

          <section className="flex min-h-[500px] flex-col overflow-hidden rounded-2xl border border-line bg-white shadow-sm">
            <div className="shrink-0 border-b border-line px-5 py-4">
              <p className="text-[9px] font-bold uppercase tracking-[.15em] text-ink/30">Output</p>
              <h2 className="mt-1 font-display text-lg font-semibold">Extracted garment data</h2>
              <p className="mt-1 text-xs text-ink/40">The FabricNow response is shown as structured data or saved as a returned package.</p>
            </div>
            <div className="min-h-0 flex-1 overflow-auto p-5">
              {busy ? <div className="flex h-full min-h-[320px] flex-col items-center justify-center text-center"><span className="h-8 w-8 animate-spin rounded-full border-2 border-blueprint/15 border-t-blueprint"/><p className="mt-4 text-sm font-semibold">Processing image</p><p className="mt-1 text-xs text-ink/40">FabricNow is extracting garment parts.</p></div>
                : result !== null ? <div>
                  <div className="mb-3 flex items-center justify-between gap-3"><p className="text-xs font-semibold">JSON response</p><button type="button" onClick={() => { const blob = new Blob([JSON.stringify(result, null, 2)], { type: "application/json" }); const objectUrl = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = objectUrl; anchor.download = "garment-extraction.json"; anchor.click(); URL.revokeObjectURL(objectUrl); }} className="rounded-lg border border-line px-3 py-2 text-[10px] font-semibold text-ink/55">Download JSON</button></div>
                  <pre className="max-h-[620px] overflow-auto rounded-xl bg-blueprint p-4 font-mono text-[10px] leading-5 text-paper/85">{JSON.stringify(result, null, 2)}</pre>
                </div> : downloadBlob ? <div className="flex min-h-[320px] flex-col items-center justify-center text-center"><span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-sage/10 text-2xl text-sage">✓</span><p className="mt-4 text-sm font-semibold">Garment package ready</p><p className="mt-1 max-w-md break-all text-xs text-ink/40">{downloadName}</p><button type="button" onClick={downloadResult} className="mt-4 rounded-xl bg-blueprint px-4 py-3 text-xs font-semibold text-paper">Download package</button></div>
                  : <div className="flex min-h-[320px] flex-col items-center justify-center text-center"><span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-line bg-paper text-xl text-ink/25">◌</span><p className="mt-4 text-sm font-semibold text-ink/60">Results will appear here</p><p className="mt-1 max-w-sm text-xs leading-5 text-ink/40">Choose an image and run extraction. The endpoint may return JSON data or a downloadable package.</p></div>}
            </div>
          </section>
        </div>
      </div>
    </div>
  </AppShell>;
}
