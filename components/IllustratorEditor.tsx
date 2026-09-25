"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ConfirmModal from "@/components/ConfirmModal";
import {
  MousePointer2, PenTool, Pencil, Square, Circle, Minus, Type, Hand,
  ZoomIn, ZoomOut, Upload, Download, Undo2, Redo2, Trash2, Copy,
  Layers3, Plus, ChevronDown, Move, Scissors, Sparkles, Image as ImageIcon,
  Save, FilePlus2, Group, Ungroup, AlignLeft, AlignCenter, AlignRight,
  RotateCcw, FlipHorizontal, FlipVertical, Eye, EyeOff, Crosshair, Wand2
} from "lucide-react";

type Tool = "select" | "direct" | "pen" | "pencil" | "rect" | "ellipse" | "line" | "text" | "hand";
type Kind = "rect" | "ellipse" | "line" | "path" | "text" | "image" | "group";
type Point = { x: number; y: number };
type Gradient = { enabled: boolean; from: string; to: string; angle: number };
type Item = {
  id: string; name: string; kind: Kind; x: number; y: number; width: number; height: number;
  rotation: number; fill: string; stroke: string; strokeWidth: number; opacity: number;
  points?: Point[]; text?: string; fontSize?: number; fontFamily?: string; visible: boolean;
  href?: string; preserveAspectRatio?: string; gradient?: Gradient; groupId?: string;
};
type Doc = { width: number; height: number; background: string; items: Item[] };

const ART_W = 1200, ART_H = 800;
const uid = () => Math.random().toString(36).slice(2, 9);
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function defaultDoc(accent = "#315f9f"): Doc {
  return {
    width: ART_W, height: ART_H, background: "#ffffff",
    items: [
      { id: uid(), name: "Rectangle", kind: "rect", x: 150, y: 150, width: 360, height: 230, rotation: 0, fill: accent, stroke: "color-mix(in srgb, " + accent + " 72%, #000)", strokeWidth: 2, opacity: 1, visible: true, gradient: { enabled: false, from: accent, to: "color-mix(in srgb, " + accent + " 35%, #fff)", angle: 45 } },
      { id: uid(), name: "Circle", kind: "ellipse", x: 650, y: 160, width: 210, height: 210, rotation: 0, fill: "color-mix(in srgb, " + accent + " 62%, #fff)", stroke: accent, strokeWidth: 2, opacity: 1, visible: true, gradient: { enabled: false, from: "color-mix(in srgb, " + accent + " 62%, #fff)", to: accent, angle: 45 } },
    ]
  };
}

function download(name: string, data: string, type = "image/svg+xml") {
  const blob = new Blob([data], { type }); const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = name; a.click(); URL.revokeObjectURL(a.href);
}

