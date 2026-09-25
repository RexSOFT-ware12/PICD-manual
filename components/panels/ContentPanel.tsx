"use client";

import { useRef } from "react";
import type { AssetReport } from "@/lib/hydrate";
import { baseName } from "@/lib/daz/refs";

interface Props {
  report: AssetReport;
  fileCount: number;
  busy: boolean;
  onFiles: (files: FileList) => void;
  onClear: () => void;
}

const Status = ({ ok }: { ok: boolean }) => <span className={`status ${ok ? "ok" : "miss"}`}>{ok ? "found" : "missing"}</span>;

export default function ContentPanel({ report, fileCount, busy, onFiles, onClear }: Props) {
  const fileInput = useRef<HTMLInputElement>(null);
  const dirInput = useRef<HTMLInputElement>(null);
  const morphsFound = report.morphs.filter((m) => m.found).length;
  const texFound = report.textures.filter((t) => t.found).length;

  return (
    <div className="panel-body">
      <p className="hint">
        A .duf describes a scene; it doesn’t contain the figure’s mesh. Add your Daz content library once and it’s saved in
        this browser — every .duf you open after that automatically finds its Genesis figure, morphs and textures in it.
        Nothing is uploaded; files are read and stored locally.
      </p>
      <div className="btn-row">
        <button className="btn primary" onClick={() => dirInput.current?.click()}>Add content folder</button>
        <button className="btn" onClick={() => fileInput.current?.click()}>Add files</button>
        {fileCount > 0 && <button className="btn subtle" onClick={onClear}>Forget saved library</button>}
      </div>
      <input
        ref={dirInput}
        type="file"
        hidden
        multiple
        {...({ webkitdirectory: "" } as Record<string, string>)}
        onChange={(e) => e.target.files && onFiles(e.target.files)}
      />
      <input ref={fileInput} type="file" hidden multiple onChange={(e) => e.target.files && onFiles(e.target.files)} />
      <p className="meta">{fileCount} file{fileCount === 1 ? "" : "s"} saved to this browser{busy ? " · working…" : ""}</p>

      <section>
        <h3>Meshes</h3>
        {report.geometry.length === 0 && <p className="hint">Nothing to look up yet.</p>}
        <ul className="asset-list">
          {report.geometry.map((g, i) => (
            <li key={i}>
              <div>
                <strong>{g.label}</strong>
                <span className="meta">{baseName(g.file)}{g.found && !g.matched ? " · closest match used" : ""}</span>
                {g.found && (
                  <span className="meta">
                    {g.vertices?.toLocaleString()} vertices · {g.skinned ? `${g.skinned.toLocaleString()} skinned to the rig` : "not skinned"}
                  </span>
                )}
              </div>
              <Status ok={g.found} />
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h3>Morphs</h3>
        <p className="meta">
          {morphsFound} of {report.morphs.length} found
          {report.formulas.drivenMorphs > 0 ? ` · ${report.formulas.drivenMorphs} more loaded because other morphs drive them` : ""}
        </p>
        {report.formulas.count > 0 && (
          <p className="meta">
            {report.formulas.count.toLocaleString()} shape formulas
            {report.formulas.unsupported > 0 ? `, ${report.formulas.unsupported.toLocaleString()} skipped (spline-based)` : ""}
          </p>
        )}
        <ul className="asset-list compact">
          {report.morphs.filter((m) => !m.found).slice(0, 6).map((m) => (
            <li key={m.id}>
              <span>{baseName(m.file)}</span>
              <Status ok={false} />
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h3>UV sets and textures</h3>
        <p className="meta">
          {report.uvSets.filter((u) => u.found).length} of {report.uvSets.length} UV sets · {texFound} of {report.textures.length} images
        </p>
      </section>
    </div>
  );
}
