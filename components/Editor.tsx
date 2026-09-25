"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  MousePointer2, Move, Crop, PenTool, Brush, Eraser, Pipette,
  ZoomIn, ZoomOut, Hand, Undo2, Redo2, Upload, Download, Trash2,
  Eye, EyeOff, FlipHorizontal, Maximize2, Plus, Check, X,
  SlidersHorizontal, Image as ImageIcon, RotateCcw,
  PanelRight, PanelLeft, BoxSelect, Wand2
} from "lucide-react";
import { Stage, Layer, Image as KImage, Transformer, Rect, Line, Circle } from "react-konva";
import type Konva from "konva";

/* ---------- types ---------- */
type Tool = "move" | "select" | "objsel" | "quicksel" | "crop" | "pen" | "brush" | "eraser" | "eyedropper" | "hand";
type SelMode = "new" | "add" | "sub";
type Img = HTMLImageElement | HTMLCanvasElement;
type Box = { x: number; y: number; width: number; height: number };
type LayerItem = {
  id: string; name: string; type: "image" | "shape" | "path";
  visible: boolean; opacity: number;
  x: number; y: number; width: number; height: number; rotation: number;
  flipX?: boolean; fill?: string; image?: Img; thumb?: string; crop?: Box; points?: number[];
};
type Stroke = { id: string; erase: boolean; color: string; size: number; opacity: number; points: number[] };
type Doc = { layers: LayerItem[]; strokes: Stroke[] };
type Selection = { layerId: string; mask: HTMLCanvasElement; edges: [HTMLCanvasElement, HTMLCanvasElement] };
type MenuItem = { label: string; onClick?: () => void; hint?: string; disabled?: boolean; divider?: boolean };

const CANVAS_W = 900, CANVAS_H = 650, MARGIN = 30;
const FILL_RED = "#CD1F1F";

const TOOLS: { id: Tool; label: string; icon: any; key: string }[] = [
  { id: "move", label: "Move", icon: Move, key: "V" },
  { id: "select", label: "Transform", icon: MousePointer2, key: "A" },
  { id: "objsel", label: "Object Sel.", icon: BoxSelect, key: "O" },
  { id: "quicksel", label: "Quick Sel.", icon: Wand2, key: "W" },
  { id: "crop", label: "Crop", icon: Crop, key: "C" },
  { id: "pen", label: "Path", icon: PenTool, key: "P" },
  { id: "brush", label: "Brush", icon: Brush, key: "B" },
  { id: "eraser", label: "Eraser", icon: Eraser, key: "E" },
  { id: "eyedropper", label: "Eyedropper", icon: Pipette, key: "I" },
  { id: "hand", label: "Hand", icon: Hand, key: "H" },
];

const TOOL_HINT: Record<Tool, string> = {
  move: "Drag a layer to move it.",
  select: "Click a layer, then drag its handles to resize (ratio locked) or rotate.",
  objsel: "Drag a box around the person/object. The AI selects what's inside the box.",
  quicksel: "Paint over the subject to add to the selection. Use Subtract mode (or hold Alt) to remove.",
  crop: "Select an image layer, drag a box over it, then press Apply.",
  pen: "Click to add points. Click the first point, double-click or press Enter to finish.",
  brush: "Paint on the canvas.",
  eraser: "Erases brush strokes only (images are never erased).",
  eyedropper: "Click anywhere on the canvas to pick a colour.",
  hand: "Drag to pan around the canvas.",
};

/* ---------- image / geometry helpers ---------- */
const imgW = (i: Img) => (i instanceof HTMLImageElement ? i.naturalWidth : i.width);
const imgH = (i: Img) => (i instanceof HTMLImageElement ? i.naturalHeight : i.height);
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

function cropOf(l: LayerItem): Box {
  return l.crop || { x: 0, y: 0, width: imgW(l.image!), height: imgH(l.image!) };
}
function srcSize(l: LayerItem) {
  if (l.crop) return { w: l.crop.width, h: l.crop.height };
  return { w: l.image ? imgW(l.image) : 1, h: l.image ? imgH(l.image) : 1 };
}
function newCanvas(w: number, h: number) {
  const c = document.createElement("canvas"); c.width = Math.max(1, w); c.height = Math.max(1, h); return c;
}
function toCanvas(img: Img): HTMLCanvasElement {
  if (img instanceof HTMLCanvasElement) return img;
  const c = newCanvas(img.naturalWidth, img.naturalHeight);
  c.getContext("2d")!.drawImage(img, 0, 0);
  return c;
}
function thumbOf(c: HTMLCanvasElement) {
  const s = Math.min(1, 96 / Math.max(c.width, c.height));
  const t = newCanvas(Math.round(c.width * s), Math.round(c.height * s));
  t.getContext("2d")!.drawImage(c, 0, 0, t.width, t.height);
  return t.toDataURL();
}

/** Position of a layer as Konva draws it (rotation/flip about the layer centre). */
function geomProps(l: LayerItem) {
  return {
    x: l.x + l.width / 2, y: l.y + l.height / 2,
    offsetX: l.width / 2, offsetY: l.height / 2,
    width: l.width, height: l.height,
    rotation: l.rotation, scaleX: l.flipX ? -1 : 1, scaleY: 1,
  };
}

/** Artboard point -> pixel in the layer's ORIGINAL image (undoes rotation, flip, crop, scale). */
function layerToSource(l: LayerItem, p: { x: number; y: number }) {
  const cx = l.x + l.width / 2, cy = l.y + l.height / 2;
  const dx0 = p.x - cx, dy0 = p.y - cy;
  const a = (-l.rotation * Math.PI) / 180;
  const rx = dx0 * Math.cos(a) - dy0 * Math.sin(a);
  const ry = dx0 * Math.sin(a) + dy0 * Math.cos(a);
  const u = (l.flipX ? -rx : rx) + l.width / 2, v = ry + l.height / 2;
  const c = cropOf(l);
  return { x: c.x + (u / l.width) * c.width, y: c.y + (v / l.height) * c.height };
}
/** Rectangle in original-image pixels -> artboard rectangle (layer assumed unrotated). */
function srcRectToArtboard(l: LayerItem, r: { x: number; y: number; w: number; h: number }) {
  const c = cropOf(l), kx = l.width / c.width, ky = l.height / c.height;
  let x = l.x + (r.x - c.x) * kx;
  if (l.flipX) x = l.x + l.width - (r.x + r.w - c.x) * kx;
  return { x, y: l.y + (r.y - c.y) * ky, w: r.w * kx, h: r.h * ky };
}

/** Places front + side next to each other at the SAME height, keeping each image's aspect ratio. */
function arrange(layers: LayerItem[]): LayerItem[] {
  const items = ["front", "side"].map(id => layers.find(l => l.id === id && l.image)).filter(Boolean) as LayerItem[];
  if (!items.length) return layers;
  const ratios = items.map(l => { const s = srcSize(l); return s.w / s.h; });
  const sum = ratios.reduce((a, b) => a + b, 0);
  const gap = items.length > 1 ? MARGIN : 0;
  const h = Math.min(CANVAS_H - 2 * MARGIN, (CANVAS_W - 2 * MARGIN - gap) / sum);
  let x = (CANVAS_W - (sum * h + gap)) / 2;
  const y = (CANVAS_H - h) / 2;
  const pos = new Map<string, { x: number; y: number; width: number; height: number }>();
  items.forEach((l, i) => { const w = ratios[i] * h; pos.set(l.id, { x, y, width: w, height: h }); x += w + gap; });
  return layers.map(l => (pos.has(l.id) ? { ...l, ...pos.get(l.id)!, rotation: 0 } : l));
}

