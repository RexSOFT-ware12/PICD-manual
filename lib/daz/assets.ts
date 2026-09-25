import { readDazFile } from "./read";
import { saveFiles, loadAllFiles, clearFiles as clearStoredFiles } from "./db";
import { parseDaz } from "./geometry";
import type { ParsedDaz } from "./types";
import { baseName, fileOf, normPath } from "./refs";

export interface PathedFile {
  file: File;
  /** Path relative to the dropped folder, e.g. "data/DAZ 3D/Genesis 8/.../x.dsf" */
  path: string;
}

/**
 * Holds files the user has dropped in (content folders, textures, .dsf files) and resolves
 * DAZ content-library URLs such as "/data/DAZ%203D/.../Genesis8_1Female.dsf" against them.
 */
export class AssetRegistry {
  private byName = new Map<string, PathedFile[]>();
  private parsed = new Map<File, Promise<{ raw: any; parsed: ParsedDaz }>>();
  private objectUrls = new Map<File, string>();
  count = 0;

  /** Adds files in-memory only (used when replaying files already saved to IndexedDB). */
  private addLocal(entries: PathedFile[]): number {
    let added = 0;
    for (const e of entries) {
      const key = e.file.name.toLowerCase();
      const list = this.byName.get(key) ?? [];
      if (list.some((x) => x.path === e.path)) continue;
      list.push(e);
      this.byName.set(key, list);
      added++;
    }
    this.count += added;
    return added;
  }

  /** Adds files and, unless `persist` is false, saves them to IndexedDB so they survive a reload. */
  async add(entries: PathedFile[], persist = true): Promise<number> {
    const fresh = entries.filter((e) => {
      const list = this.byName.get(e.file.name.toLowerCase());
      return !list?.some((x) => x.path === e.path);
    });
    const added = this.addLocal(fresh);
    if (persist && fresh.length) {
      try {
        await saveFiles(fresh);
      } catch {
        // local storage unavailable (private browsing, quota) — the files still work for this session
      }
    }
    return added;
  }

  /** Loads whatever was saved from earlier sessions. Safe to call once at startup. */
  async restore(): Promise<number> {
    try {
      const stored = await loadAllFiles();
      return this.addLocal(stored);
    } catch {
      return 0;
    }
  }

  async clear(): Promise<void> {
    for (const u of this.objectUrls.values()) URL.revokeObjectURL(u);
    this.objectUrls.clear();
    this.parsed.clear();
    this.byName.clear();
    this.count = 0;
    try {
      await clearStoredFiles();
    } catch {
      // nothing saved, or storage unavailable
    }
  }

  /** Finds the best match for a library url, preferring files whose folder path also matches. */
  find(url: string | null | undefined): File | undefined {
    if (!url) return undefined;
    const path = normPath(fileOf(url));
    if (!path) return undefined;
    const candidates = this.byName.get(baseName(path));
    if (!candidates?.length) return undefined;
    const exact = candidates.find((c) => normPath(c.path).endsWith(path));
    return (exact ?? candidates[0]).file;
  }

  /** All stored paths ending in .dsf whose file name loosely matches a figure label, e.g. "genesis 8.1 female". */
  findFigureBase(label: string): File | undefined {
    const words = label.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean);
    if (!words.length) return undefined;
    let best: PathedFile | undefined;
    let bestScore = 0;
    for (const list of this.byName.values()) {
      for (const c of list) {
        if (!/\.dsf$/i.test(c.path)) continue;
        const name = baseName(c.path).toLowerCase();
        const score = words.filter((w) => name.includes(w)).length;
        if (score > bestScore) {
          bestScore = score;
          best = c;
        }
      }
    }
    return bestScore >= Math.max(1, words.length - 1) ? best?.file : undefined;
  }

  /** Parsed geometry/morph/skin/uv content of a .dsf (or .duf), cached per file. */
  parse(file: File): Promise<{ raw: any; parsed: ParsedDaz }> {
    let p = this.parsed.get(file);
    if (!p) {
      p = readDazFile(file).then((raw) => ({ raw, parsed: parseDaz(raw) }));
      this.parsed.set(file, p);
    }
    return p;
  }

  textureUrl(url: string | null | undefined): string | undefined {
    const f = this.find(url);
    if (!f) return undefined;
    let u = this.objectUrls.get(f);
    if (!u) {
      u = URL.createObjectURL(f);
      this.objectUrls.set(f, u);
    }
    return u;
  }
}

/** Reads dropped files and folders (via webkitGetAsEntry) into a flat list with relative paths. */
export async function collectDropped(dt: DataTransfer): Promise<PathedFile[]> {
  const out: PathedFile[] = [];
  const items = Array.from(dt.items ?? []);
  const entries = items
    .map((i) => (typeof i.webkitGetAsEntry === "function" ? i.webkitGetAsEntry() : null))
    .filter((e): e is FileSystemEntry => !!e);

  if (entries.length === 0) {
    for (const f of Array.from(dt.files)) out.push({ file: f, path: f.name });
    return out;
  }
  for (const e of entries) await walk(e, "", out);
  return out;
}

async function walk(entry: FileSystemEntry, prefix: string, out: PathedFile[]): Promise<void> {
  if (entry.isFile) {
    const file = await new Promise<File>((res, rej) => (entry as FileSystemFileEntry).file(res, rej));
    out.push({ file, path: prefix + entry.name });
    return;
  }
  const reader = (entry as FileSystemDirectoryEntry).createReader();
  for (;;) {
    const batch = await new Promise<FileSystemEntry[]>((res, rej) => reader.readEntries(res, rej));
    if (batch.length === 0) break;
    for (const child of batch) await walk(child, `${prefix}${entry.name}/`, out);
  }
}

/** For <input type="file" webkitdirectory> and plain multi-file inputs. */
export function fromFileList(list: FileList): PathedFile[] {
  return Array.from(list).map((f) => ({
    file: f,
    path: (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name,
  }));
}
