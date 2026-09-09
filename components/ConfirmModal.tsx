"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";

export default function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "default",
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "default" | "danger";
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onCancel();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, busy, onCancel]);

  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
      <div className="absolute inset-0 bg-blueprint/45 backdrop-blur-[2px]" onMouseDown={() => !busy && onCancel()} />
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-line bg-paper shadow-2xl animate-modal-panel">
        <div className="p-6">
          <div className={`mb-4 flex h-10 w-10 items-center justify-center rounded-xl text-sm font-bold ${tone === "danger" ? "bg-brick/10 text-brick" : "bg-blueprint/10 text-blueprint"}`}>
            {tone === "danger" ? "!" : "?"}
          </div>
          <h2 id="confirm-title" className="font-display text-xl font-semibold">{title}</h2>
          <p className="mt-2 text-sm leading-relaxed text-ink/55">{message}</p>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-line bg-white/70 px-6 py-4">
          <button disabled={busy} onClick={onCancel} className="rounded-xl border border-line bg-white px-4 py-2.5 text-xs font-semibold text-ink/60 hover:border-ink/20 disabled:opacity-40">{cancelLabel}</button>
          <button disabled={busy} onClick={onConfirm} className={`rounded-xl px-4 py-2.5 text-xs font-semibold text-paper shadow-sm disabled:opacity-40 ${tone === "danger" ? "bg-brick" : "bg-blueprint"}`}>{busy ? "Working…" : confirmLabel}</button>
        </div>
      </div>
    </div>,
    document.body
  );
}