/* ---------- selection (mask) helpers ---------- */
/** AI subject detection. Runs fully in the browser; returns a canvas whose ALPHA channel is the mask. */
async function runSegmentation(src: HTMLCanvasElement, onStatus: (m: string) => void): Promise<HTMLCanvasElement> {
  const MAX = 2048, s = Math.min(1, MAX / Math.max(src.width, src.height));
  let input = src;
  if (s < 1) {
    input = newCanvas(Math.round(src.width * s), Math.round(src.height * s));
    input.getContext("2d")!.drawImage(src, 0, 0, input.width, input.height);
  }
  const blob = await new Promise<Blob>((res, rej) => input.toBlob(b => (b ? res(b) : rej(new Error("Could not read image pixels"))), "image/png"));
  const mod: any = await import("@imgly/background-removal");
  const remove = mod.removeBackground || mod.default;
  const out: Blob = await remove(blob, {
    model: "isnet_fp16",
    output: { format: "image/png" },
    progress: (key: string, cur: number, total: number) => {
      const pct = total ? Math.round((cur / total) * 100) : 0;
      onStatus(String(key).startsWith("fetch") ? `Downloading AI model… ${pct}%` : `Detecting subject… ${pct}%`);
    },
  });
  const bmp = await createImageBitmap(out);
  const m = newCanvas(src.width, src.height);
  m.getContext("2d")!.drawImage(bmp, 0, 0, m.width, m.height);
  return m;
}

function combineMask(base: HTMLCanvasElement | null, add: HTMLCanvasElement, mode: SelMode, w: number, h: number) {
  const out = newCanvas(w, h), c = out.getContext("2d")!;
  if (mode === "new" || !base) { if (mode !== "sub") c.drawImage(add, 0, 0); return out; }
  c.drawImage(base, 0, 0);
  c.globalCompositeOperation = mode === "add" ? "source-over" : "destination-out";
  c.drawImage(add, 0, 0);
  return out;
}
function invertMask(m: HTMLCanvasElement) {
  const out = newCanvas(m.width, m.height), c = out.getContext("2d")!;
  c.fillStyle = "#000"; c.fillRect(0, 0, out.width, out.height);
  c.globalCompositeOperation = "destination-out"; c.drawImage(m, 0, 0);
  return out;
}
function makeCutout(img: Img, mask: HTMLCanvasElement) {
  const c = newCanvas(imgW(img), imgH(img)), ctx = c.getContext("2d")!;
  ctx.drawImage(img, 0, 0);
  ctx.globalCompositeOperation = "destination-in"; ctx.drawImage(mask, 0, 0);
  return c;
}
function makeFill(mask: HTMLCanvasElement, color: string) {
  const c = newCanvas(mask.width, mask.height), ctx = c.getContext("2d")!;
  ctx.fillStyle = color; ctx.fillRect(0, 0, c.width, c.height);
  ctx.globalCompositeOperation = "destination-in"; ctx.drawImage(mask, 0, 0);
  return c;
}
function maskBounds(mask: HTMLCanvasElement) {
  const s = Math.min(1, 512 / Math.max(mask.width, mask.height));
  const w = Math.max(1, Math.round(mask.width * s)), h = Math.max(1, Math.round(mask.height * s));
  const t = newCanvas(w, h), tc = t.getContext("2d")!; tc.drawImage(mask, 0, 0, w, h);
  const d = tc.getImageData(0, 0, w, h).data;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 127) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) return null;
  return { x: x0 / s, y: y0 / s, w: (x1 - x0 + 1) / s, h: (y1 - y0 + 1) / s };
}
/** Two "marching ants" outline canvases (alternating phase) for a mask, at reduced resolution. */
function buildEdges(mask: HTMLCanvasElement): [HTMLCanvasElement, HTMLCanvasElement] {
  const s = Math.min(1, 900 / Math.max(mask.width, mask.height));
  const w = Math.max(1, Math.round(mask.width * s)), h = Math.max(1, Math.round(mask.height * s));
  const t = newCanvas(w, h), tc = t.getContext("2d")!; tc.drawImage(mask, 0, 0, w, h);
  const a = tc.getImageData(0, 0, w, h).data;
  const sel = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) sel[i] = a[i * 4 + 3] > 127 ? 1 : 0;
  const edge = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x; if (!sel[i]) continue;
    if (x === 0 || y === 0 || x === w - 1 || y === h - 1 || !sel[i - 1] || !sel[i + 1] || !sel[i - w] || !sel[i + w]) edge[i] = 1;
  }
  const mk = (ph: number) => {
    const c = newCanvas(w, h), ctx = c.getContext("2d")!, id = ctx.createImageData(w, h), d = id.data;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!(edge[i] || (x > 0 && edge[i - 1]) || (y > 0 && edge[i - w]))) continue; // 2px thick
      const v = (x + y + ph) % 8 < 4 ? 0 : 255, o = i * 4;
      d[o] = d[o + 1] = d[o + 2] = v; d[o + 3] = 255;
    }
    ctx.putImageData(id, 0, 0); return c;
  };
  return [mk(0), mk(4)];
}

