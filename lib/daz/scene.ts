import type {
  BoneModel,
  FigureModel,
  GeometryRef,
  MaterialModel,
  MorphModel,
  SceneModel,
  Vec3,
} from "./types";
import { fileOf, fragmentOf, idRef, baseName } from "./refs";

const num = (v: unknown, d = 0): number =>
  typeof v === "number" && Number.isFinite(v) ? v : d;

/** Reads an array of {id:"x"|"y"|"z", current_value|value} channels. */
function vec3(arr: any, def: Vec3): Vec3 {
  const out: Vec3 = [def[0], def[1], def[2]];
  if (Array.isArray(arr)) {
    for (const c of arr) {
      const i = "xyz".indexOf(c?.id);
      if (i >= 0) out[i] = num(c.current_value ?? c.value, def[i]);
    }
  }
  return out;
}

function point3(p: unknown): Vec3 {
  return Array.isArray(p) && p.length >= 3
    ? [num(p[0]), num(p[1]), num(p[2])]
    : [0, 0, 0];
}

const FACE_ROOTS = new Set(["upperFaceRig", "lowerFaceRig", "lowerJaw", "upperTeeth", "lowerTeeth"]);
const FINGER_TOE = /^[lr](Thumb|Index|Mid|Ring|Pinky|Carpal|SmallToe|BigToe|Toe|Metatarsals)/;

export function buildSceneModel(daz: any, fileName: string): SceneModel {
  const scene = daz?.scene ?? {};
  const nodes: any[] = Array.isArray(scene.nodes) ? scene.nodes : [];
  const byId = new Map<string, any>(nodes.map((n) => [n.id, n]));

  const parentOf = (n: any): any | null => {
    const pid = idRef(n.parent);
    return pid ? byId.get(pid) ?? null : null;
  };

  /* figures: nodes that carry geometry */
  const figures: FigureModel[] = [];
  for (const n of nodes) {
    if (!Array.isArray(n.geometries) || n.geometries.length === 0) continue;
    const geometries: GeometryRef[] = n.geometries.map((g: any) => ({
      id: g.id,
      url: g.url ?? "",
      file: fileOf(g.url),
      name: g.name ?? g.id,
      type: g.type ?? "polygon_mesh",
      subdivisionLevel: num(g.current_subdivision_level, 0),
    }));
    const box = n.preview?.oriented_box;
    figures.push({
      id: n.id,
      label: n.label ?? n.name ?? n.id,
      url: n.url ?? "",
      conformTarget: idRef(n.conform_target),
      geometries,
      translation: vec3(n.translation, [0, 0, 0]),
      rotation: vec3(n.rotation, [0, 0, 0]),
      rotationOrder: n.preview?.rotation_order ?? "XYZ",
      scale: num(n.general_scale?.current_value ?? n.general_scale?.value, 1) || 1,
      boxMin: box ? point3(box.min) : null,
      boxMax: box ? point3(box.max) : null,
    });
  }
  const figureIds = new Set(figures.map((f) => f.id));

  const figureOf = (n: any): string | null => {
    let cur: any = n;
    for (let i = 0; i < 512 && cur; i++) {
      if (figureIds.has(cur.id)) return cur.id;
      cur = parentOf(cur);
    }
    return null;
  };

  const isDetail = (n: any): boolean => {
    if (FINGER_TOE.test(n.name ?? n.id)) return true;
    let cur: any = n;
    for (let i = 0; i < 512 && cur; i++) {
      if (FACE_ROOTS.has(cur.name ?? cur.id) && cur !== n) return true;
      if (FACE_ROOTS.has(n.name ?? n.id)) return true;
      cur = parentOf(cur);
    }
    return false;
  };

  /* bones */
  const bones: BoneModel[] = [];
  let helperNodeCount = 0;
  for (const n of nodes) {
    if (figureIds.has(n.id)) continue;
    if (n.preview?.type !== "bone") {
      helperNodeCount++;
      continue;
    }
    const figId = figureOf(n);
    if (!figId) continue;
    bones.push({
      id: n.id,
      name: n.name ?? n.id,
      label: n.label ?? n.name ?? n.id,
      parentId: idRef(n.parent),
      figureId: figId,
      dsfKey: fragmentOf(n.url) || n.name || n.id,
      center: point3(n.preview.center_point),
      end: point3(n.preview.end_point),
      rotationOrder: n.preview.rotation_order ?? "XYZ",
      rotation: vec3(n.rotation, [0, 0, 0]),
      translation: vec3(n.translation, [0, 0, 0]),
      detail: isDetail(n),
    });
  }

  /* morphs (modifiers that carry a channel) */
  const morphs: MorphModel[] = [];
  for (const m of scene.modifiers ?? []) {
    if (!m?.channel) continue;
    const ch = m.channel;
    morphs.push({
      id: m.id,
      label: m.id,
      value: num(ch.current_value ?? ch.value, 0),
      region: m.region ?? "",
      group: m.group ?? "",
      url: m.url ?? "",
      file: fileOf(m.url),
      geometryId: idRef(m.parent),
    });
  }

  /* materials */
  const materials: MaterialModel[] = [];
  for (const m of scene.materials ?? []) {
    const ch = m.diffuse?.channel ?? {};
    const color = ch.current_value ?? ch.value ?? [1, 1, 1];
    const maps: { channel: string; file: string }[] = [];
    for (const e of m.extra ?? []) {
      if (e?.type !== "studio_material_channels") continue;
      for (const c of e.channels ?? []) {
        const cc = c.channel;
        if (cc?.image_file) maps.push({ channel: cc.id, file: cc.image_file });
      }
    }
    const shaderExtra = (m.extra ?? []).find((e: any) => typeof e?.type === "string" && e.type.startsWith("studio/material/"));
    materials.push({
      id: m.id,
      name: fragmentOf(m.url) || m.id,
      geometryId: idRef(m.geometry),
      groups: Array.isArray(m.groups) ? m.groups : [],
      color: point3(color),
      diffuseMap: ch.image_file ?? null,
      opacity: num(m.opacity?.channel?.current_value ?? m.opacity?.channel?.value, 1),
      uvSetUrl: m.uv_set ?? null,
      shader: shaderExtra ? String(shaderExtra.type).replace("studio/material/", "") : "default",
      maps,
    });
  }

  /* textures */
  const textures = new Set<string>();
  for (const img of daz?.image_library ?? []) {
    for (const mp of img.map ?? []) if (mp.url) textures.add(mp.url);
  }
  for (const m of materials) {
    if (m.diffuseMap) textures.add(m.diffuseMap);
    for (const mp of m.maps) textures.add(mp.file);
  }

  const settings = (scene.extra ?? []).find((e: any) => e?.type === "studio_scene_settings");
  const info = daz?.asset_info ?? {};

  return {
    title: baseName(String(info.id ?? fileName)) || fileName,
    fileName,
    fileVersion: String(daz?.file_version ?? ""),
    author: info.contributor?.author ?? "",
    modified: info.modified ?? "",
    figures,
    bones,
    morphs,
    materials,
    helperNodeCount,
    nodeCount: nodes.length,
    textures: [...textures],
    background: point3(settings?.background_color ?? [0.2, 0.22, 0.26]),
    fps: num(settings?.animation_settings?.current_frames_per_second, 30),
  };
}
