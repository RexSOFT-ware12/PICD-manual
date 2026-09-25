/**
 * Persists dropped Daz content files across sessions using IndexedDB, so the library only has to
 * be added once. Each entry stores its relative path and raw bytes.
 */
const DB_NAME = "daz-workspace";
const STORE = "content-files";
const VERSION = 1;

export interface StoredFile {
  path: string;
  name: string;
  size: number;
  type: string;
  addedAt: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("This browser doesn't support saving files locally."));
      return;
    }
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "path" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Could not open local storage."));
  });
}

export async function saveFiles(entries: { path: string; file: File }[]): Promise<void> {
  if (entries.length === 0) return;
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    const store = tx.objectStore(STORE);
    for (const e of entries) {
      store.put({ path: e.path, name: e.file.name, size: e.file.size, type: e.file.type, addedAt: Date.now(), blob: e.file });
    }
  });
  db.close();
}

export async function loadAllFiles(): Promise<{ path: string; file: File }[]> {
  const db = await openDb();
  const rows = await new Promise<any[]>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result ?? []);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return rows.map((r) => ({
    path: r.path,
    file: r.blob instanceof File ? r.blob : new File([r.blob], r.name, { type: r.type }),
  }));
}

export async function clearFiles(): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.objectStore(STORE).clear();
  });
  db.close();
}

export async function fileCount(): Promise<number> {
  const db = await openDb();
  const n = await new Promise<number>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return n;
}
