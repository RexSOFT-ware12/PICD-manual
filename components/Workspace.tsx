"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen } from "lucide-react";
import ConfirmModal from "@/components/ConfirmModal";
import Viewport from "./Viewport";
import OutlinerPanel from "./panels/OutlinerPanel";
import PosePanel from "./panels/PosePanel";
import ShapePanel from "./panels/ShapePanel";
import SurfacesPanel from "./panels/SurfacesPanel";
import ContentPanel from "./panels/ContentPanel";
import InfoPanel from "./panels/InfoPanel";
import { DEFAULT_VIEW, type EngineStats, type ViewerEngine, type ViewOptions } from "@/lib/viewer/engine";
import { AssetRegistry, collectDropped, fromFileList, type PathedFile } from "@/lib/daz/assets";
import { readDazFile } from "@/lib/daz/read";
import { buildSceneModel } from "@/lib/daz/scene";
import { parseDaz } from "@/lib/daz/geometry";
import type { ParsedDaz, SceneModel, Vec3 } from "@/lib/daz/types";
import { EMPTY_REPORT, applySolve, hydrate, type AssetReport } from "@/lib/hydrate";
import type { ShapeSolver } from "@/lib/daz/solver";

type RightTab = "pose" | "shape" | "surfaces" | "content" | "file";
const TABS: { id: RightTab; label: string }[] = [
  { id: "pose", label: "Pose" },
  { id: "shape", label: "Shape" },
  { id: "surfaces", label: "Surfaces" },
  { id: "content", label: "Content" },
  { id: "file", label: "File" },
];

const DEFAULT_DUF_THEME = {
  bg: "#16181D", panel: "#202329", panel_2: "#292D34", raised: "#343942", line: "#3B414B",
  text: "#E4E7EC", muted: "#949CAA", accent: "#D98A32", accent_ink: "#1B1207",
  viewport_bg: "#111318", ok: "#70C58A", warning: "#D6B35A", error: "#E17C72",
};
const DEFAULT_DUF_CUSTOMIZATION = {
  brand_name: "DUF Workspace", theme: DEFAULT_DUF_THEME, show_topbar: true, show_statusbar: true, show_view_toolbar: true,
  left_panel_open: true, right_panel_open: true, left_panel_width: 250, right_panel_width: 330, default_tab: "pose" as RightTab,
  default_view: { skeleton: false, mesh: true, wireframe: false, xray: false, detail: false, grid: true, invertRotation: false },
};
const DUF_CUSTOMIZATION_STORAGE_KEY = "picd-duf-preview-customization";

function readDufCustomization() {
  if (typeof window === "undefined") return DEFAULT_DUF_CUSTOMIZATION;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(DUF_CUSTOMIZATION_STORAGE_KEY) || "{}");
    return { ...DEFAULT_DUF_CUSTOMIZATION, ...(parsed || {}), theme: { ...DEFAULT_DUF_THEME, ...((parsed || {}).theme || {}) }, default_view: { ...DEFAULT_DUF_CUSTOMIZATION.default_view, ...((parsed || {}).default_view || {}) } };
  } catch { return DEFAULT_DUF_CUSTOMIZATION; }
}

const poseFromModel = (m: SceneModel): Record<string, Vec3> => {
  const out: Record<string, Vec3> = {};
  for (const b of m.bones) if (b.rotation.some((v) => v !== 0)) out[b.id] = [...b.rotation] as Vec3;
  return out;
};
const morphsFromModel = (m: SceneModel): Record<string, number> =>
  Object.fromEntries(m.morphs.map((x) => [x.id, x.value]));