function itemBounds(i: Item) {
  if (i.kind === "line" || i.kind === "path") {
    const ps = i.points || [];
    if (!ps.length) return { x: i.x, y: i.y, width: i.width, height: i.height };
    const xs = ps.map(p => p.x), ys = ps.map(p => p.y);
    return { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
  }
  return { x: i.x, y: i.y, width: i.width, height: i.height };
}

function svgForDoc(doc: Doc) {
  const defs: string[] = [];
  const body = doc.items.filter(i => i.visible).map(i => {
    const transform = `translate(${i.x} ${i.y}) rotate(${i.rotation} ${i.width / 2} ${i.height / 2})`;
    const fill = i.gradient?.enabled ? `url(#g-${i.id})` : i.fill;
    if (i.gradient?.enabled) defs.push(`<linearGradient id="g-${i.id}" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="${i.gradient.from}"/><stop offset="100%" stop-color="${i.gradient.to}"/></linearGradient>`);
    const common = `stroke="${i.stroke}" stroke-width="${i.strokeWidth}" opacity="${i.opacity}"`;
    if (i.kind === "rect") return `<rect x="${i.x}" y="${i.y}" width="${i.width}" height="${i.height}" rx="0" fill="${fill}" ${common} transform="rotate(${i.rotation} ${i.x + i.width / 2} ${i.y + i.height / 2})"/>`;
    if (i.kind === "ellipse") return `<ellipse cx="${i.x + i.width / 2}" cy="${i.y + i.height / 2}" rx="${i.width / 2}" ry="${i.height / 2}" fill="${fill}" ${common} transform="rotate(${i.rotation} ${i.x + i.width / 2} ${i.y + i.height / 2})"/>`;
    if (i.kind === "line") { const p = i.points || [{x:i.x,y:i.y},{x:i.x+i.width,y:i.y+i.height}]; return `<line x1="${p[0].x}" y1="${p[0].y}" x2="${p[1].x}" y2="${p[1].y}" fill="none" ${common}/>`; }
    if (i.kind === "path") return `<polyline points="${(i.points||[]).map(p => `${p.x},${p.y}`).join(" ")}" fill="none" ${common}/>`;
    if (i.kind === "text") return `<text x="${i.x}" y="${i.y + (i.fontSize || 48)}" fill="${i.fill}" font-family="${esc(i.fontFamily || "Inter, sans-serif")}" font-size="${i.fontSize || 48}" opacity="${i.opacity}" transform="rotate(${i.rotation} ${i.x} ${i.y})">${esc(i.text || "Text")}</text>`;
    if (i.kind === "image") return `<image href="${i.href}" x="${i.x}" y="${i.y}" width="${i.width}" height="${i.height}" preserveAspectRatio="${i.preserveAspectRatio || "none"}" opacity="${i.opacity}" transform="rotate(${i.rotation} ${i.x+i.width/2} ${i.y+i.height/2})"/>`;
    return "";
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${doc.width}" height="${doc.height}" viewBox="0 0 ${doc.width} ${doc.height}"><defs>${defs.join("")}</defs><rect width="100%" height="100%" fill="${doc.background}"/>${body}</svg>`;
}


function importSVGAsVectors(src: string, name: string): Item[] {
  const parser = new DOMParser();
  const xml = parser.parseFromString(src, "image/svg+xml");
  const out: Item[] = [];
  const color = (el: Element, attr: string, fallback: string) => el.getAttribute(attr) || fallback;
  xml.querySelectorAll("rect,circle,ellipse,line,polyline,polygon,text").forEach((el, idx) => {
    const tag = el.tagName.toLowerCase();
    const stroke = color(el, "stroke", "#111827");
    const sw = Number(el.getAttribute("stroke-width") || 1);
    const fill = color(el, "fill", tag === "line" || tag === "polyline" || tag === "polygon" ? "none" : "#2f80ed");
    const opacity = Number(el.getAttribute("opacity") || 1);
    if (tag === "rect") out.push({id:uid(),name:`${name} rect ${idx+1}`,kind:"rect",x:Number(el.getAttribute("x")||0),y:Number(el.getAttribute("y")||0),width:Number(el.getAttribute("width")||100),height:Number(el.getAttribute("height")||100),rotation:0,fill,stroke,strokeWidth:sw,opacity,visible:true});
    else if (tag === "circle") { const cx=Number(el.getAttribute("cx")||0),cy=Number(el.getAttribute("cy")||0),r=Number(el.getAttribute("r")||40); out.push({id:uid(),name:`${name} circle ${idx+1}`,kind:"ellipse",x:cx-r,y:cy-r,width:r*2,height:r*2,rotation:0,fill,stroke,strokeWidth:sw,opacity,visible:true}); }
    else if (tag === "ellipse") { const cx=Number(el.getAttribute("cx")||0),cy=Number(el.getAttribute("cy")||0),rx=Number(el.getAttribute("rx")||50),ry=Number(el.getAttribute("ry")||30); out.push({id:uid(),name:`${name} ellipse ${idx+1}`,kind:"ellipse",x:cx-rx,y:cy-ry,width:rx*2,height:ry*2,rotation:0,fill,stroke,strokeWidth:sw,opacity,visible:true}); }
    else if (tag === "line") { const x1=Number(el.getAttribute("x1")||0),y1=Number(el.getAttribute("y1")||0),x2=Number(el.getAttribute("x2")||0),y2=Number(el.getAttribute("y2")||0); out.push({id:uid(),name:`${name} line ${idx+1}`,kind:"line",x:x1,y:y1,width:x2-x1,height:y2-y1,rotation:0,fill:"none",stroke,strokeWidth:sw,opacity,visible:true,points:[{x:x1,y:y1},{x:x2,y:y2}]}); }
    else if (tag === "polyline" || tag === "polygon") { const pts=(el.getAttribute("points")||"").trim().split(/[ ,]+/).map(Number); const points:Point[]=[]; for(let i=0;i+1<pts.length;i+=2)points.push({x:pts[i],y:pts[i+1]}); out.push({id:uid(),name:`${name} ${tag} ${idx+1}`,kind:"path",x:0,y:0,width:0,height:0,rotation:0,fill:"none",stroke,strokeWidth:sw,opacity,visible:true,points}); }
    else if (tag === "text") out.push({id:uid(),name:`${name} text ${idx+1}`,kind:"text",x:Number(el.getAttribute("x")||0),y:Number(el.getAttribute("y")||0),width:300,height:60,rotation:0,fill,stroke:"none",strokeWidth:0,opacity,visible:true,text:el.textContent||"Text",fontSize:Number(el.getAttribute("font-size")||48),fontFamily:el.getAttribute("font-family")||"Inter, sans-serif"});
  });
  return out;
}

function dataUrlToImage(src: string) { return new Promise<HTMLImageElement>((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = reject; img.src = src; }); }

function rasterTrace(src: string, threshold = 240): Promise<string> {
  return new Promise(async (resolve, reject) => {
    try {
      const img = await dataUrlToImage(src); const max = 900; const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.max(1, Math.round(img.naturalWidth*s)), h = Math.max(1, Math.round(img.naturalHeight*s));
      const c = document.createElement("canvas"); c.width=w; c.height=h; const ctx=c.getContext("2d")!; ctx.drawImage(img,0,0,w,h);
      const d=ctx.getImageData(0,0,w,h).data; const step=Math.max(2,Math.round(Math.max(w,h)/240)); const rects:string[]=[];
      for(let y=0;y<h;y+=step){for(let x=0;x<w;x+=step){let dark=false;for(let yy=y;yy<Math.min(h,y+step);yy++)for(let xx=x;xx<Math.min(w,x+step);xx++){const o=(yy*w+xx)*4;const a=d[o+3], lum=(.299*d[o]+.587*d[o+1]+.114*d[o+2]);if(a>30&&lum<threshold){dark=true;break}} if(dark) rects.push(`<rect x="${x/s}" y="${y/s}" width="${step/s+0.5}" height="${step/s+0.5}"/>`);}}
      resolve(`<svg xmlns="http://www.w3.org/2000/svg" width="${img.naturalWidth}" height="${img.naturalHeight}" viewBox="0 0 ${img.naturalWidth} ${img.naturalHeight}"><g fill="#000">${rects.join("")}</g></svg>`);
    } catch(e){reject(e)}
  });
}

export default function IllustratorEditor() {
  const [themeAccent,setThemeAccent]=useState("#315f9f"); const [doc,setDoc]=useState<Doc>(()=>defaultDoc("#315f9f")); const [history,setHistory]=useState<Doc[]>([]); const [future,setFuture]=useState<Doc[]>([]);
  const [tool,setTool]=useState<Tool>("select"); const [selected,setSelected]=useState<string|null>(null); const [zoom,setZoom]=useState(0.72);
  const [fill,setFill]=useState("#2f80ed"); const [stroke,setStroke]=useState("#111827"); const [strokeWidth,setStrokeWidth]=useState(2); const [opacity,setOpacity]=useState(100);
  const [drag,setDrag]=useState<{id:string;ox:number;oy:number;startX:number;startY:number}|null>(null); const [drawing,setDrawing]=useState<Point[]>([]);
  const [status,setStatus]=useState("Ready"); const [traceMode,setTraceMode]=useState(false); const [dialog,setDialog]=useState<{title:string;message:string;tone:"default"|"danger";onConfirm?:()=>void}|null>(null); const fileRef=useRef<HTMLInputElement>(null); const svgRef=useRef<SVGSVGElement>(null); const workspaceRef=useRef<HTMLDivElement>(null);
  const current=doc.items.find(i=>i.id===selected)||null;

  const commit=(next:Doc)=>{setHistory(h=>[...h.slice(-39),clone(doc)]);setFuture([]);setDoc(next)};
  const update=(id:string,patch:Partial<Item>)=>commit({...doc,items:doc.items.map(i=>i.id===id?{...i,...patch}:i)});
  const add=(item:Item)=>{commit({...doc,items:[...doc.items,item]});setSelected(item.id)};
  const remove=()=>{if(!selected)return;const item=doc.items.find(i=>i.id===selected);if(!item)return;setDialog({title:"Delete artwork object?",message:`Delete “${item.name}” from this artwork? This can be undone with Undo.`,tone:"danger",onConfirm:()=>{commit({...doc,items:doc.items.filter(i=>i.id!==selected)});setSelected(null);}})};
  const undo=()=>{if(!history.length)return; const h=[...history];const prev=h.pop()!;setFuture(f=>[clone(doc),...f]);setDoc(prev);setHistory(h);setSelected(null)};
  const redo=()=>{if(!future.length)return;const [n,...rest]=future;setHistory(h=>[...h,clone(doc)]);setDoc(n);setFuture(rest);setSelected(null)};

  const pointFromEvent=(e:React.PointerEvent)=>{const r=svgRef.current!.getBoundingClientRect();return {x:(e.clientX-r.left)/zoom,y:(e.clientY-r.top)/zoom};};
  const pointerDown=(e:React.PointerEvent)=>{if(e.button!==0)return; const p=pointFromEvent(e);
    if(tool==="rect"||tool==="ellipse"||tool==="line"){setDrawing([p]);return}
    if(tool==="pen"||tool==="pencil"){setDrawing([p]);return}
    if(tool==="select" && selected){const i=doc.items.find(x=>x.id===selected);if(i){setDrag({id:i.id,ox:p.x-i.x,oy:p.y-i.y,startX:p.x,startY:p.y});return}}
  };
  const pointerMove=(e:React.PointerEvent)=>{if(!drag)return;const p=pointFromEvent(e);const i=doc.items.find(x=>x.id===drag.id);if(!i)return;setDoc(d=>({...d,items:d.items.map(x=>x.id===drag.id?{...x,x:i.x+(p.x-drag.startX),y:i.y+(p.y-drag.startY)}:x)}))};
  const pointerUp=(e:React.PointerEvent)=>{const p=pointFromEvent(e); if(drag){setHistory(h=>[...h.slice(-39),clone(doc)]);setFuture([]);setDrag(null);return}
    if(!drawing.length)return; const s=drawing[0];
    if(tool==="rect"||tool==="ellipse"){const x=Math.min(s.x,p.x),y=Math.min(s.y,p.y),w=Math.abs(p.x-s.x),h=Math.abs(p.y-s.y); if(w>4&&h>4)add({id:uid(),name:tool==="rect"?"Rectangle":"Ellipse",kind:tool==="rect"?"rect":"ellipse",x,y,width:w,height:h,rotation:0,fill,stroke,strokeWidth,opacity:opacity/100,visible:true,gradient:{enabled:false,from:fill,to:"#ffffff",angle:45}})}
    else if(tool==="line"){add({id:uid(),name:"Line",kind:"line",x:s.x,y:s.y,width:p.x-s.x,height:p.y-s.y,rotation:0,fill:"none",stroke,strokeWidth,opacity:opacity/100,visible:true,points:[s,p]})}
    else if(tool==="pen"||tool==="pencil"){const pts=[...drawing,p];if(pts.length>1)add({id:uid(),name:tool==="pen"?"Path":"Pencil Path",kind:"path",x:0,y:0,width:0,height:0,rotation:0,fill:"none",stroke,strokeWidth,opacity:opacity/100,visible:true,points:pts})}
    setDrawing([]);
  };

  const addText=()=>add({id:uid(),name:"Text",kind:"text",x:300,y:500,width:300,height:70,rotation:0,fill,stroke:"none",strokeWidth:0,opacity:opacity/100,visible:true,text:"PICD Artwork",fontSize:58,fontFamily:"Inter, sans-serif"});
  const duplicate=()=>{if(!current)return;const n=clone(current);n.id=uid();n.name=current.name+" copy";n.x+=24;n.y+=24;add(n)};
  const bringFront=()=>{if(!selected)return;const i=doc.items.findIndex(x=>x.id===selected);if(i<0)return;const arr=[...doc.items];const [x]=arr.splice(i,1);arr.push(x);commit({...doc,items:arr})};
  const sendBack=()=>{if(!selected)return;const i=doc.items.findIndex(x=>x.id===selected);if(i<0)return;const arr=[...doc.items];const [x]=arr.splice(i,1);arr.unshift(x);commit({...doc,items:arr})};
  const importFile=(f:File)=>{const reader=new FileReader();reader.onload=async()=>{const src=String(reader.result);if(f.type.includes("svg")||f.name.toLowerCase().endsWith(".svg")){const vectors=importSVGAsVectors(src,f.name);if(vectors.length){commit({...doc,items:[...doc.items,...vectors]});setSelected(vectors[vectors.length-1].id);setStatus(`Imported ${vectors.length} SVG vectors`)}else{setStatus("SVG contains unsupported or complex elements")}}else{
    const img=await dataUrlToImage(src);
    // Import at the photo's own native pixel size — no scaling down to fit a
    // smaller box — and resize the artboard to match it, so the document,
    // the on-screen artboard, and every export all agree on one true size.
    const id=uid();
    commit({...doc,width:img.naturalWidth,height:img.naturalHeight,items:[...doc.items,{id,name:f.name,kind:"image",x:0,y:0,width:img.naturalWidth,height:img.naturalHeight,rotation:0,fill:"none",stroke:"none",strokeWidth:0,opacity:1,visible:true,href:src}]});
    setSelected(id);
    setStatus(`Image imported at native size (${img.naturalWidth} × ${img.naturalHeight}px) — artboard resized to match`);
  }};reader.readAsDataURL(f)};
  const exportSVG=()=>download("picd-artwork.svg",svgForDoc(doc));
  const exportPNG=async()=>{const src=svgForDoc(doc);const blob=new Blob([src],{type:"image/svg+xml"});const url=URL.createObjectURL(blob);const img=await dataUrlToImage(url);const c=document.createElement("canvas");c.width=doc.width;c.height=doc.height;c.getContext("2d")!.drawImage(img,0,0);URL.revokeObjectURL(url);c.toBlob(b=>{if(!b)return;const a=document.createElement("a");a.href=URL.createObjectURL(b);a.download="picd-artwork.png";a.click()},"image/png")};
  const saveProject=()=>download("picd-illustrator.picd",JSON.stringify(doc,null,2),"application/json");
  const openProject=(f:File)=>{const r=new FileReader();r.onload=()=>{try{const d=JSON.parse(String(r.result));if(d.items){commit(d);setStatus("Project opened")}}catch{setStatus("Invalid PICD project")}};r.readAsText(f)};
  const tracePNG=async(f:File)=>{const r=new FileReader();r.onload=async()=>{setStatus("Tracing PNG…");const svg=await rasterTrace(String(r.result));download(f.name.replace(/\.[^.]+$/,"")+"-trace.svg",svg);setStatus("Vector trace exported");setTraceMode(false)};r.readAsDataURL(f)};

  useEffect(()=>{
    const root=document.querySelector(".picd-theme-root") as HTMLElement|null;
    if(!root)return;
    const read=()=>{const v=getComputedStyle(root).getPropertyValue("--picd-page-accent").trim();if(v)setThemeAccent(v)};
    read();
    const observer=new MutationObserver(read); observer.observe(root,{attributes:true,attributeFilter:["style"]});
    return()=>observer.disconnect();
  },[]);
  useEffect(()=>{
    setFill(v=>v==="#2f80ed"||v==="#315f9f"?themeAccent:v);
    setStroke(v=>v==="#111827"?themeAccent:v);
    setDoc(d=>({...d,items:d.items.map(i=>{
      if(i.fill==="#2f80ed") return {...i,fill:themeAccent,stroke:themeAccent};
      if(typeof i.fill==="string" && i.fill.startsWith("color-mix(in srgb, #315f9f")) return {...i,fill:`color-mix(in srgb, ${themeAccent} 62%, #fff)`,stroke:themeAccent};
      if(i.stroke==="#1765c0") return {...i,stroke:themeAccent};
      return i;
    })}));
  },[themeAccent]);

  useEffect(()=>{const onKey=(e:KeyboardEvent)=>{if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==="z"){e.preventDefault();e.shiftKey?redo():undo()} else if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==="s"){e.preventDefault();exportSVG()} else if(e.key==="Delete"||e.key==="Backspace")remove(); else if(e.key.toLowerCase()==="v")setTool("select"); else if(e.key.toLowerCase()==="p")setTool("pen"); else if(e.key.toLowerCase()==="t")setTool("text")};window.addEventListener("keydown",onKey);return()=>window.removeEventListener("keydown",onKey)},[doc,history,future,selected]);

  const tools:[Tool,string,any,string][]=[ ["select","Selection",MousePointer2,"V"],["direct","Direct",Crosshair,"A"],["pen","Pen",PenTool,"P"],["pencil","Pencil",Pencil,"N"],["rect","Rectangle",Square,"M"],["ellipse","Ellipse",Circle,"L"],["line","Line",Minus,"\\"],["text","Type",Type,"T"],["hand","Hand",Hand,"H"] ];
  return <div className="ai-app">
    <header className="ai-topbar"><div className="ai-brand"><div className="ai-logo">P</div><div><strong>PICD Artwork</strong><span>Vector Workspace</span></div></div>
      <nav>{["File","Edit","Object","Type","Select","View","Window"].map(x=><button key={x}>{x}</button>)}</nav>
      <div className="ai-top-actions"><button onClick={()=>fileRef.current?.click()}><Upload size={14}/> Import</button><button onClick={saveProject}><Save size={14}/> Save</button><button className="ai-primary" onClick={exportSVG}><Download size={14}/> Export SVG</button></div>
    </header>
    <div className="ai-controlbar"><button onClick={()=>{setDialog({title:"Create a new artwork?",message:"This replaces the current artwork with a new document. Save the current project first if you need it.",tone:"danger",onConfirm:()=>{commit(defaultDoc(themeAccent));setSelected(null);setStatus("New document")}})}}><FilePlus2 size={14}/> New</button><button onClick={undo} disabled={!history.length}><Undo2 size={14}/></button><button onClick={redo} disabled={!future.length}><Redo2 size={14}/></button><span className="sep"/><label>Fill <input type="color" value={fill} onChange={e=>{setFill(e.target.value);if(current)update(current.id,{fill:e.target.value})}}/></label><label>Stroke <input type="color" value={stroke} onChange={e=>{setStroke(e.target.value);if(current)update(current.id,{stroke:e.target.value})}}/></label><label>W <input className="num" type="number" min="0" value={strokeWidth} onChange={e=>{const v=+e.target.value;setStrokeWidth(v);if(current)update(current.id,{strokeWidth:v})}}/></label><label>Opacity <input type="range" min="0" max="100" value={opacity} onChange={e=>{const v=+e.target.value;setOpacity(v);if(current)update(current.id,{opacity:v/100})}}/></label><div className="zoom"><button onClick={()=>setZoom(z=>Math.max(.25,z-.1))}><ZoomOut size={14}/></button><b>{Math.round(zoom*100)}%</b><button onClick={()=>setZoom(z=>Math.min(2,z+.1))}><ZoomIn size={14}/></button></div></div>
    <div className="ai-workspace">
      <aside className="ai-left"><div className="ai-panel-title">TOOLS</div><div className="ai-tool-grid">{tools.map(([id,label,Icon,key])=><button key={id} className={tool===id?"on":""} onClick={()=>id==="text"?addText():setTool(id)} title={`${label} (${key})`}><Icon size={19}/><span>{label}</span><small>{key}</small></button>)}</div><div className="ai-panel-title lower">OBJECT</div><div className="ai-side-actions"><button disabled={!selected} onClick={duplicate}><Copy size={14}/> Duplicate</button><button disabled={!selected} onClick={bringFront}>Bring Front</button><button disabled={!selected} onClick={sendBack}>Send Back</button><button disabled={!selected} onClick={()=>update(selected!,{rotation:(current?.rotation||0)+90})}><RotateCcw size={14}/> Rotate 90°</button><button disabled={!selected} onClick={()=>update(selected!,{width:current!.width,rotation:current!.rotation+0})}>Transform</button></div><div className="ai-panel-title lower">IMAGE TRACE</div><div className="traceBox"><p>Convert raster artwork into an SVG trace.</p><button onClick={()=>{setTraceMode(true);setStatus("Choose a PNG to trace")}}><Wand2 size={14}/> Trace PNG</button><button onClick={()=>{setStatus("Choose a PNG, then use Trace PNG")}} className="ghost">How it works</button></div></aside>
      <main className="ai-canvas" ref={workspaceRef}><div className="canvas-grid"><div className="artboard-label">ARTBOARD 01 · {doc.width} × {doc.height}</div><svg ref={svgRef} className="ai-svg" width={doc.width} height={doc.height} viewBox={`0 0 ${doc.width} ${doc.height}`} style={{width:doc.width*zoom,height:doc.height*zoom}} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerLeave={pointerUp}>
        <defs>{doc.items.filter(i=>i.gradient?.enabled).map(i=><linearGradient key={i.id} id={`g-${i.id}`} x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor={i.gradient?.from}/><stop offset="100%" stopColor={i.gradient?.to}/></linearGradient>)}</defs>
        <rect width={doc.width} height={doc.height} fill={doc.background}/>
        {doc.items.map(i=>{if(!i.visible)return null;const selectedNow=i.id===selected;const common={opacity:i.opacity}; if(i.kind==="rect")return <rect key={i.id} x={i.x} y={i.y} width={i.width} height={i.height} fill={i.gradient?.enabled?`url(#g-${i.id})`:i.fill} stroke={i.stroke} strokeWidth={i.strokeWidth} transform={`rotate(${i.rotation} ${i.x+i.width/2} ${i.y+i.height/2})`} {...common} onPointerDown={e=>{e.stopPropagation();setSelected(i.id)}}/>; if(i.kind==="ellipse")return <ellipse key={i.id} cx={i.x+i.width/2} cy={i.y+i.height/2} rx={i.width/2} ry={i.height/2} fill={i.fill} stroke={i.stroke} strokeWidth={i.strokeWidth} transform={`rotate(${i.rotation} ${i.x+i.width/2} ${i.y+i.height/2})`} {...common} onPointerDown={e=>{e.stopPropagation();setSelected(i.id)}}/>; if(i.kind==="line")return <line key={i.id} x1={i.points?.[0].x} y1={i.points?.[0].y} x2={i.points?.[1].x} y2={i.points?.[1].y} stroke={i.stroke} strokeWidth={i.strokeWidth} {...common} onPointerDown={e=>{e.stopPropagation();setSelected(i.id)}}/>; if(i.kind==="path")return <polyline key={i.id} points={(i.points||[]).map(p=>`${p.x},${p.y}`).join(" ")} fill="none" stroke={i.stroke} strokeWidth={i.strokeWidth} strokeLinecap="round" strokeLinejoin="round" {...common} onPointerDown={e=>{e.stopPropagation();setSelected(i.id)}}/>; if(i.kind==="text")return <text key={i.id} x={i.x} y={i.y+(i.fontSize||48)} fill={i.fill} fontFamily={i.fontFamily} fontSize={i.fontSize} opacity={i.opacity} transform={`rotate(${i.rotation} ${i.x} ${i.y})`} onPointerDown={e=>{e.stopPropagation();setSelected(i.id)}}>{i.text}</text>; if(i.kind==="image")return <image key={i.id} href={i.href} x={i.x} y={i.y} width={i.width} height={i.height} preserveAspectRatio="none" opacity={i.opacity} onPointerDown={e=>{e.stopPropagation();setSelected(i.id)}}/>;return null})}
        {current&&<g pointerEvents="none"><rect x={itemBounds(current).x-5} y={itemBounds(current).y-5} width={Math.max(10,itemBounds(current).width+10)} height={Math.max(10,itemBounds(current).height+10)} fill="none" stroke="var(--picd-page-accent, #315f9f)" strokeWidth={2/zoom} strokeDasharray={`${7/zoom} ${4/zoom}`}/></g>}
      </svg></div></main>
      <aside className="ai-right">
        <div className="ai-panel-title">LAYERS <button onClick={()=>add({id:uid(),name:"Rectangle",kind:"rect",x:100,y:100,width:160,height:100,rotation:0,fill,stroke,strokeWidth,opacity:1,visible:true})}><Plus size={14}/></button></div>
        <div className="ai-layers">
          {[...doc.items].reverse().map(i => (
            <div key={i.id} className={`ai-layer ${selected===i.id?"selected":""}`} onClick={()=>setSelected(i.id)}>
              <button onClick={e=>{e.stopPropagation();commit({...doc,items:doc.items.map(x=>x.id===i.id?{...x,visible:!x.visible}:x)})}}>{i.visible?<Eye size={14}/>:<EyeOff size={14}/>}</button>
              <span className="layer-kind">{i.kind.slice(0,1).toUpperCase()}</span>
              <div><b>{i.name}</b><small>{i.kind}</small></div>
            </div>
          ))}
        </div>
        <div className="ai-panel-title lower">PROPERTIES</div>
        {current ? (
          <div className="ai-props">
            <label>Name<input value={current.name} onChange={e=>update(current.id,{name:e.target.value})}/></label>
            <div className="prop-grid">
              <label>X<input type="number" value={Math.round(current.x)} onChange={e=>update(current.id,{x:+e.target.value})}/></label>
              <label>Y<input type="number" value={Math.round(current.y)} onChange={e=>update(current.id,{y:+e.target.value})}/></label>
              <label>W<input type="number" value={Math.round(current.width)} onChange={e=>update(current.id,{width:+e.target.value})}/></label>
              <label>H<input type="number" value={Math.round(current.height)} onChange={e=>update(current.id,{height:+e.target.value})}/></label>
            </div>
            <label>Rotation<input type="number" value={Math.round(current.rotation)} onChange={e=>update(current.id,{rotation:+e.target.value})}/></label>
            {current.kind==="text" && <>
              <label>Text<textarea value={current.text} onChange={e=>update(current.id,{text:e.target.value})}/></label>
              <label>Font size<input type="number" value={current.fontSize||48} onChange={e=>update(current.id,{fontSize:+e.target.value})}/></label>
            </>}
            <div className="prop-actions">
              <button onClick={()=>update(current.id,{rotation:current.rotation+90})}>Rotate</button>
              <button onClick={()=>update(current.id,{rotation:current.rotation+180})}>Flip</button>
              <button className="danger" onClick={remove}><Trash2 size={13}/> Delete</button>
            </div>
          </div>
        ) : <div className="ai-empty-props">Select an object to edit its vector properties.</div>}
        <div className="ai-panel-title lower">EXPORT</div>
        <div className="exportBox">
          <button onClick={exportSVG}><Download size={14}/> SVG</button>
          <button onClick={exportPNG}><Download size={14}/> PNG</button>
          <button onClick={saveProject}><Save size={14}/> PICD</button>
        </div>
      </aside>
    </div>
    <footer className="ai-status"><span className="green"/> {status}<span className="grow"/><span>{doc.items.length} objects</span><span>{doc.width} × {doc.height}</span><span>Vector mode</span></footer>
    <ConfirmModal open={!!dialog} alertMode={!dialog?.onConfirm} title={dialog?.title||"PICD Artwork"} message={dialog?.message||""} tone={dialog?.tone||"default"} confirmLabel="Confirm" onCancel={()=>setDialog(null)} onConfirm={()=>{const action=dialog?.onConfirm;setDialog(null);action?.();}} />
    <input ref={fileRef} type="file" hidden accept="image/png,image/jpeg,image/webp,image/svg+xml,.svg,.picd,.json" onChange={e=>{const f=e.target.files?.[0];if(!f)return;if(f.name.toLowerCase().endsWith(".picd")||f.name.toLowerCase().endsWith(".json"))openProject(f);else if(f.type.includes("png")&&traceMode)tracePNG(f);else importFile(f);e.currentTarget.value=""}}/>
  </div>;
}
