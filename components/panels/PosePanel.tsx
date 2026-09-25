"use client";

import type { BoneModel, SceneModel, Vec3 } from "@/lib/daz/types";

interface Props {
  model: SceneModel;
  selected: string | null;
  pose: Record<string, Vec3>;
  invertRotation: boolean;
  onInvertRotation: (v: boolean) => void;
  onChange: (id: string, rot: Vec3) => void;
  onSelect: (id: string) => void;
  onResetToFile: () => void;
  onZero: () => void;
}

const AXES = ["X", "Y", "Z"] as const;

export default function PosePanel(p: Props) {
  const bone: BoneModel | undefined = p.model.bones.find((b) => b.id === p.selected);
  const rot: Vec3 = (bone && p.pose[bone.id]) || [0, 0, 0];
  const posed = p.model.bones.filter((b) => (p.pose[b.id] ?? [0, 0, 0]).some((v) => v !== 0));

  const set = (axis: number, value: number) => {
    if (!bone || Number.isNaN(value)) return;
    const next: Vec3 = [rot[0], rot[1], rot[2]];
    next[axis] = Math.max(-360, Math.min(360, value));
    p.onChange(bone.id, next);
  };

  return (
    <div className="panel-body">
      {bone ? (
        <section>
          <h3>{bone.label}</h3>
          <p className="meta">
            Rotation order {bone.rotationOrder} · joint at {bone.center.map((v) => v.toFixed(1)).join(", ")} cm
          </p>
          {AXES.map((a, i) => (
            <label className="slider-row" key={a}>
              <span className="slider-name">{a} rotate</span>
              <input type="range" min={-180} max={180} step={0.1} value={rot[i]} onChange={(e) => set(i, parseFloat(e.target.value))} />
              <input
                className="num"
                type="number"
                step={0.1}
                value={Number(rot[i].toFixed(2))}
                onChange={(e) => set(i, parseFloat(e.target.value))}
                aria-label={`${a} rotation in degrees`}
              />
            </label>
          ))}
          <button className="btn subtle" onClick={() => p.onChange(bone.id, [0, 0, 0])}>
            Zero this bone
          </button>
        </section>
      ) : (
        <p className="hint">Select a bone in the outliner or click a joint in the viewport to adjust its rotation.</p>
      )}

      <section>
        <h3>Posed bones</h3>
        {posed.length === 0 ? (
          <p className="hint">Every bone is at its rest rotation.</p>
        ) : (
          <ul className="chips">
            {posed.map((b) => (
              <li key={b.id}>
                <button className={`chip${b.id === p.selected ? " is-active" : ""}`} onClick={() => p.onSelect(b.id)}>
                  {b.label}
                  <span>{(p.pose[b.id] ?? [0, 0, 0]).map((v) => Math.round(v * 10) / 10).join(" / ")}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="btn-row">
          <button className="btn" onClick={p.onResetToFile}>Restore pose from file</button>
          <button className="btn" onClick={p.onZero}>Clear all rotations</button>
        </div>
      </section>

      <section>
        <h3>Rotation direction</h3>
        <label className="check">
          <input type="checkbox" checked={p.invertRotation} onChange={(e) => p.onInvertRotation(e.target.checked)} />
          Match Daz Studio’s sign convention
        </label>
        <p className="hint">
          Without the figure’s .dsf, bones are rotated around the world axes. If arms or legs swing the wrong way for your
          figure, turn this off.
        </p>
      </section>
    </div>
  );
}