export default function Workspace() {
  const [engine, setEngine] = useState<ViewerEngine | null>(null);
  const registry = useMemo(() => new AssetRegistry(), []);
  const [model, setModel] = useState<SceneModel | null>(null);
  const [pose, setPose] = useState<Record<string, Vec3>>({});
  const [morphValues, setMorphValues] = useState<Record<string, number>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [dufCustomization, setDufCustomization] = useState(readDufCustomization);
  const [view, setView] = useState<ViewOptions>(() => ({ ...DEFAULT_VIEW, ...readDufCustomization().default_view }));
  const [tab, setTab] = useState<RightTab>(() => readDufCustomization().default_tab);
  const [assetVersion, setAssetVersion] = useState(0);
  const [report, setReport] = useState<AssetReport>(EMPTY_REPORT);
  const [stats, setStats] = useState<EngineStats>({ bones: 0, meshes: 0, triangles: 0, skinnedVertices: 0 });
  const [message, setMessage] = useState("Open a .duf file to begin.");
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [libraryReady, setLibraryReady] = useState(false);
  const [leftOpen, setLeftOpen] = useState(() => readDufCustomization().left_panel_open);
  const [rightOpen, setRightOpen] = useState(() => readDufCustomization().right_panel_open);
  const [dialog, setDialog] = useState<{title:string;message:string;tone:"default"|"danger";onConfirm?:()=>void}|null>(null);

  const solverRef = useRef<ShapeSolver | null>(null);
  const rawRef = useRef<ParsedDaz>({ geometries: [], skins: [], morphs: [], uvSets: [], nodes: [], formulas: [] });
  const poseRef = useRef(pose);
  const morphRef = useRef(morphValues);
  poseRef.current = pose;
  morphRef.current = morphValues;
  const dragDepth = useRef(0);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const apply = (next: any) => {
      const merged = { ...DEFAULT_DUF_CUSTOMIZATION, ...(next || {}), theme: { ...DEFAULT_DUF_THEME, ...((next || {}).theme || {}) }, default_view: { ...DEFAULT_DUF_CUSTOMIZATION.default_view, ...((next || {}).default_view || {}) } };
      setDufCustomization(merged);
      setLeftOpen(merged.left_panel_open);
      setRightOpen(merged.right_panel_open);
      setTab(merged.default_tab);
      setView(v => ({ ...v, ...merged.default_view }));
    };
    const onUpdate = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (detail?.duf_preview) apply(detail.duf_preview);
    };
    window.addEventListener("picd-ui-customization-updated", onUpdate);
    return () => window.removeEventListener("picd-ui-customization-updated", onUpdate);
  }, []);

  /* ---------------------------------------------------------- loading */

  const loadScene = useCallback(async (file: File) => {
    setBusy(true);
    setMessage(`Reading ${file.name}…`);
    try {
      const raw = await readDazFile(file);
      const m = buildSceneModel(raw, file.name);
      rawRef.current = parseDaz(raw);
      const p = poseFromModel(m);
      poseRef.current = p;
      morphRef.current = morphsFromModel(m);
      setPose(p);
      setMorphValues(morphRef.current);
      setSelected(null);
      setModel(m);
      setMessage(`Loaded ${file.name}: ${m.figures.length} figure${m.figures.length === 1 ? "" : "s"}, ${m.bones.length} bones.`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "That file could not be read.");
    } finally {
      setBusy(false);
    }
  }, []);

  const handleEntries = useCallback(
    async (entries: PathedFile[]) => {
      const duf = entries.find((e) => /\.duf$/i.test(e.file.name));
      const assets = entries.filter((e) => e !== duf);
      if (assets.length) {
        setBusy(true);
        setMessage(`Saving ${assets.length} file${assets.length === 1 ? "" : "s"} to your content library…`);
        const n = await registry.add(assets);
        setAssetVersion((v) => v + 1);
        setBusy(false);
        if (!duf) setMessage(`Added ${n} file${n === 1 ? "" : "s"} to your content library. They'll stay available next time you open this page.`);
      }
      if (duf) await loadScene(duf.file);
    },
    [registry, loadScene],
  );

  // load whatever content library was saved in an earlier session, once, before the sample scene hydrates
  useEffect(() => {
    let cancelled = false;
    registry
      .restore()
      .then((n) => {
        if (cancelled) return;
        if (n > 0) setMessage(`Loaded ${n} saved content file${n === 1 ? "" : "s"} from this browser.`);
        setAssetVersion((v) => v + 1);
      })
      .finally(() => !cancelled && setLibraryReady(true));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadSample = useCallback(async () => {
    try {
      const res = await fetch("/samples/rex_model.duf");
      if (!res.ok) throw new Error("The sample file is missing from /public/samples.");
      const blob = await res.blob();
      await loadScene(new File([blob], "rex_model.duf"));
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "The sample could not be loaded.");
    }
  }, [loadScene]);

  // open the bundled sample on first visit so there is something to look at
  useEffect(() => {
    if (libraryReady) void loadSample();
  }, [libraryReady, loadSample]);

  /* ------------------------------------------------- engine wiring */

  useEffect(() => {
    if (!engine) return;
    engine.onPick = (id) => {
      setSelected(id);
      if (id) setTab("pose");
    };
    engine.onChange = () => setStats(engine.getStats());
  }, [engine]);

  useEffect(() => {
    if (!engine || !model) return;
    solverRef.current = null;
    engine.setOptions(view);
    engine.setScene(model, poseRef.current);
    engine.setOptions(view);
    setReport(EMPTY_REPORT);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, model]);

  useEffect(() => {
    if (!engine || !model) return;
    let cancelled = false;
    setBusy(true);
    hydrate(engine, model, rawRef.current, registry, morphRef.current, poseRef.current, () => cancelled)
      .then(({ report: r, solver }) => {
        if (cancelled) return;
        solverRef.current = solver;
        setReport(r);
        setStats(engine.getStats());
        if (r.meshes > 0) {
          const exact = r.geometry.every((g) => g.matched);
          setMessage(
            exact
              ? `Showing ${r.meshes} mesh${r.meshes === 1 ? "" : "es"}.`
              : `Showing ${r.meshes} mesh${r.meshes === 1 ? "" : "es"} using the closest match in your content library.`,
          );
        } else if (r.geometry.length) {
          setMessage("The rig is shown. Add your Daz content folder on the Content tab to see the body.");
        }
      })
      .catch((e) => !cancelled && setMessage(e instanceof Error ? e.message : "Reading the content files failed."))
      .finally(() => !cancelled && setBusy(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, model, assetVersion, registry]);

  useEffect(() => {
    engine?.setOptions(view);
  }, [engine, view]);

  useEffect(() => {
    engine?.select(selected);
  }, [engine, selected, model]);

  /* --------------------------------------------------------- actions */

  /** Re-solves formulas (driven morphs, joint movement, twist bones) for the current values. */
  const resolve = (morphs: Record<string, number>, p: Record<string, Vec3>) => {
    if (!engine) return;
    const solver = solverRef.current;
    if (solver) applySolve(engine, solver, morphs, p);
    else for (const [id, v] of Object.entries(morphs)) engine.setMorphValue(id, v);
  };

  const changeBone = (id: string, rot: Vec3) => {
    const next = { ...poseRef.current, [id]: rot };
    poseRef.current = next;
    setPose(next);
    engine?.setBoneRotation(id, rot);
    if (solverRef.current) resolve(morphRef.current, next);
  };
  const resetPose = () => {
    if (!model) return;
    const p = poseFromModel(model);
    poseRef.current = p;
    setPose(p);
    engine?.setPose(p);
    resolve(morphRef.current, p);
  };
  const zeroPose = () => {
    poseRef.current = {};
    setPose({});
    engine?.setPose({});
    resolve(morphRef.current, {});
  };
  const changeMorph = (id: string, v: number) => {
    const next = { ...morphRef.current, [id]: v };
    morphRef.current = next;
    setMorphValues(next);
    resolve(next, poseRef.current);
  };
  const resetMorphs = () => {
    if (!model) return;
    const m = morphsFromModel(model);
    morphRef.current = m;
    setMorphValues(m);
    resolve(m, poseRef.current);
  };
  const toggle = (key: keyof ViewOptions) => setView((v) => ({ ...v, [key]: !v[key] }));

  const screenshot = () => {
    if (!engine) return;
    const a = document.createElement("a");
    a.href = engine.screenshot();
    a.download = `${model?.title.replace(/\.duf$/i, "") || "scene"}.png`;
    a.click();
  };

  const posedIds = useMemo(
    () => new Set(Object.entries(pose).filter(([, r]) => r.some((v) => v !== 0)).map(([id]) => id)),
    [pose],
  );
  const availableMorphs = useMemo(() => new Set(report.morphs.filter((m) => m.found).map((m) => m.id)), [report]);

  /* ------------------------------------------------------ drag & drop */

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    setBusy(true);
    setMessage("Reading dropped files…");
    try {
      await handleEntries(await collectDropped(e.dataTransfer));
    } finally {
      setBusy(false);
    }
  };

  /* ----------------------------------------------------------- render */

  const noMesh = !!model && report.meshes === 0 && !busy;

  return (
    <div
      className="app"
      style={{
        "--duf-left-width": `${Math.max(180, Math.min(420, Number(dufCustomization.left_panel_width) || 250))}px`,
        "--duf-right-width": `${Math.max(260, Math.min(520, Number(dufCustomization.right_panel_width) || 330))}px`,
        "--duf-topbar-height": dufCustomization.show_topbar ? "46px" : "0px",
        "--duf-status-height": dufCustomization.show_statusbar ? "28px" : "0px",
        "--duf-bg": dufCustomization.theme?.bg || DEFAULT_DUF_THEME.bg,
        "--duf-panel": dufCustomization.theme?.panel || DEFAULT_DUF_THEME.panel,
        "--duf-panel-2": dufCustomization.theme?.panel_2 || DEFAULT_DUF_THEME.panel_2,
        "--duf-raised": dufCustomization.theme?.raised || DEFAULT_DUF_THEME.raised,
        "--duf-line": dufCustomization.theme?.line || DEFAULT_DUF_THEME.line,
        "--duf-text": dufCustomization.theme?.text || DEFAULT_DUF_THEME.text,
        "--duf-muted": dufCustomization.theme?.muted || DEFAULT_DUF_THEME.muted,
        "--duf-accent": dufCustomization.theme?.accent || DEFAULT_DUF_THEME.accent,
        "--duf-accent-ink": dufCustomization.theme?.accent_ink || DEFAULT_DUF_THEME.accent_ink,
        "--duf-viewport-bg": dufCustomization.theme?.viewport_bg || DEFAULT_DUF_THEME.viewport_bg,
        "--duf-ok": dufCustomization.theme?.ok || DEFAULT_DUF_THEME.ok,
        "--duf-warning": dufCustomization.theme?.warning || DEFAULT_DUF_THEME.warning,
        "--duf-error": dufCustomization.theme?.error || DEFAULT_DUF_THEME.error,
      } as CSSProperties}
      onDragEnter={(e) => {
        e.preventDefault();
        dragDepth.current++;
        setDragging(true);
      }}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={() => {
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (dragDepth.current === 0) setDragging(false);
      }}
      onDrop={onDrop}
    >
      {dufCustomization.show_topbar && <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden />
          <span className="brand-name">{dufCustomization.brand_name || "DUF Workspace"}</span>
        </div>
        <div className="doc" title={model?.fileName}>
          {model ? model.fileName : "No file open"}
        </div>
        <div className="top-actions">
          <button className="btn primary" onClick={() => fileInput.current?.click()}>Open .duf</button>
          <button className="btn" onClick={() => void loadSample()}>Load sample</button>
          <button className="btn" onClick={screenshot} disabled={!engine}>Save image</button>
          <input
            ref={fileInput}
            type="file"
            hidden
            multiple
            accept=".duf,.dsf,.jpg,.jpeg,.png,.gz"
            onChange={(e) => {
              if (e.target.files) void handleEntries(fromFileList(e.target.files));
              e.target.value = "";
            }}
          />
        </div>
      </header>}

      <div className={`main${leftOpen ? "" : " left-collapsed"}${rightOpen ? "" : " right-collapsed"}`}>
        {leftOpen ? (
          <aside className="panel left" aria-label="Scene outliner">
            <div className="panel-title">
              <span>Scene</span>
              <button className="panel-collapse" onClick={() => setLeftOpen(false)} aria-label="Collapse scene panel" title="Collapse panel">
                <PanelLeftClose size={14} />
              </button>
            </div>
            {model ? (
              <OutlinerPanel model={model} selected={selected} showDetail={view.detail} onSelect={setSelected} posedIds={posedIds} />
            ) : (
              <div className="panel-body"><p className="hint">The scene tree appears here.</p></div>
            )}
          </aside>
        ) : (
          <button className="panel-reopen left" onClick={() => setLeftOpen(true)} aria-label="Expand scene panel" title="Scene">
            <PanelLeftOpen size={15} />
          </button>
        )}

        <main className="stage-wrap">
          <div className="viewport">
            <Viewport onReady={setEngine} />

            {dufCustomization.show_view_toolbar && <div className="view-toolbar" role="toolbar" aria-label="Viewport">
              <div className="seg">
                {(["front", "back", "left", "right", "top"] as const).map((v) => (
                  <button key={v} onClick={() => engine?.view(v)}>{v[0].toUpperCase() + v.slice(1)}</button>
                ))}
                <button onClick={() => engine?.frame()}>Frame</button>
              </div>
              <div className="seg">
                <button aria-pressed={view.skeleton} onClick={() => toggle("skeleton")}>Skeleton</button>
                <button aria-pressed={view.mesh} onClick={() => toggle("mesh")}>Mesh</button>
                <button aria-pressed={view.wireframe} onClick={() => toggle("wireframe")}>Wireframe</button>
                <button aria-pressed={view.xray} onClick={() => toggle("xray")}>See-through joints</button>
                <button aria-pressed={view.detail} onClick={() => toggle("detail")}>Fingers and face</button>
                <button aria-pressed={view.grid} onClick={() => toggle("grid")}>Grid</button>
              </div>
            </div>}

            {noMesh && (
              <div className="notice">
                <strong>Showing the rig only</strong>
                <span>
                  This file points to the figure’s mesh in your Daz library instead of containing it. Add the content folder
                  or the base figure’s .dsf on the Content tab to see the body.
                </span>
                <button className="btn primary" onClick={() => setTab("content")}>Open Content tab</button>
              </div>
            )}

            {dragging && (
              <div className="drop-veil">
                <strong>Drop to open</strong>
                <span>.duf scenes open directly. Folders, .dsf and image files are added to the content pool.</span>
              </div>
            )}
          </div>
        </main>

        {rightOpen ? (
          <aside className="panel right" aria-label="Inspector">
            <div className="tabs-row">
              <div className="tabs" role="tablist">
                {TABS.map((t) => (
                  <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? "is-active" : ""} onClick={() => setTab(t.id)}>
                    {t.label}
                  </button>
                ))}
              </div>
              <button className="panel-collapse" onClick={() => setRightOpen(false)} aria-label="Collapse inspector" title="Collapse panel">
                <PanelRightClose size={14} />
              </button>
            </div>
            {model ? (
              <>
                {tab === "pose" && (
                  <PosePanel
                    model={model}
                    selected={selected}
                    pose={pose}
                    invertRotation={view.invertRotation}
                    onInvertRotation={(v) => setView((o) => ({ ...o, invertRotation: v }))}
                    onChange={changeBone}
                    onSelect={setSelected}
                    onResetToFile={resetPose}
                    onZero={zeroPose}
                  />
                )}
                {tab === "shape" && (
                  <ShapePanel morphs={model.morphs} values={morphValues} available={availableMorphs} onChange={changeMorph} onReset={resetMorphs} />
                )}
                {tab === "surfaces" && <SurfacesPanel model={model} report={report} />}
                {tab === "file" && <InfoPanel model={model} />}
              </>
            ) : (
              tab !== "content" && <div className="panel-body"><p className="hint">Open a file to inspect it.</p></div>
            )}
            {tab === "content" && (
              <ContentPanel
                report={report}
                fileCount={registry.count}
                busy={busy}
                onFiles={(f) => void handleEntries(fromFileList(f))}
                onClear={() => {
                  setDialog({
                    title: "Clear saved content library?",
                    message: "This removes the saved Daz content files from this browser. Your current open scene is not deleted.",
                    tone: "danger",
                    onConfirm: () => {
                      void registry.clear().then(() => {
                        setAssetVersion((v) => v + 1);
                        setMessage("Removed the saved content library.");
                      });
                    },
                  });
                }}
              />
            )}
          </aside>
        ) : (
          <button className="panel-reopen right" onClick={() => setRightOpen(true)} aria-label="Expand inspector" title="Inspector">
            <PanelRightOpen size={15} />
          </button>
        )}
      </div>

      {dufCustomization.show_statusbar && <footer className="statusbar" role="status">
        <span className="status-msg">{busy ? "Working… " : ""}{message}</span>
        <span className="status-stats">
          {stats.meshes > 0 ? `${stats.meshes} mesh${stats.meshes === 1 ? "" : "es"} · ${stats.triangles.toLocaleString()} triangles · ` : ""}
          {stats.bones} bones
        </span>
      </footer>}
      <ConfirmModal open={!!dialog} alertMode={!dialog?.onConfirm} title={dialog?.title||"DUF Preview"} message={dialog?.message||""} tone={dialog?.tone||"default"} confirmLabel="Confirm" onCancel={()=>setDialog(null)} onConfirm={()=>{const action=dialog?.onConfirm;setDialog(null);action?.();}} />

    </div>
  );
}