export default function Editor() {
  const [tool, setTool] = useState<Tool>("move");
  const [doc, setDoc] = useState<Doc>({ layers: [], strokes: [] });
  const [history, setHistory] = useState<Doc[]>([]);
  const [future, setFuture] = useState<Doc[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; layerId: string } | null>(null);
  const [zoom, setZoom] = useState(0.78);
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [menu, setMenu] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [bg, setBg] = useState<"checker" | "white">("checker");

  const [brushColor, setBrushColor] = useState(FILL_RED);
  const [brushSize, setBrushSize] = useState(20);
  const [brushOpacity, setBrushOpacity] = useState(100);
  const [draft, setDraft] = useState<Stroke | null>(null);
  const [penPoints, setPenPoints] = useState<number[]>([]);
  const [cropRect, setCropRect] = useState<Box | null>(null);

  const [selection, setSelection] = useState<Selection | null>(null);
  const [selMode, setSelMode] = useState<SelMode>("new");
  const [ants, setAnts] = useState<0 | 1>(0);
  const [busy, setBusy] = useState<string | null>(null);

  const cropStart = useRef<{ x: number; y: number } | null>(null);
  const pan = useRef<{ x: number; y: number; l: number; t: number } | null>(null);
  const quick = useRef<{ layerId: string; last: { x: number; y: number } | null; erase: boolean } | null>(null);
  const lastEdge = useRef(0);
  const busyRef = useRef(false);
  const selRef = useRef<Selection | null>(null);
  const docRef = useRef<Doc>(doc);
  const stageRef = useRef<Konva.Stage>(null);
  const trRef = useRef<Konva.Transformer>(null);
  const overlayRef = useRef<Konva.Layer>(null);
  const artboardRef = useRef<Konva.Rect>(null);
  const nodes = useRef<Record<string, Konva.Node | null>>({});
  const scrollRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const fileFront = useRef<HTMLInputElement>(null);
  const fileSide = useRef<HTMLInputElement>(null);

  const layers = doc.layers;
  const active = layers.find(l => l.id === selected) || null;
  const ordered = useMemo(() => [...layers].reverse(), [layers]);
  const hasImages = layers.some(l => l.type === "image");
  const frontLoaded = layers.some(l => l.id === "front");
  const sideLoaded = layers.some(l => l.id === "side");
  const canMove = tool === "move" || tool === "select";
  const isSelTool = tool === "objsel" || tool === "quicksel";
  const selLayer = selection ? layers.find(l => l.id === selection.layerId) || null : null;
  const hasSel = !!selection;

  // transparent-background checkerboard (constant on-screen size)
  const checker = useMemo(() => {
    const c = newCanvas(16, 16), x = c.getContext("2d")!;
    x.fillStyle = "#ffffff"; x.fillRect(0, 0, 16, 16);
    x.fillStyle = "#d4d4d4"; x.fillRect(0, 0, 8, 8); x.fillRect(8, 8, 8, 8);
    return c;
  }, []);

  /* ---------- state helpers ---------- */
  function commit(fn: (d: Doc) => Doc) {
    const prev = docRef.current;
    const next = fn(prev);
    docRef.current = next;
    setHistory(h => [...h, prev].slice(-30));
    setFuture([]);
    setDoc(next);
  }
  function live(id: string, p: Partial<LayerItem>) { // no history entry (typing / sliders)
    const next = { ...docRef.current, layers: docRef.current.layers.map(l => (l.id === id ? { ...l, ...p } : l)) };
    docRef.current = next; setDoc(next);
  }
  function patch(id: string, p: Partial<LayerItem>) {
    commit(d => ({ ...d, layers: d.layers.map(l => (l.id === id ? { ...l, ...p } : l)) }));
  }
  function undo() {
    if (!history.length) return;
    const prev = history[history.length - 1];
    setFuture(f => [docRef.current, ...f]); docRef.current = prev; setDoc(prev); setHistory(h => h.slice(0, -1));
  }
  function redo() {
    if (!future.length) return;
    const next = future[0];
    setHistory(h => [...h, docRef.current]); docRef.current = next; setDoc(next); setFuture(f => f.slice(1));
  }
  function chooseTool(t: Tool) { setTool(t); setPenPoints([]); setCropRect(null); setDraft(null); cropStart.current = null; }

  async function withBusy(msg: string, fn: () => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(msg);
    try { await fn(); }
    catch (err: any) {
      console.error(err);
      alert("Subject detection failed: " + (err?.message || err) + "\n\nThe AI model (~80 MB) is downloaded the first time you use it, so you need to be online for the first run.");
    } finally { busyRef.current = false; setBusy(null); }
  }

  /* ---------- files ---------- */
  function loadFile(kind: "front" | "side", file: File) {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      commit(d => {
        const fresh: LayerItem = {
          id: kind, name: kind === "front" ? "Front Model" : "Side Model", type: "image",
          visible: true, opacity: 1, x: 0, y: 0, rotation: 0, image: img,
          width: img.naturalWidth, height: img.naturalHeight,
        };
        const exists = d.layers.some(l => l.id === kind);
        const list = exists ? d.layers.map(l => (l.id === kind ? fresh : l)) : [...d.layers, fresh];
        return { ...d, layers: arrange(list) };
      });
      setSelected(kind);
    };
    img.src = url;
  }
  function handleFiles(files: File[]) {
    const imgs = files.filter(f => f.type.startsWith("image/"));
    if (!imgs.length) return;
    if (imgs.length >= 2) { loadFile("front", imgs[0]); loadFile("side", imgs[1]); return; }
    loadFile(!frontLoaded ? "front" : !sideLoaded ? "side" : "front", imgs[0]);
  }
  function autoArrange() {
    if (!hasImages) { alert("Upload a front and/or side image first."); return; }
    commit(d => ({ ...d, layers: arrange(d.layers) }));
  }
  /**
   * The artboard is a small on-screen preview (CANVAS_W × CANVAS_H) that imported
   * photos get scaled DOWN to fit into. Exporting at that preview size is what was
   * shrinking your images. This finds how much the biggest imported photo was
   * scaled down to fit the artboard, so export can scale everything back UP by
   * that same factor — the export comes out at the imported image's own
   * dimensions instead of the small workspace preview size.
   */
  function exportScale(): number {
    let scale = 1;
    layers.forEach(l => {
      if (l.type === "image" && l.image && l.width > 0 && l.height > 0) {
        const { w, h } = srcSize(l);
        scale = Math.max(scale, w / l.width, h / l.height);
      }
    });
    return scale;
  }

  function exportImage() {
    const st = stageRef.current; if (!st) return;
    const tr = trRef.current, ov = overlayRef.current, ab = artboardRef.current;
    ov?.visible(false); tr?.visible(false);
    if (bg === "checker") ab?.visible(false); // transparent PNG
    // 1/zoom cancels the on-screen zoom; exportScale() then scales everything
    // back up so the imported photo(s) export at their original dimensions
    // instead of the shrunk artboard preview size.
    const uri = st.toDataURL({ pixelRatio: exportScale() / zoom });
    ov?.visible(true); tr?.visible(true); ab?.visible(true); st.batchDraw();
    const a = document.createElement("a"); a.href = uri; a.download = "picd-garment-result.png"; a.click();
  }

  function exportSVG() {
    const st = stageRef.current; if (!st) return;
    const tr = trRef.current, ov = overlayRef.current, ab = artboardRef.current;
    ov?.visible(false); tr?.visible(false);
    if (bg === "checker") ab?.visible(false); // transparent
    const scale = exportScale();
    // Same rule as exportImage: rasterise at the imported photo's native
    // resolution, not the shrunk preview size.
    const uri = st.toDataURL({ pixelRatio: scale / zoom });
    ov?.visible(true); tr?.visible(true); ab?.visible(true); st.batchDraw();
    const w = Math.round(CANVAS_W * scale), h = Math.round(CANVAS_H * scale);
    // Wrap it in an SVG sized to match, so Illustrator opens it at that same
    // (now-native) resolution instead of rescaling it again.
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><image href="${uri}" x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="none"/></svg>`;
    const blob = new Blob([svg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "picd-garment-result.svg"; a.click();
    URL.revokeObjectURL(url);
  }

  /* ---------- layer actions ---------- */
  function deleteLayer() {
    if (!selected) return;
    commit(d => ({ ...d, layers: d.layers.filter(l => l.id !== selected) })); setSelected(null);
  }
  function duplicateLayer() {
    if (!active) return;
    const copy: LayerItem = {
      ...active, id: "layer-" + Date.now(), name: active.name + " copy",
      x: active.x + 20, y: active.y + 20, points: active.points?.map(v => v + 20),
    };
    commit(d => ({ ...d, layers: [...d.layers, copy] })); setSelected(copy.id);
  }
  function reorder(dir: 1 | -1) {
    if (!selected) return;
    commit(d => {
      const i = d.layers.findIndex(l => l.id === selected), j = i + dir;
      if (i < 0 || j < 0 || j >= d.layers.length) return d;
      const arr = [...d.layers]; [arr[i], arr[j]] = [arr[j], arr[i]];
      return { ...d, layers: arr };
    });
  }
  function addShape() {
    const l: LayerItem = { id: "layer-" + Date.now(), name: "New Layer", type: "shape", visible: true, opacity: 1, x: 100, y: 100, width: 180, height: 120, rotation: 0, fill: brushColor };
    commit(d => ({ ...d, layers: [...d.layers, l] })); setSelected(l.id);
  }
  function flipSelected() { if (active && active.type !== "path") patch(active.id, { flipX: !active.flipX }); }
  function rotate90() { if (active && active.type !== "path") patch(active.id, { rotation: (active.rotation + 90) % 360 }); }
  function resetTransform() { if (active && active.type !== "path") patch(active.id, { rotation: 0, flipX: false }); }
  function toggleVisible() { if (active) patch(active.id, { visible: !active.visible }); }
  /** Right-click "Fill with Color" — shape layers just recolour; image layers get a
   *  new solid-colour layer shaped like the image's own alpha (silhouette fill),
   *  same idea as Photoshop's Edit > Fill on a layer, without touching the original. */
  function fillLayerWithColor(id: string) {
    const l = layers.find(x => x.id === id);
    if (!l) return;
    if (l.type === "shape") { patch(id, { fill: brushColor }); setCtxMenu(null); return; }
    if (!l.image) { setCtxMenu(null); return; }
    const c = makeFill(toCanvas(l.image), brushColor);
    const fill: LayerItem = { ...l, id: "fill-" + Date.now(), name: l.name + " Fill", image: c, thumb: thumbOf(c), visible: true, opacity: 1 };
    commit(d => {
      const arr: LayerItem[] = [];
      d.layers.forEach(x => { if (x.id === l.id) { arr.push({ ...x, visible: false }); arr.push(fill); } else arr.push(x); });
      return { ...d, layers: arr };
    });
    setSelected(fill.id);
    setCtxMenu(null);
  }
  function clearPaint() { commit(d => ({ ...d, strokes: [] })); }
  function clearAll() {
    if (!confirm("Clear the whole workspace?")) return;
    commit(() => ({ layers: [], strokes: [] })); setSelected(null); setSel(null);
  }

  /* ---------- selection (Photoshop-style) ---------- */
  function setSel(s: Selection | null) { selRef.current = s; setSelection(s); }
  function setMask(layerId: string, mask: HTMLCanvasElement) { setSel({ layerId, mask, edges: buildEdges(mask) }); }
  function targetImageLayer(): LayerItem | null {
    if (active && active.type === "image" && active.image) return active;
    return layers.find(l => l.id === "front" && l.image) || layers.find(l => l.id === "side" && l.image) || layers.find(l => l.type === "image" && l.image) || null;
  }
  function applyMask(l: LayerItem, add: HTMLCanvasElement, mode: SelMode) {
    const cur = selRef.current;
    const base = cur && cur.layerId === l.id ? cur.mask : null;
    setMask(l.id, combineMask(base, add, mode, imgW(l.image!), imgH(l.image!)));
    setSelected(l.id);
  }
  async function selectSubject() {
    const l = targetImageLayer();
    if (!l) { alert("Upload an image first."); return; }
    await withBusy("Detecting subject…", async () => {
      const m = await runSegmentation(toCanvas(l.image!), setBusy);
      applyMask(l, m, selMode);
    });
  }
  function pickImageLayerAt(p: { x: number; y: number }, box?: Box): LayerItem | null {
    const imgs = [...layers].reverse().filter(l => l.type === "image" && l.image && l.visible);
    const hit = (l: LayerItem) => box
      ? box.x < l.x + l.width && box.x + box.width > l.x && box.y < l.y + l.height && box.y + box.height > l.y
      : p.x >= l.x && p.x <= l.x + l.width && p.y >= l.y && p.y <= l.y + l.height;
    if (active && imgs.includes(active) && hit(active)) return active;
    return imgs.find(hit) || null;
  }
  async function objectSelectBox(r: Box) {
    const l = pickImageLayerAt({ x: r.x + r.width / 2, y: r.y + r.height / 2 }, r);
    if (!l || !l.image) { alert("Draw the box over an image."); return; }
    const pts = [[r.x, r.y], [r.x + r.width, r.y], [r.x, r.y + r.height], [r.x + r.width, r.y + r.height]].map(([x, y]) => layerToSource(l, { x, y }));
    const nw = imgW(l.image), nh = imgH(l.image);
    const x0 = clamp(Math.floor(Math.min(...pts.map(p => p.x))), 0, nw), x1 = clamp(Math.ceil(Math.max(...pts.map(p => p.x))), 0, nw);
    const y0 = clamp(Math.floor(Math.min(...pts.map(p => p.y))), 0, nh), y1 = clamp(Math.ceil(Math.max(...pts.map(p => p.y))), 0, nh);
    if (x1 - x0 < 8 || y1 - y0 < 8) return;
    await withBusy("Detecting object in box…", async () => {
      const sub = newCanvas(x1 - x0, y1 - y0);
      sub.getContext("2d")!.drawImage(toCanvas(l.image!), x0, y0, sub.width, sub.height, 0, 0, sub.width, sub.height);
      const m = await runSegmentation(sub, setBusy);
      const add = newCanvas(nw, nh); add.getContext("2d")!.drawImage(m, x0, y0);
      applyMask(l, add, selMode);
    });
  }
  function paintQuick(p: { x: number; y: number }) {
    const q = quick.current, s = selRef.current; if (!q || !s) return;
    const l = docRef.current.layers.find(x => x.id === q.layerId); if (!l || !l.image) return;
    const pt = layerToSource(l, p), c = cropOf(l), d = brushSize * (c.width / l.width);
    const ctx = s.mask.getContext("2d")!;
    ctx.globalCompositeOperation = q.erase ? "destination-out" : "source-over";
    ctx.fillStyle = ctx.strokeStyle = "#000"; ctx.lineWidth = d; ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.beginPath(); ctx.moveTo((q.last || pt).x, (q.last || pt).y); ctx.lineTo(pt.x, pt.y); ctx.stroke();
    ctx.beginPath(); ctx.arc(pt.x, pt.y, d / 2, 0, Math.PI * 2); ctx.fill();
    q.last = pt;
    refreshEdges(false);
  }
  function refreshEdges(force: boolean) {
    const now = performance.now();
    if (!force && now - lastEdge.current < 90) return;
    lastEdge.current = now;
    const s = selRef.current; if (!s) return;
    setSel({ ...s, edges: buildEdges(s.mask) });
  }
  function invertSelection() { const s = selRef.current; if (s) setMask(s.layerId, invertMask(s.mask)); }
  function deselect() { setSel(null); }
  function cutToNewLayer() {
    const s = selRef.current, l = s && layers.find(x => x.id === s.layerId);
    if (!s || !l || !l.image) { alert("Make a selection first."); return; }
    const c = makeCutout(l.image, s.mask);
    const cut: LayerItem = { ...l, id: "cutout-" + Date.now(), name: l.name + " Cutout", image: c, thumb: thumbOf(c), visible: true, opacity: 1 };
    commit(d => {
      const arr: LayerItem[] = [];
      d.layers.forEach(x => { if (x.id === l.id) { arr.push({ ...x, visible: false }); arr.push(cut); } else arr.push(x); });
      return { ...d, layers: arr };
    });
    setSelected(cut.id);
  }
  function deleteBackground() {
    const s = selRef.current, l = s && layers.find(x => x.id === s.layerId);
    if (!s || !l || !l.image) { alert("Make a selection first."); return; }
    const c = makeCutout(l.image, s.mask);
    patch(l.id, { image: c, thumb: thumbOf(c) });
  }
  function fillSelection() {
    const s = selRef.current, l = s && layers.find(x => x.id === s.layerId);
    if (!s || !l || !l.image) { alert("Make a selection first."); return; }
    const c = makeFill(s.mask, brushColor);
    const fill: LayerItem = { ...l, id: "fill-" + Date.now(), name: "Color Fill", image: c, thumb: thumbOf(c), visible: true, opacity: 1 };
    commit(d => ({ ...d, layers: [...d.layers, fill] }));
    setSelected(fill.id);
  }

  /** The original PICD flow: subject-select front + side, cut out, colour-fill, scale side to front height, align. */
  async function processGarment() {
    const bases = ["front", "side"].map(k => ({ kind: k, l: layers.find(l => l.id === k && l.image) })).filter(b => b.l) as { kind: string; l: LayerItem }[];
    if (!bases.length) { alert("Upload a front and/or side image first."); return; }
    await withBusy("Processing…", async () => {
      const groups: { kind: string; base: LayerItem; cut: LayerItem; fill: LayerItem; sil: { x: number; y: number; w: number; h: number } }[] = [];
      for (const { kind, l } of bases) {
        setBusy(`Detecting subject in ${kind} image…`);
        const mask = await runSegmentation(toCanvas(l.image!), setBusy);
        const sil = maskBounds(mask);
        if (!sil) throw new Error(`No subject found in the ${kind} image`);
        const cutC = makeCutout(l.image!, mask), fillC = makeFill(mask, FILL_RED);
        const cut: LayerItem = { ...l, id: kind + "-cut", name: kind + "_shape", image: cutC, thumb: thumbOf(cutC), visible: true, opacity: 1 };
        const fill: LayerItem = { ...l, id: kind + "-fill", name: kind === "front" ? "Color Fill" : "Color Fill 1", image: fillC, thumb: thumbOf(fillC), visible: false, opacity: 1 };
        groups.push({ kind, base: { ...l, visible: false }, cut, fill, sil });
      }
      // scale side so its subject is as tall as the front subject, then butt it against the front subject's right edge
      const fr = groups.find(g => g.kind === "front"), sd = groups.find(g => g.kind === "side");
      const sils: { x: number; y: number; w: number; h: number }[] = [];
      if (fr) sils.push(srcRectToArtboard(fr.base, fr.sil));
      if (fr && sd) {
        const F = srcRectToArtboard(fr.base, fr.sil), S = srcRectToArtboard(sd.base, sd.sil), k = F.h / S.h;
        const nx = F.x + F.w - (S.x - sd.base.x) * k, ny = F.y - (S.y - sd.base.y) * k;
        for (const it of [sd.base, sd.cut, sd.fill]) { it.x = nx; it.y = ny; it.width *= k; it.height *= k; it.rotation = 0; }
        sils.push({ x: F.x + F.w, y: F.y, w: S.w * k, h: F.h });
      } else if (sd) sils.push(srcRectToArtboard(sd.base, sd.sil));
      // centre the pair on the artboard (uniformly shrinking both if needed)
      const ux0 = Math.min(...sils.map(s => s.x)), uy0 = Math.min(...sils.map(s => s.y));
      const ux1 = Math.max(...sils.map(s => s.x + s.w)), uy1 = Math.max(...sils.map(s => s.y + s.h));
      const k2 = Math.min(1, (CANVAS_W - 2 * MARGIN) / (ux1 - ux0), (CANVAS_H - 2 * MARGIN) / (uy1 - uy0));
      const ucx = (ux0 + ux1) / 2, ucy = (uy0 + uy1) / 2;
      for (const g of groups) for (const it of [g.base, g.cut, g.fill]) {
        it.x = CANVAS_W / 2 + (it.x - ucx) * k2; it.y = CANVAS_H / 2 + (it.y - ucy) * k2;
        it.width *= k2; it.height *= k2; it.rotation = 0;
      }
      commit(d => {
        const arr: LayerItem[] = [];
        d.layers.forEach(x => {
          const g = groups.find(gg => gg.base.id === x.id);
          if (g) arr.push(g.base, g.cut, g.fill); else arr.push(x);
        });
        return { ...d, layers: arr };
      });
      setSel(null); setSelected(fr ? "front-cut" : "side-cut");
    });
  }

  /* ---------- pen / crop ---------- */
  function finishPath() {
    const pts: number[] = [];
    for (let i = 0; i < penPoints.length; i += 2) {
      const x = penPoints[i], y = penPoints[i + 1], n = pts.length;
      if (n >= 2 && Math.abs(pts[n - 2] - x) < 1 && Math.abs(pts[n - 1] - y) < 1) continue;
      pts.push(x, y);
    }
    setPenPoints([]);
    if (pts.length < 6) return;
    const count = layers.filter(l => l.type === "path").length + 1;
    const l: LayerItem = { id: "path-" + Date.now(), name: "Path " + count, type: "path", visible: true, opacity: 1, x: 0, y: 0, width: 0, height: 0, rotation: 0, fill: brushColor, points: pts };
    commit(d => ({ ...d, layers: [...d.layers, l] })); setSelected(l.id);
  }
  function applyCrop() {
    const l = active, r = cropRect;
    if (!l || l.type !== "image" || !l.image) { alert("Select an image layer first, then drag a crop box over it."); return; }
    if (!r || r.width < 4 || r.height < 4) { alert("Drag a crop box on the canvas first."); return; }
    if (Math.abs(l.rotation % 360) > 0.01) { alert("Reset the layer's rotation first (Image → Reset Transform)."); return; }
    const ix = Math.max(l.x, r.x), iy = Math.max(l.y, r.y);
    const iw = Math.min(l.x + l.width, r.x + r.width) - ix, ih = Math.min(l.y + l.height, r.y + r.height) - iy;
    if (iw < 2 || ih < 2) { alert("The crop box doesn't overlap the selected layer."); return; }
    const c = cropOf(l), k = c.width / l.width;
    const dx = l.flipX ? l.x + l.width - (ix + iw) : ix - l.x, dy = iy - l.y;
    patch(l.id, { x: ix, y: iy, width: iw, height: ih, crop: { x: c.x + dx * k, y: c.y + dy * k, width: iw * k, height: ih * k } });
    setCropRect(null);
  }

  /* ---------- pointer handling on the stage ---------- */
  function pointer() {
    const p = stageRef.current?.getPointerPosition();
    return p ? { x: p.x / zoom, y: p.y / zoom } : null;
  }
  function pickColor() {
    const st = stageRef.current, p = st?.getPointerPosition();
    if (!st || !p) return;
    const cv = st.toCanvas({ pixelRatio: 1 }) as HTMLCanvasElement;
    const d = cv.getContext("2d")?.getImageData(Math.floor(p.x), Math.floor(p.y), 1, 1).data;
    if (d) setBrushColor("#" + [d[0], d[1], d[2]].map(v => v.toString(16).padStart(2, "0")).join(""));
  }
  function onDown(e: any) {
    const p = pointer(); if (!p || busyRef.current) return;
    if (tool === "brush" || tool === "eraser") {
      setDraft({ id: "s-" + Date.now(), erase: tool === "eraser", color: brushColor, size: brushSize, opacity: brushOpacity / 100, points: [p.x, p.y] });
    } else if (tool === "crop" || tool === "objsel") {
      cropStart.current = p; setCropRect({ x: p.x, y: p.y, width: 0, height: 0 });
    } else if (tool === "quicksel") {
      const l = pickImageLayerAt(p); if (!l || !l.image) return;
      const erase = selMode === "sub" || !!e.evt?.altKey;
      const cur = selRef.current;
      if (!cur || cur.layerId !== l.id) {
        const blank = newCanvas(imgW(l.image), imgH(l.image));
        if (selMode === "sub") return; // nothing to subtract from
        setSel({ layerId: l.id, mask: blank, edges: buildEdges(blank) });
      } else if (selMode === "new" && !e.evt?.shiftKey) {
        const blank = newCanvas(imgW(l.image), imgH(l.image));
        setSel({ layerId: l.id, mask: blank, edges: buildEdges(blank) });
      }
      setSelected(l.id);
      quick.current = { layerId: l.id, last: null, erase };
      paintQuick(p);
    } else if (tool === "pen") {
      if (penPoints.length >= 6 && Math.hypot(p.x - penPoints[0], p.y - penPoints[1]) < 10 / zoom) { finishPath(); return; }
      setPenPoints(pts => [...pts, p.x, p.y]);
    } else if (tool === "eyedropper") {
      pickColor();
    } else if (canMove) {
      const t = e.target;
      if (t === t.getStage() || t.name?.() === "artboard") setSelected(null);
    }
  }
  function onMove() {
    const p = pointer(); if (!p) return;
    if (draft) setDraft(d => (d ? { ...d, points: [...d.points, p.x, p.y] } : d));
    else if (quick.current) paintQuick(p);
    else if (cropStart.current) {
      const s = cropStart.current;
      setCropRect({ x: Math.min(s.x, p.x), y: Math.min(s.y, p.y), width: Math.abs(p.x - s.x), height: Math.abs(p.y - s.y) });
    }
  }
  function onUp() {
    if (draft) {
      const s: Stroke = draft.points.length < 4 ? { ...draft, points: [...draft.points, draft.points[0], draft.points[1]] } : draft;
      commit(d => ({ ...d, strokes: [...d.strokes, s] })); setDraft(null);
    }
    if (quick.current) { quick.current = null; refreshEdges(true); }
    if (cropStart.current) {
      cropStart.current = null;
      const r = cropRect;
      if (!r || r.width < 4 || r.height < 4) setCropRect(null);
      else if (tool === "objsel") { setCropRect(null); objectSelectBox(r); }
    }
  }

  /* ---------- zoom ---------- */
  function fitZoom() {
    const el = scrollRef.current; if (!el) return;
    const z = Math.min((el.clientWidth - 90) / CANVAS_W, (el.clientHeight - 90) / CANVAS_H);
    setZoom(Math.max(0.2, Math.min(2, +z.toFixed(2))));
  }
  const zoomIn = () => setZoom(z => Math.min(3, +(z + 0.1).toFixed(2)));
  const zoomOut = () => setZoom(z => Math.max(0.2, +(z - 0.1).toFixed(2)));

  /* ---------- effects ---------- */
  useEffect(() => { fitZoom(); /* eslint-disable-next-line */ }, []);

  // attach the transform handles to the selected node (Transform tool)
  useEffect(() => {
    const tr = trRef.current; if (!tr) return;
    const l = layers.find(x => x.id === selected);
    const node = l && tool === "select" && l.visible && (l.type === "image" || l.type === "shape") ? nodes.current[l.id] : null;
    tr.nodes(node ? [node] : []);
    tr.getLayer()?.batchDraw();
  }, [selected, tool, layers]);

  // drop the selection if its layer disappears
  useEffect(() => {
    if (selection && !layers.some(l => l.id === selection.layerId)) setSel(null);
  }, [layers, selection]);

  // marching ants
  useEffect(() => {
    if (!hasSel) return;
    const t = setInterval(() => setAnts(a => (a === 0 ? 1 : 0)), 450);
    return () => clearInterval(t);
  }, [hasSel]);

  // close menus on outside click
  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => { if (!navRef.current?.contains(e.target as Node)) setMenu(null); };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [menu]);

  // close the right-click layer menu on any click, scroll, or Escape
  useEffect(() => {
    if (!ctxMenu) return;
    const close = () => setCtxMenu(null);
    const closeKey = (e: KeyboardEvent) => { if (e.key === "Escape") setCtxMenu(null); };
    window.addEventListener("mousedown", close);
    window.addEventListener("scroll", close, true);
    window.addEventListener("keydown", closeKey);
    return () => { window.removeEventListener("mousedown", close); window.removeEventListener("scroll", close, true); window.removeEventListener("keydown", closeKey); };
  }, [ctxMenu]);

  // keyboard shortcuts
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "z") { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
      if (mod && e.key.toLowerCase() === "y") { e.preventDefault(); redo(); return; }
      if (mod && e.key.toLowerCase() === "d") { e.preventDefault(); deselect(); return; }
      if (mod) return;
      if (e.key === "Enter" && tool === "pen") { finishPath(); return; }
      if (e.key === "Escape") { setPenPoints([]); setCropRect(null); setSelected(null); setMenu(null); setHelpOpen(false); return; }
      if ((e.key === "Delete" || e.key === "Backspace") && selected) { e.preventDefault(); deleteLayer(); return; }
      const t = TOOLS.find(x => x.key.toLowerCase() === e.key.toLowerCase());
      if (t) chooseTool(t.id);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  });

  /* ---------- menus ---------- */
  const noSel = !active;
  const menus: Record<string, MenuItem[]> = {
    File: [
      { label: "Upload Front Image…", onClick: () => fileFront.current?.click() },
      { label: "Upload Side Image…", onClick: () => fileSide.current?.click() },
      { divider: true, label: "" },
      { label: "Export PNG", onClick: exportImage, disabled: !hasImages },
      { label: "Export SVG", onClick: exportSVG, disabled: !hasImages },
      { divider: true, label: "" },
      { label: "Clear Workspace", onClick: clearAll },
    ],
    Edit: [
      { label: "Undo", hint: "Ctrl+Z", onClick: undo, disabled: !history.length },
      { label: "Redo", hint: "Ctrl+Shift+Z", onClick: redo, disabled: !future.length },
      { divider: true, label: "" },
      { label: "Duplicate Layer", onClick: duplicateLayer, disabled: noSel },
      { label: "Delete Layer", hint: "Del", onClick: deleteLayer, disabled: noSel },
      { label: "Clear Paint Strokes", onClick: clearPaint, disabled: !doc.strokes.length },
    ],
    Image: [
      { label: "Arrange Front + Side", onClick: autoArrange, disabled: !hasImages },
      { divider: true, label: "" },
      { label: "Flip Horizontal", onClick: flipSelected, disabled: noSel },
      { label: "Rotate 90° Clockwise", onClick: rotate90, disabled: noSel },
      { label: "Reset Transform", onClick: resetTransform, disabled: noSel },
    ],
    Layer: [
      { label: "New Shape Layer", onClick: addShape },
      { label: "Duplicate Layer", onClick: duplicateLayer, disabled: noSel },
      { label: "Delete Layer", onClick: deleteLayer, disabled: noSel },
      { divider: true, label: "" },
      { label: "New Cutout from Selection", onClick: cutToNewLayer, disabled: !hasSel },
      { label: "New Colour Fill from Selection", onClick: fillSelection, disabled: !hasSel },
      { divider: true, label: "" },
      { label: "Bring Forward", onClick: () => reorder(1), disabled: noSel },
      { label: "Send Backward", onClick: () => reorder(-1), disabled: noSel },
      { label: "Show / Hide Layer", onClick: toggleVisible, disabled: noSel },
    ],
    Select: [
      { label: "Subject (AI)", onClick: selectSubject, disabled: !hasImages },
      { label: "Deselect", hint: "Ctrl+D", onClick: deselect, disabled: !hasSel },
      { label: "Inverse", onClick: invertSelection, disabled: !hasSel },
      { divider: true, label: "" },
      { label: "Delete Background", onClick: deleteBackground, disabled: !hasSel },
      { label: "Cut Out to New Layer", onClick: cutToNewLayer, disabled: !hasSel },
      { label: "Fill Selection with Colour", onClick: fillSelection, disabled: !hasSel },
      { divider: true, label: "" },
      { label: "Select Front Layer", onClick: () => setSelected("front"), disabled: !frontLoaded },
      { label: "Select Side Layer", onClick: () => setSelected("side"), disabled: !sideLoaded },
    ],
    View: [
      { label: "Zoom In", onClick: zoomIn },
      { label: "Zoom Out", onClick: zoomOut },
      { label: "Fit to Screen", onClick: fitZoom },
      { label: "Actual Size (100%)", onClick: () => setZoom(1) },
      { divider: true, label: "" },
      { label: bg === "checker" ? "Background: White" : "Background: Transparent (checkerboard)", onClick: () => setBg(b => (b === "checker" ? "white" : "checker")) },
      { divider: true, label: "" },
      { label: leftOpen ? "Hide Tools Panel" : "Show Tools Panel", onClick: () => setLeftOpen(v => !v) },
      { label: rightOpen ? "Hide Layers Panel" : "Show Layers Panel", onClick: () => setRightOpen(v => !v) },
    ],
    Help: [{ label: "Keyboard Shortcuts", onClick: () => setHelpOpen(true) }],
  };

  /* ---------- render helpers ---------- */
  function nodeProps(l: LayerItem) {
    return {
      ...geomProps(l),
      opacity: l.opacity, draggable: canMove,
      ref: (n: any) => { nodes.current[l.id] = n; },
      onMouseDown: () => { if (canMove) setSelected(l.id); },
      onTouchStart: () => { if (canMove) setSelected(l.id); },
      onContextMenu: (e: any) => {
        e.evt.preventDefault();
        setSelected(l.id);
        setCtxMenu({ x: e.evt.clientX, y: e.evt.clientY, layerId: l.id });
      },
      onDragEnd: (e: any) => patch(l.id, { x: e.target.x() - l.width / 2, y: e.target.y() - l.height / 2 }),
      onTransformEnd: (e: any) => {
        const n = e.target;
        const w = Math.max(10, l.width * Math.abs(n.scaleX())), h = Math.max(10, l.height * Math.abs(n.scaleY()));
        n.scaleX(l.flipX ? -1 : 1); n.scaleY(1);
        patch(l.id, { x: n.x() - w / 2, y: n.y() - h / 2, width: w, height: h, rotation: n.rotation() });
      },
    };
  }
  const cursor = tool === "hand" ? "grab" : canMove ? "default" : "crosshair";
  const swatches = ["#cd1f1f", "#ffffff", "#000000"];
  const showsBrushSize = tool === "brush" || tool === "eraser" || tool === "quicksel";

  return <main className="app">
    <header className="topbar">
      <div className="brand"><div className="brandMark">P</div><span>PICD Workspace</span></div>
      <nav ref={navRef}>
        {Object.keys(menus).map(name => <div className="menuWrap" key={name}>
          <button className={menu === name ? "open" : ""} onClick={() => setMenu(menu === name ? null : name)} onMouseEnter={() => menu && setMenu(name)}>{name}</button>
          {menu === name && <div className="menu">
            {menus[name].map((it, i) => it.divider ? <hr key={i} /> :
              <button key={i} disabled={it.disabled || !!busy} onClick={() => { setMenu(null); it.onClick?.(); }}><span>{it.label}</span>{it.hint && <em>{it.hint}</em>}</button>)}
          </div>}
        </div>)}
      </nav>
      <div className="topActions">
        <button className="iconBtn" onClick={undo} title="Undo" disabled={!history.length}><Undo2 size={16} /></button>
        <button className="iconBtn" onClick={redo} title="Redo" disabled={!future.length}><Redo2 size={16} /></button>
        <button className="secondary" onClick={() => fileFront.current?.click()}><Upload size={15} /> Front</button>
        <button className="secondary" onClick={() => fileSide.current?.click()}><Upload size={15} /> Side</button>
        <button className="secondary" onClick={selectSubject} disabled={!hasImages || !!busy} title="Select the person/object automatically"><Wand2 size={15} /> Select Subject</button>
        <button className="iconBtn" onClick={exportImage} title="Export PNG"><Download size={16} /></button>
        <button className="iconBtn" onClick={exportSVG} title="Export SVG"><Download size={16} /></button>
      </div>
      <input ref={fileFront} hidden type="file" accept="image/*" onChange={e => { const f = e.target.files?.[0]; if (f) loadFile("front", f); e.target.value = ""; }} />
      <input ref={fileSide} hidden type="file" accept="image/*" onChange={e => { const f = e.target.files?.[0]; if (f) loadFile("side", f); e.target.value = ""; }} />
    </header>

    <div className="subbar">
      <div className="docTab"><ImageIcon size={14} /><span>Garment Workspace</span><span className="dot" /></div>
      <div className="subTools">
        <span>Tool: <b>{TOOLS.find(t => t.id === tool)?.label}</b></span>
        <span>W {CANVAS_W} × H {CANVAS_H}</span>
        <button onClick={zoomOut} title="Zoom out"><ZoomOut size={14} /></button>
        <span>{Math.round(zoom * 100)}%</span>
        <button onClick={zoomIn} title="Zoom in"><ZoomIn size={14} /></button>
        <button onClick={fitZoom} title="Fit to screen"><Maximize2 size={14} /></button>
      </div>
    </div>

    <div className="workspace">
      {leftOpen && <aside className="leftbar">
        <div className="panelHeader">TOOLS <button onClick={() => setLeftOpen(false)}><PanelLeft size={14} /></button></div>
        <div className="toolGrid">{TOOLS.map(t => { const I = t.icon; return <button key={t.id} className={tool === t.id ? "tool active" : "tool"} onClick={() => chooseTool(t.id)} title={`${t.label} (${t.key})`}><I size={19} /><small>{t.label}</small></button>; })}</div>

        {(isSelTool || hasSel) && <div className="selPanel">
          <div className="panelHeader">SELECTION</div>
          <div className="modeRow">
            {(["new", "add", "sub"] as SelMode[]).map(m => <button key={m} className={selMode === m ? "on" : ""} onClick={() => setSelMode(m)}>{m === "new" ? "New" : m === "add" ? "Add" : "Subtract"}</button>)}
          </div>
          <div className="selActions">
            <button onClick={selectSubject} disabled={!hasImages || !!busy}><Wand2 size={13} /> Select Subject (AI)</button>
            <button onClick={invertSelection} disabled={!hasSel}>Inverse</button>
            <button onClick={deselect} disabled={!hasSel}>Deselect</button>
            <button onClick={cutToNewLayer} disabled={!hasSel}>Cut Out → New Layer</button>
            <button onClick={deleteBackground} disabled={!hasSel}>Delete Background</button>
            <button onClick={fillSelection} disabled={!hasSel}>Fill with Colour</button>
          </div>
        </div>}

        <div className="toolOptions">
          <div className="panelHeader">OPTIONS</div>
          <p className="hint">{TOOL_HINT[tool]}</p>
          {showsBrushSize && <label>Size: {brushSize}px <input type="range" min="1" max="100" value={brushSize} onChange={e => setBrushSize(+e.target.value)} /></label>}
          {tool === "brush" && <label>Opacity: {brushOpacity}% <input type="range" min="1" max="100" value={brushOpacity} onChange={e => setBrushOpacity(+e.target.value)} /></label>}
          {tool === "pen" && <div className="optButtons">
            <button onClick={finishPath} disabled={penPoints.length < 6}><Check size={13} /> Finish</button>
            <button onClick={() => setPenPoints([])} disabled={!penPoints.length}><X size={13} /> Cancel</button>
          </div>}
          {tool === "crop" && <div className="optButtons">
            <button onClick={applyCrop} disabled={!cropRect}><Check size={13} /> Apply</button>
            <button onClick={() => setCropRect(null)} disabled={!cropRect}><X size={13} /> Cancel</button>
          </div>}
          <div className="swatches">
            {swatches.map(c => <button key={c} className={"swatch" + (brushColor.toLowerCase() === c ? " on" : "")} style={{ background: c }} onClick={() => setBrushColor(c)} title={c} />)}
            <input type="color" className="colorPick" value={brushColor} onChange={e => setBrushColor(e.target.value)} title="Custom colour" />
          </div>
        </div>
      </aside>}

      <section className="canvasArea">
        {!leftOpen && <button className="float left" onClick={() => setLeftOpen(true)}><PanelRight size={15} /></button>}
        {!rightOpen && <button className="float right" onClick={() => setRightOpen(true)}><PanelLeft size={15} /></button>}
        <div
          className="canvasScroll" ref={scrollRef} style={{ cursor }}
          onMouseDown={e => { if (tool === "hand" && scrollRef.current) pan.current = { x: e.clientX, y: e.clientY, l: scrollRef.current.scrollLeft, t: scrollRef.current.scrollTop }; }}
          onMouseMove={e => { if (pan.current && scrollRef.current) { scrollRef.current.scrollLeft = pan.current.l - (e.clientX - pan.current.x); scrollRef.current.scrollTop = pan.current.t - (e.clientY - pan.current.y); } }}
          onMouseUp={() => { pan.current = null; }}
          onMouseLeave={() => { pan.current = null; }}
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); handleFiles(Array.from(e.dataTransfer.files)); }}
        >
          <div className="canvasWrap" style={{ width: CANVAS_W * zoom, height: CANVAS_H * zoom }}>
            <div className="canvasTitle">GARMENT ARTBOARD</div>
            <Stage
              width={CANVAS_W * zoom} height={CANVAS_H * zoom} scaleX={zoom} scaleY={zoom} ref={stageRef} className="stage"
              onMouseDown={onDown} onTouchStart={onDown} onMouseMove={onMove} onTouchMove={onMove}
              onMouseUp={onUp} onTouchEnd={onUp} onMouseLeave={onUp}
              onDblClick={() => { if (tool === "pen") finishPath(); }}
              onContextMenu={(e: any) => e.evt.preventDefault()}
            >
              <Layer>
                <Rect ref={artboardRef} name="artboard" x={0} y={0} width={CANVAS_W} height={CANVAS_H}
                  fill={bg === "white" ? "#fff" : undefined}
                  fillPatternImage={bg === "checker" ? (checker as any) : undefined}
                  fillPatternRepeat="repeat" fillPatternScale={{ x: 1 / zoom, y: 1 / zoom }} />
                {layers.map(l => {
                  if (!l.visible) return null;
                  if (l.type === "image" && l.image) return <KImage key={l.id} image={l.image} crop={l.crop} {...nodeProps(l)} />;
                  if (l.type === "shape") return <Rect key={l.id} fill={l.fill} {...nodeProps(l)} />;
                  if (l.type === "path" && l.points) return <Line key={l.id} points={l.points} closed fill={(l.fill || "#cd1f1f") + "40"} stroke={l.fill} strokeWidth={2} opacity={l.opacity} hitStrokeWidth={10}
                    onMouseDown={() => { if (canMove) setSelected(l.id); }}
                    onContextMenu={(e: any) => { e.evt.preventDefault(); setSelected(l.id); setCtxMenu({ x: e.evt.clientX, y: e.evt.clientY, layerId: l.id }); }} />;
                  return null;
                })}
              </Layer>
              <Layer listening={false}>
                {[...doc.strokes, ...(draft ? [draft] : [])].map(s =>
                  <Line key={s.id} points={s.points} stroke={s.erase ? "#000" : s.color} strokeWidth={s.size} opacity={s.erase ? 1 : s.opacity}
                    lineCap="round" lineJoin="round" tension={0.4} globalCompositeOperation={s.erase ? "destination-out" : "source-over"} />)}
              </Layer>
              <Layer ref={overlayRef}>
                {selection && selLayer && selLayer.image && (() => {
                  const e = selection.edges[ants], s = e.width / imgW(selLayer.image!), c = selLayer.crop;
                  return <KImage image={e} crop={c ? { x: c.x * s, y: c.y * s, width: c.width * s, height: c.height * s } : undefined} {...geomProps(selLayer)} listening={false} />;
                })()}
                {penPoints.length > 0 && <>
                  <Line points={penPoints} stroke="#3d8bfd" strokeWidth={1.5 / zoom} dash={[6 / zoom, 4 / zoom]} listening={false} />
                  {penPoints.map((v, i) => i % 2 === 0 ? <Circle key={i} x={v} y={penPoints[i + 1]} radius={4 / zoom} fill="#fff" stroke="#3d8bfd" strokeWidth={1.5 / zoom} listening={false} /> : null)}
                </>}
                {cropRect && <Rect {...cropRect} stroke="#3d8bfd" strokeWidth={1.5 / zoom} dash={[6 / zoom, 4 / zoom]} fill="rgba(61,139,253,.12)" listening={false} />}
                <Transformer ref={trRef} rotateEnabled keepRatio flipEnabled={false}
                  enabledAnchors={["top-left", "top-right", "bottom-left", "bottom-right"]}
                  boundBoxFunc={(o: any, n: any) => (n.width < 10 || n.height < 10 ? o : n)} />
              </Layer>
            </Stage>
            {!hasImages && <div className="emptyCanvas"><div className="emptyIcon"><ImageIcon /></div><h2>Drop images here</h2><p>Upload a front and side garment image to begin.</p><div><button className="secondary big" onClick={() => fileFront.current?.click()}><Upload size={16} /> Upload Front</button><button className="secondary big" onClick={() => fileSide.current?.click()}><Upload size={16} /> Upload Side</button></div></div>}
            {busy && <div className="busyBox"><span className="spinner" />{busy}</div>}
          </div>
        </div>
      </section>

      {rightOpen && <aside className="rightbar">
        <div className="panelHeader"><span>LAYERS</span><div><button onClick={() => setRightOpen(false)}><PanelRight size={14} /></button><button onClick={addShape} title="New shape layer"><Plus size={14} /></button></div></div>
        <div className="layers">
          {ordered.length === 0 && <p className="muted">No layers yet.</p>}
          {ordered.map(l => <div className={"layer " + (selected === l.id ? "selected" : "")} key={l.id} onClick={() => setSelected(l.id)}>
            <button className="eye" onClick={e => { e.stopPropagation(); patch(l.id, { visible: !l.visible }); }}>{l.visible ? <Eye size={14} /> : <EyeOff size={14} />}</button>
            <div className="thumb">{l.thumb ? <img src={l.thumb} alt="" /> : l.image instanceof HTMLImageElement ? <img src={l.image.src} alt="" /> : <span style={{ background: l.fill || "#ddd" }} />}</div>
            <span>{l.name}</span>
            <small>{l.type}</small>
          </div>)}
        </div>
        <div className="properties">
          <div className="panelHeader">PROPERTIES <SlidersHorizontal size={14} /></div>
          {active ? <div className="fields">
            <label>Name<input value={active.name} onChange={e => live(active.id, { name: e.target.value })} /></label>
            {active.type !== "path" && <>
              <div className="two">
                <label>X<input type="number" value={Math.round(active.x)} onChange={e => patch(active.id, { x: +e.target.value })} /></label>
                <label>Y<input type="number" value={Math.round(active.y)} onChange={e => patch(active.id, { y: +e.target.value })} /></label>
              </div>
              <div className="two">
                <label>W<input type="number" value={Math.round(active.width)} onChange={e => { const w = Math.max(1, +e.target.value); patch(active.id, active.type === "image" ? { width: w, height: (w * active.height) / active.width } : { width: w }); }} /></label>
                <label>H<input type="number" value={Math.round(active.height)} onChange={e => { const h = Math.max(1, +e.target.value); patch(active.id, active.type === "image" ? { height: h, width: (h * active.width) / active.height } : { height: h }); }} /></label>
              </div>
            </>}
            <label>Opacity<input type="range" min="0" max="1" step=".01" value={active.opacity} onChange={e => live(active.id, { opacity: +e.target.value })} /></label>
            {active.type !== "path" && <div className="propButtons"><button onClick={resetTransform}><RotateCcw size={14} /> Reset</button><button onClick={rotate90}>Rotate 90°</button></div>}
          </div> : <p className="muted">Select a layer to edit its properties.</p>}
        </div>
        <div className="actions">
          <button onClick={flipSelected} disabled={!active || active.type === "path"}><FlipHorizontal size={15} /> Flip Horizontal</button>
          <button className="danger" onClick={deleteLayer} disabled={!active}><Trash2 size={15} /> Delete Layer</button>
        </div>
      </aside>}
    </div>

    <footer className="statusbar">
      <span><span className="statusDot" /> {busy || "Ready"}</span>
      <span>{layers.length} layers</span>
      <span>Front: {frontLoaded ? "loaded" : "not loaded"}</span>
      <span>Side: {sideLoaded ? "loaded" : "not loaded"}</span>
      <span>Selection: {hasSel ? "active" : "none"}</span>
      <span className="grow" /><span>PICD Workspace</span>
    </footer>

    {helpOpen && <div className="modalBack" onMouseDown={() => setHelpOpen(false)}>
      <div className="modal" onMouseDown={e => e.stopPropagation()}>
        <div className="panelHeader"><span>KEYBOARD SHORTCUTS</span><button onClick={() => setHelpOpen(false)}><X size={14} /></button></div>
        <div className="modalBody">
          {TOOLS.map(t => <div key={t.id}><kbd>{t.key}</kbd> {t.label}</div>)}
          <div><kbd>Ctrl/⌘ Z</kbd> Undo</div><div><kbd>Ctrl/⌘ Shift Z</kbd> Redo</div><div><kbd>Ctrl/⌘ D</kbd> Deselect</div>
          <div><kbd>Del</kbd> Delete layer</div><div><kbd>Enter</kbd> Finish path</div><div><kbd>Esc</kbd> Cancel / deselect layer</div>
          <div>Quick Selection: hold <kbd>Alt</kbd> to subtract.</div>
          <div>You can also drag &amp; drop images onto the canvas.</div>
        </div>
      </div>
    </div>}

    {ctxMenu && (() => {
      const l = layers.find(x => x.id === ctxMenu.layerId);
      if (!l) return null;
      const item = (label: string, onClick: () => void, disabled?: boolean) =>
        <button key={label} disabled={disabled} onClick={onClick}>{label}</button>;
      return <div className="layerCtxMenu" style={{ left: ctxMenu.x, top: ctxMenu.y }} onMouseDown={e => e.stopPropagation()}>
        {item("Fill with Color", () => fillLayerWithColor(l.id))}
        {l.type === "image" && item("Delete Background", () => { deleteBackground(); setCtxMenu(null); })}
        <hr />
        {item("Duplicate Layer", () => { duplicateLayer(); setCtxMenu(null); })}
        {item(l.visible ? "Hide Layer" : "Show Layer", () => { toggleVisible(); setCtxMenu(null); })}
        {item("Delete Layer", () => { deleteLayer(); setCtxMenu(null); })}
        <hr />
        {l.type !== "path" && item("Flip Horizontal", () => { flipSelected(); setCtxMenu(null); })}
        {l.type !== "path" && item("Rotate 90°", () => { rotate90(); setCtxMenu(null); })}
        {l.type !== "path" && item("Reset Transform", () => { resetTransform(); setCtxMenu(null); })}
        <hr />
        {item("Bring Forward", () => { reorder(1); setCtxMenu(null); })}
        {item("Send Backward", () => { reorder(-1); setCtxMenu(null); })}
      </div>;
    })()}
  </main>;
}
