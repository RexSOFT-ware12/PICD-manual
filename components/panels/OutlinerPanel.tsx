"use client";

import { useEffect, useMemo, useState } from "react";
import type { BoneModel, SceneModel } from "@/lib/daz/types";

interface Props {
  model: SceneModel;
  selected: string | null;
  showDetail: boolean;
  onSelect: (id: string) => void;
  posedIds: Set<string>;
}

export default function OutlinerPanel({ model, selected, showDetail, onSelect, posedIds }: Props) {
  const [query, setQuery] = useState("");
  const [closed, setClosed] = useState<Set<string>>(new Set());

  const { roots, children } = useMemo(() => {
    const children = new Map<string, BoneModel[]>();
    const roots = new Map<string, BoneModel[]>();
    const ids = new Set(model.bones.map((b) => b.id));
    for (const b of model.bones) {
      if (b.parentId && ids.has(b.parentId)) {
        const list = children.get(b.parentId) ?? [];
        list.push(b);
        children.set(b.parentId, list);
      } else {
        const list = roots.get(b.figureId) ?? [];
        list.push(b);
        roots.set(b.figureId, list);
      }
    }
    return { roots, children };
  }, [model]);

  useEffect(() => {
    if (!selected) return;
    document.querySelector(`[data-bone="${CSS.escape(selected)}"]`)?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  const toggle = (id: string) =>
    setClosed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const q = query.trim().toLowerCase();
  const matches = q
    ? model.bones.filter((b) => (showDetail || !b.detail) && (b.label.toLowerCase().includes(q) || b.id.toLowerCase().includes(q)))
    : [];

  const renderBone = (b: BoneModel, depth: number): React.ReactNode => {
    if (b.detail && !showDetail) return null;
    const kids = (children.get(b.id) ?? []).filter((k) => showDetail || !k.detail);
    const isClosed = closed.has(b.id);
    return (
      <li key={b.id}>
        <div
          className={`tree-row${selected === b.id ? " is-selected" : ""}`}
          style={{ paddingLeft: 8 + depth * 12 }}
          data-bone={b.id}
        >
          <button
            className="tree-caret"
            onClick={() => toggle(b.id)}
            aria-label={isClosed ? `Expand ${b.label}` : `Collapse ${b.label}`}
            aria-expanded={kids.length ? !isClosed : undefined}
            disabled={kids.length === 0}
          >
            {kids.length ? (isClosed ? "▸" : "▾") : ""}
          </button>
          <button className="tree-label" onClick={() => onSelect(b.id)}>
            {b.label}
          </button>
          {posedIds.has(b.id) && <span className="tree-dot" title="Has a pose rotation" />}
        </div>
        {kids.length > 0 && !isClosed && <ul>{kids.map((k) => renderBone(k, depth + 1))}</ul>}
      </li>
    );
  };

  return (
    <div className="panel-body">
      <input
        className="field"
        type="search"
        placeholder="Find a bone"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Find a bone"
      />
      {q ? (
        <ul className="tree flat">
          {matches.length === 0 && <li className="empty">No bone matches “{query}”.</li>}
          {matches.slice(0, 80).map((b) => (
            <li key={b.id}>
              <div className={`tree-row${selected === b.id ? " is-selected" : ""}`} data-bone={b.id}>
                <button className="tree-label" onClick={() => onSelect(b.id)}>
                  {b.label}
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="tree-scroll">
          {model.figures.map((fig) => (
            <section key={fig.id} className="tree-figure">
              <h3>{fig.label}</h3>
              {fig.conformTarget ? (
                <p className="hint">Conforms to {model.figures.find((f) => f.id === fig.conformTarget)?.label ?? fig.conformTarget} and follows its skeleton.</p>
              ) : (
                <ul className="tree">{(roots.get(fig.id) ?? []).map((b) => renderBone(b, 0))}</ul>
              )}
            </section>
          ))}
          {model.helperNodeCount > 0 && (
            <p className="hint">
              {model.helperNodeCount} helper nodes (for example measurement followers) are stored in the file but have no
              position of their own, so they are not drawn.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
