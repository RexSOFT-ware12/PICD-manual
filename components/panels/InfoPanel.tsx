"use client";

import type { SceneModel } from "@/lib/daz/types";

export default function InfoPanel({ model }: { model: SceneModel }) {
  const rows: [string, string][] = [
    ["File", model.fileName],
    ["Asset", model.title],
    ["Author", model.author || "not set"],
    ["Saved", model.modified ? new Date(model.modified).toLocaleString() : "unknown"],
    ["DAZ file version", model.fileVersion || "unknown"],
    ["Nodes", `${model.nodeCount} (${model.bones.length} bones, ${model.helperNodeCount} helpers)`],
    ["Figures and items", model.figures.map((f) => f.label).join(", ") || "none"],
    ["Morphs", String(model.morphs.length)],
    ["Surfaces", String(model.materials.length)],
    ["Images referenced", String(model.textures.length)],
  ];
  return (
    <div className="panel-body">
      <dl className="info">
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
