"use client";

import type { MorphModel } from "@/lib/daz/types";

interface Props {
  morphs: MorphModel[];
  values: Record<string, number>;
  available: Set<string>;
  onChange: (id: string, value: number) => void;
  onReset: () => void;
}

export default function ShapePanel({ morphs, values, available, onChange, onReset }: Props) {
  if (morphs.length === 0) {
    return (
      <div className="panel-body">
        <p className="hint">This file doesn’t contain any shape morphs.</p>
      </div>
    );
  }
  const regions = [...new Set(morphs.map((m) => m.region || "Other"))];
  const loaded = morphs.filter((m) => available.has(m.id)).length;

  return (
    <div className="panel-body">
      <p className="hint">
        {loaded === morphs.length
          ? "All morph files were found. Changes apply to the mesh live."
          : `${loaded} of ${morphs.length} morph files found. Add your Daz content folder on the Content tab to unlock the rest. Values from the file are shown either way.`}
      </p>
      {regions.map((region) => (
        <section key={region}>
          <h3>{region}</h3>
          {morphs
            .filter((m) => (m.region || "Other") === region)
            .map((m) => {
              const v = values[m.id] ?? m.value;
              const ok = available.has(m.id);
              return (
                <label className={`slider-row${ok ? "" : " is-missing"}`} key={m.id} title={m.group}>
                  <span className="slider-name">{m.id}</span>
                  <input type="range" min={-1.5} max={1.5} step={0.001} value={v} onChange={(e) => onChange(m.id, parseFloat(e.target.value))} />
                  <input
                    className="num"
                    type="number"
                    step={0.01}
                    value={Number(v.toFixed(3))}
                    onChange={(e) => !Number.isNaN(parseFloat(e.target.value)) && onChange(m.id, parseFloat(e.target.value))}
                    aria-label={`${m.id} value`}
                  />
                </label>
              );
            })}
        </section>
      ))}
      <button className="btn" onClick={onReset}>Restore values from file</button>
    </div>
  );
}
