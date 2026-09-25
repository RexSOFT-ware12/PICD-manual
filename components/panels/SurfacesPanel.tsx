"use client";

import type { SceneModel } from "@/lib/daz/types";
import type { AssetReport } from "@/lib/hydrate";
import { baseName } from "@/lib/daz/refs";

const toCss = (c: [number, number, number]) =>
  `rgb(${c.map((v) => Math.round(Math.max(0, Math.min(1, v)) * 255)).join(",")})`;

export default function SurfacesPanel({ model, report }: { model: SceneModel; report: AssetReport }) {
  const found = new Map(report.textures.map((t) => [t.file, t.found]));
  if (model.materials.length === 0) {
    return (
      <div className="panel-body">
        <p className="hint">This file has no surface assignments.</p>
      </div>
    );
  }
  return (
    <div className="panel-body">
      <p className="hint">
        Textures load once their image files are on the Content tab. TIFF maps can’t be shown by browsers, so those
        surfaces keep their flat colour.
      </p>
      <ul className="surface-list">
        {model.materials.map((m) => (
          <li key={m.id}>
            <div className="surface-head">
              <span className="swatch" style={{ background: toCss(m.color) }} />
              <strong>{m.name}</strong>
              <span className="meta">{m.shader.replace(/_/g, " ")}</span>
            </div>
            {m.diffuseMap ? (
              <p className={`meta tex ${found.get(m.diffuseMap) ? "ok" : "miss"}`}>
                {baseName(m.diffuseMap)} · {found.get(m.diffuseMap) ? "found" : "not found"}
              </p>
            ) : (
              <p className="meta">Flat colour, no base colour map</p>
            )}
            {m.maps.length > 0 && <p className="meta">{m.maps.length} more map{m.maps.length === 1 ? "" : "s"} (bump, specular, translucency…) are listed but not rendered.</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}
