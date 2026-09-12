"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AppShell from "@/components/AppShell";
import ConfirmModal from "@/components/ConfirmModal";
import { ApiError, createCollectionRow, deleteCollectionRow, fetchCollection, fetchCollections, loadSettings, updateCollectionRow, type DatabaseCollection, type DatabaseCollectionRow } from "@/lib/api";

const display = (v: unknown) => v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
const parseValue = (raw: string, original: unknown) =>
  typeof original === "number" ? (raw === "" ? null : Number(raw)) :
  typeof original === "boolean" ? raw === "true" :
  original !== null && typeof original === "object" ? (raw ? (() => { try { return JSON.parse(raw); } catch { return raw; } })() : null) :
  raw;

function Editor({ row, onSave, onClose, busy }: { row: DatabaseCollectionRow; onSave: (d: Record<string, unknown>) => void; onClose: () => void; busy: boolean }) {
  const [draft, setDraft] = useState(row.data);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-blueprint/50 px-8 py-8">
      <div className="flex max-h-[92vh] w-[1100px] flex-col overflow-hidden rounded-2xl border border-line bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <div>
            <p className="text-[9px] font-bold uppercase tracking-[.18em] text-ink/30">Database collection</p>
            <h2 className="mt-1 font-display text-xl font-semibold">Edit document</h2>
            <p className="mt-1 font-mono text-[10px] text-ink/35">{row.id}</p>
          </div>
          <button onClick={onClose} disabled={busy} className="rounded-lg border border-line px-3 py-2 text-xs">Close</button>
        </div>
        <div className="grid grid-cols-3 gap-4 overflow-y-auto p-6">
          {Object.keys(draft).map(k => (
            <label key={k} className="text-[10px] font-bold uppercase tracking-wide text-ink/45">
              {k}
              <textarea value={display(draft[k])} onChange={e => setDraft(d => ({ ...d, [k]: parseValue(e.target.value, d[k]) }))} className="mt-1.5 min-h-11 w-full rounded-xl border border-line bg-paper px-3 py-2.5 text-xs font-normal normal-case tracking-normal text-ink outline-none focus:border-blueprint" />
            </label>
          ))}
        </div>
        <div className="flex items-center justify-between border-t border-line bg-paper/50 px-6 py-4">
          <p className="text-[10px] text-ink/35">Objects and arrays are edited as JSON.</p>
          <div className="flex gap-2">
            <button onClick={onClose} disabled={busy} className="rounded-xl border border-line bg-white px-4 py-2.5 text-xs font-semibold">Cancel</button>
            <button onClick={() => onSave(draft)} disabled={busy} className="rounded-xl bg-blueprint px-5 py-2.5 text-xs font-semibold text-paper">{busy ? "Saving…" : "Save document"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function NewEditor({ onSave, onClose, busy }: { onSave: (d: Record<string, unknown>) => void; onClose: () => void; busy: boolean }) {
  const [text, setText] = useState("{\n  \n}");
  const [error, setError] = useState("");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-blueprint/50 px-8 py-8">
      <div className="w-[760px] rounded-2xl border border-line bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <div>
            <p className="text-[9px] font-bold uppercase tracking-[.18em] text-ink/30">Database collection</p>
            <h2 className="mt-1 font-display text-xl font-semibold">Add document</h2>
          </div>
          <button onClick={onClose} className="rounded-lg border border-line px-3 py-2 text-xs">Close</button>
        </div>
        <div className="p-6">
          <p className="mb-2 text-xs text-ink/45">Enter the new MongoDB document as JSON.</p>
          <textarea value={text} onChange={e => { setText(e.target.value); setError(""); }} className="h-80 w-full rounded-xl border border-line bg-paper p-4 font-mono text-xs outline-none focus:border-blueprint" />
          {error && <p className="mt-3 text-xs text-brick">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 border-t border-line bg-paper/50 px-6 py-4">
          <button onClick={onClose} className="rounded-xl border border-line bg-white px-4 py-2.5 text-xs font-semibold">Cancel</button>
          <button disabled={busy} onClick={() => { try { const d = JSON.parse(text); if (!d || Array.isArray(d) || typeof d !== "object") throw Error(); onSave(d); } catch { setError("Enter a valid JSON object."); } }} className="rounded-xl bg-blueprint px-5 py-2.5 text-xs font-semibold text-paper">{busy ? "Saving…" : "Create document"}</button>
        </div>
      </div>
    </div>
  );
}

/** Custom collection picker: replaces the native <select> with a styled
 * dropdown that can show its own loading skeleton and empty state,
 * neither of which a native <select> can do. */
function CollectionDropdown({ collections, selected, onSelect, loading }: { collections: DatabaseCollection[]; selected: string; onSelect: (name: string) => void; loading: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const current = collections.find(c => c.name === selected);

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", handler); document.removeEventListener("keydown", esc); };
  }, []);

  if (loading) {
    return (
      <div className="rounded-2xl border border-line bg-white px-4 py-3">
        <p className="text-[9px] font-bold uppercase tracking-[.15em] text-ink/30">Collection</p>
        <div className="mt-2.5 flex items-center gap-2">
          <span className="h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-ink/15 border-t-blueprint" />
          <span className="h-4 w-32 animate-pulse rounded bg-ink/5" />
        </div>
        <p className="mt-1.5 text-[9px] text-ink/30">Loading collections…</p>
      </div>
    );
  }

  if (collections.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-line bg-white px-4 py-3">
        <p className="text-[9px] font-bold uppercase tracking-[.15em] text-ink/30">Collection</p>
        <p className="mt-2 text-sm font-semibold text-ink/35">No collections found</p>
        <p className="mt-1 text-[9px] text-ink/30">Collections appear here once the pipeline writes to MongoDB.</p>
      </div>
    );
  }

  return (
    <div ref={ref} className="relative rounded-2xl border border-line bg-white px-4 py-3">
      <p className="text-[9px] font-bold uppercase tracking-[.15em] text-ink/30">Collection</p>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="mt-1 flex w-full items-center justify-between gap-2 text-left"
      >
        <span className="min-w-0 truncate text-sm font-semibold text-ink">{current ? current.name : "Select a collection…"}</span>
        <span className={`shrink-0 text-ink/35 transition-transform ${open ? "rotate-180" : ""}`}>⌄</span>
      </button>
      <p className="mt-1 text-[9px] text-ink/35">{current ? `${current.rows.toLocaleString()} document${current.rows === 1 ? "" : "s"}` : "Auto-detected from MongoDB"}</p>

      {open && (
        <div role="listbox" className="animate-fade-in absolute left-0 right-0 top-full z-20 mt-2 max-h-72 overflow-y-auto rounded-2xl border border-line bg-white p-1.5 shadow-2xl">
          {collections.map(c => (
            <button
              key={c.name}
              type="button"
              role="option"
              aria-selected={c.name === selected}
              onClick={() => { onSelect(c.name); setOpen(false); }}
              className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left text-xs transition ${c.name === selected ? "bg-blueprint/10 text-blueprint" : "text-ink/65 hover:bg-paper"}`}
            >
              <span className="min-w-0 truncate font-medium">{c.name}</span>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-semibold ${c.name === selected ? "bg-blueprint/15 text-blueprint" : "bg-ink/5 text-ink/40"}`}>{c.rows.toLocaleString()}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function CollectionsPage() {
  const settings = useMemo(() => loadSettings(), []);
  const [collections, setCollections] = useState<DatabaseCollection[]>([]);
  const [selected, setSelected] = useState("");
  const [rows, setRows] = useState<DatabaseCollectionRow[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [q, setQ] = useState("");
  const [collectionsLoading, setCollectionsLoading] = useState(true);
  const [rowsLoading, setRowsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<DatabaseCollectionRow | null>(null);
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<DatabaseCollectionRow | null>(null);
  const [busy, setBusy] = useState(false);

  const loadCollections = useCallback(async () => {
    setCollectionsLoading(true);
    try {
      const r = await fetchCollections(settings);
      setCollections(r.collections);
      setSelected(s => (s && r.collections.some(x => x.name === s)) ? s : (r.collections[0]?.name || ""));
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load database collections.");
    } finally {
      setCollectionsLoading(false);
    }
  }, [settings]);

  const loadRows = useCallback(async () => {
    if (!selected) { setRows([]); setColumns([]); return; }
    setRowsLoading(true);
    try {
      const r = await fetchCollection(settings, selected, { q, limit: 200 });
      setRows(r.items);
      setColumns(r.columns);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load collection.");
    } finally {
      setRowsLoading(false);
    }
  }, [settings, selected, q]);

  useEffect(() => { void loadCollections(); }, [loadCollections]);
  useEffect(() => { void loadRows(); }, [loadRows]);

  const save = async (data: Record<string, unknown>) => {
    if (!editing) return;
    setBusy(true);
    try { await updateCollectionRow(settings, selected, editing.id, data); setEditing(null); await loadRows(); }
    catch (e) { setError(e instanceof ApiError ? e.message : "Could not save document."); }
    finally { setBusy(false); }
  };
  const add = async (data: Record<string, unknown>) => {
    setBusy(true);
    try { await createCollectionRow(settings, selected, data); setAdding(false); await Promise.all([loadRows(), loadCollections()]); }
    catch (e) { setError(e instanceof ApiError ? e.message : "Could not create document."); }
    finally { setBusy(false); }
  };
  const del = async () => {
    if (!deleting) return;
    setBusy(true);
    try { await deleteCollectionRow(settings, selected, deleting.id); setDeleting(null); await Promise.all([loadRows(), loadCollections()]); }
    catch (e) { setError(e instanceof ApiError ? e.message : "Could not delete document."); }
    finally { setBusy(false); }
  };

  const noCollectionsYet = !collectionsLoading && collections.length === 0;
  const currentCount = collections.find(c => c.name === selected)?.rows ?? 0;

  let tableBody: React.ReactNode;
  if (collectionsLoading) {
    tableBody = (
      <tbody>
        {Array.from({ length: 6 }).map((_, i) => (
          <tr key={i} className="border-b border-line last:border-0">
            <td colSpan={Math.max(columns.length + 1, 2)} className="px-6 py-3"><div className="h-3.5 w-full max-w-md animate-pulse rounded bg-ink/[.04]" /></td>
          </tr>
        ))}
      </tbody>
    );
  } else if (noCollectionsYet) {
    tableBody = (
      <tbody><tr><td colSpan={Math.max(columns.length + 1, 2)} className="px-6 py-16 text-center">
        <p className="text-3xl">▤</p>
        <p className="mt-3 text-sm font-semibold text-ink/45">No collections found</p>
        <p className="mt-1 text-xs text-ink/30">Collections are detected automatically once the pipeline writes documents to MongoDB.</p>
      </td></tr></tbody>
    );
  } else if (!selected) {
    tableBody = (
      <tbody><tr><td colSpan={Math.max(columns.length + 1, 2)} className="px-6 py-16 text-center text-xs text-ink/30">Select a collection to begin.</td></tr></tbody>
    );
  } else if (rowsLoading) {
    tableBody = (
      <tbody>
        {Array.from({ length: 8 }).map((_, i) => (
          <tr key={i} className="border-b border-line last:border-0">
            {columns.length > 0 ? columns.map(c => <td key={c} className="px-3 py-2.5"><div className="h-3 w-full max-w-[140px] animate-pulse rounded bg-ink/[.05]" /></td>) : <td className="px-3 py-2.5"><div className="h-3 w-full max-w-[140px] animate-pulse rounded bg-ink/[.05]" /></td>}
            <td className="px-3 py-2.5" />
          </tr>
        ))}
      </tbody>
    );
  } else if (rows.length === 0) {
    tableBody = (
      <tbody><tr><td colSpan={Math.max(columns.length + 1, 2)} className="px-6 py-16 text-center">
        <p className="text-3xl">{q ? "⌕" : "▢"}</p>
        <p className="mt-3 text-sm font-semibold text-ink/45">{q ? "No documents match your search." : "This collection has no documents yet."}</p>
        {q && <button onClick={() => setQ("")} className="mt-2 text-xs font-semibold text-blueprint hover:underline">Clear search</button>}
      </td></tr></tbody>
    );
  } else {
    tableBody = (
      <tbody>
        {rows.map(r => (
          <tr key={r.id} className="border-b border-line last:border-0 hover:bg-paper/60">
            {columns.map(c => <td key={c} title={display(r.data[c])} className="max-w-[280px] whitespace-nowrap px-3 py-2.5 text-ink/55">{display(r.data[c]).slice(0, 90)}</td>)}
            <td className="sticky right-0 whitespace-nowrap border-l border-line bg-white px-3 py-2 text-right">
              <button onClick={() => setEditing(r)} className="mr-2 rounded-lg border border-line px-2.5 py-1.5 text-[9px] font-semibold">Edit</button>
              <button onClick={() => setDeleting(r)} className="rounded-lg border border-brick/15 px-2.5 py-1.5 text-[9px] font-semibold text-brick">Delete</button>
            </td>
          </tr>
        ))}
      </tbody>
    );
  }

  return (
    <AppShell>
      <div className="h-full min-h-0 overflow-hidden bg-paper px-8 py-6">
        <div className="mx-auto flex h-full min-h-0 max-w-[1500px] flex-col">
          <header className="mb-5 flex shrink-0 items-end justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[.18em] text-ink/30">Control · Data</p>
              <h1 className="mt-1 font-display text-3xl font-semibold">Collections</h1>
              <p className="mt-1 text-sm text-ink/45">Browse and edit the MongoDB data collections used by the processing pipeline.</p>
            </div>
            <button onClick={() => setAdding(true)} disabled={!selected || noCollectionsYet} className="rounded-xl bg-blueprint px-4 py-2.5 text-xs font-semibold text-paper disabled:opacity-40">Add document</button>
          </header>

          {error && <div className="mb-4 flex items-center justify-between rounded-xl border border-brick/20 bg-brick/5 px-4 py-3 text-xs text-brick"><span>{error}</span><button onClick={() => setError(null)}>Dismiss</button></div>}

          <section className="mb-5 grid shrink-0 grid-cols-[300px_1fr_180px] gap-3">
            <CollectionDropdown collections={collections} selected={selected} onSelect={setSelected} loading={collectionsLoading} />
            <div className="rounded-2xl border border-line bg-white px-4 py-3">
              <p className="text-[9px] font-bold uppercase tracking-[.15em] text-ink/30">Search</p>
              <input value={q} onChange={e => setQ(e.target.value)} disabled={noCollectionsYet || !selected} placeholder="Search documents…" className="mt-1 w-full bg-transparent text-sm outline-none disabled:text-ink/25" />
            </div>
            <div className="rounded-2xl border border-line bg-white px-4 py-3">
              <p className="text-[9px] font-bold uppercase tracking-[.15em] text-ink/30">Database</p>
              {collectionsLoading ? <div className="mt-1.5 h-4 w-20 animate-pulse rounded bg-ink/5" /> : <p className="mt-1 text-sm font-semibold">{collections.length} collection{collections.length === 1 ? "" : "s"}</p>}
              <p className="text-[9px] text-ink/35">{selected || "None selected"}</p>
            </div>
          </section>

          <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-line bg-white shadow-sm">
            <div className="min-h-0 flex-1 overflow-auto">
              <table className="min-w-max text-[10px]">
                <thead className="sticky top-0 z-10 bg-paper">
                  <tr className="border-b border-line">
                    {columns.map(c => <th key={c} className="whitespace-nowrap px-3 py-3 text-left text-[8px] font-bold uppercase tracking-[.12em] text-ink/35">{c}</th>)}
                    <th className="sticky right-0 bg-paper px-4 text-right text-[8px] font-bold uppercase tracking-[.12em] text-ink/35">Actions</th>
                  </tr>
                </thead>
                {tableBody}
              </table>
            </div>
            <div className="border-t border-line bg-paper/40 px-4 py-2.5 text-[9px] text-ink/35">
              {collectionsLoading ? "Loading collections…" : noCollectionsYet ? "New MongoDB collections are detected automatically when the page refreshes." : `Showing ${rows.length} of ${currentCount} rows · New MongoDB collections are detected automatically when the page refreshes.`}
            </div>
          </section>
        </div>
      </div>

      {editing && <Editor row={editing} onSave={save} onClose={() => { if (!busy) setEditing(null); }} busy={busy} />}
      {adding && <NewEditor onSave={add} onClose={() => { if (!busy) setAdding(false); }} busy={busy} />}
      <ConfirmModal open={!!deleting} title="Delete this document?" message={deleting ? `This will permanently remove document ${deleting.id} from ${selected}.` : ""} confirmLabel="Delete document" busy={busy} onCancel={() => { if (!busy) setDeleting(null); }} onConfirm={() => void del()} />
    </AppShell>
  );
}
