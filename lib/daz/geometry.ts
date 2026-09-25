import type { DsfNode, MeshData, MorphData, ParsedDaz, SkinData, UVSet, Vec3 } from "./types";
import { idRef } from "./refs";
import { collectFormulas } from "./formulas";

/** Extracts everything geometry-related from a parsed .dsf or from a .duf that embeds assets. */
export function parseDaz(daz: any): ParsedDaz {
  const out: ParsedDaz = { geometries: [], skins: [], morphs: [], uvSets: [], nodes: [], formulas: collectFormulas(daz) };

  for (const g of daz?.geometry_library ?? []) {
    const mesh = parseGeometry(g);
    if (mesh) out.geometries.push(mesh);
  }

  for (const m of daz?.modifier_library ?? []) {
    if (m?.skin) out.skins.push(parseSkin(m));
    if (m?.morph?.deltas?.values) out.morphs.push(parseMorph(m));
  }

  for (const n of daz?.node_library ?? []) out.nodes.push(parseNode(n));

  for (const u of daz?.uv_set_library ?? []) {
    const uv = parseUVSet(u);
    if (uv) out.uvSets.push(uv);
  }
  return out;
}

function parseGeometry(g: any): MeshData | null {
  const verts: number[][] | undefined = g?.vertices?.values;
  const polys: number[][] | undefined = g?.polylist?.values;
  if (!verts || !polys) return null;

  const vertexCount = verts.length;
  const basePositions = new Float32Array(vertexCount * 3);
  for (let i = 0; i < vertexCount; i++) {
    basePositions[i * 3] = verts[i][0];
    basePositions[i * 3 + 1] = verts[i][1];
    basePositions[i * 3 + 2] = verts[i][2];
  }

  let triCount = 0;
  for (const p of polys) triCount += Math.max(0, p.length - 2 - 2);
  const cornerVertex = new Uint32Array(triCount * 3);
  const triPolygon = new Uint32Array(triCount);
  const triMaterial = new Uint16Array(triCount);

  let t = 0;
  for (let pi = 0; pi < polys.length; pi++) {
    const p = polys[pi];
    const mat = p[1];
    const n = p.length - 2;
    for (let k = 1; k < n - 1; k++) {
      cornerVertex[t * 3] = p[2];
      cornerVertex[t * 3 + 1] = p[2 + k];
      cornerVertex[t * 3 + 2] = p[2 + k + 1];
      triPolygon[t] = pi;
      triMaterial[t] = mat;
      t++;
    }
  }

  return {
    id: g.id,
    name: g.name ?? g.id,
    vertexCount,
    basePositions,
    cornerVertex,
    triPolygon,
    triMaterial,
    materialNames: g.polygon_material_groups?.values ?? [],
    groupNames: g.polygon_groups?.values ?? [],
  };
}

function channelVec(arr: any): Vec3 {
  const out: Vec3 = [0, 0, 0];
  if (Array.isArray(arr)) {
    for (const c of arr) {
      const i = "xyz".indexOf(c?.id);
      const v = c?.current_value ?? c?.value;
      if (i >= 0 && typeof v === "number") out[i] = v;
    }
  }
  return out;
}

function parseNode(n: any): DsfNode {
  return {
    id: n.id,
    name: n.name ?? n.id,
    parent: idRef(n.parent),
    center: channelVec(n.center_point),
    end: channelVec(n.end_point),
    orientation: channelVec(n.orientation),
    rotationOrder: n.rotation_order ?? "XYZ",
  };
}

function parseSkin(m: any): SkinData {
  const joints = [];
  for (const j of m.skin.joints ?? []) {
    const vals: number[][] | undefined = j.node_weights?.values;
    if (!vals || vals.length === 0) continue;
    const vertices = new Uint32Array(vals.length);
    const weights = new Float32Array(vals.length);
    for (let i = 0; i < vals.length; i++) {
      vertices[i] = vals[i][0];
      weights[i] = vals[i][1];
    }
    joints.push({ node: idRef(j.node) ?? j.id, vertices, weights });
  }
  return { geometryId: idRef(m.skin.geometry), joints };
}

function parseMorph(m: any): MorphData {
  const vals: number[][] = m.morph.deltas.values;
  const indices = new Uint32Array(vals.length);
  const deltas = new Float32Array(vals.length * 3);
  for (let i = 0; i < vals.length; i++) {
    indices[i] = vals[i][0];
    deltas[i * 3] = vals[i][1];
    deltas[i * 3 + 1] = vals[i][2];
    deltas[i * 3 + 2] = vals[i][3];
  }
  return { id: m.id, name: m.name ?? m.id, vertexCount: Number(m.morph.vertex_count) || 0, indices, deltas };
}

function parseUVSet(u: any): UVSet | null {
  const vals: number[][] | undefined = u?.uvs?.values;
  if (!vals) return null;
  const uvs = new Float32Array(vals.length * 2);
  for (let i = 0; i < vals.length; i++) {
    uvs[i * 2] = vals[i][0];
    uvs[i * 2 + 1] = vals[i][1];
  }
  const vertexCount = Number(u.vertex_count) || 0;
  const overrides = new Map<number, number>();
  for (const e of u.polygon_vertex_indices ?? []) {
    overrides.set(e[0] * Math.max(vertexCount, 1) + e[1], e[2]);
  }
  return { id: u.id, name: u.name ?? u.id, uvs, overrides, vertexCount };
}

/** One UV pair per triangle corner. Falls back to (0,0) if the set doesn't cover a vertex. */
export function buildCornerUVs(mesh: MeshData, uv: UVSet): Float32Array {
  const corners = mesh.cornerVertex.length;
  const out = new Float32Array(corners * 2);
  const stride = Math.max(uv.vertexCount, 1);
  for (let c = 0; c < corners; c++) {
    const v = mesh.cornerVertex[c];
    const poly = mesh.triPolygon[(c / 3) | 0];
    const idx = uv.overrides.get(poly * stride + v) ?? v;
    out[c * 2] = uv.uvs[idx * 2] ?? 0;
    out[c * 2 + 1] = uv.uvs[idx * 2 + 1] ?? 0;
  }
  return out;
}

/** Smooth per-vertex normals from the triangle corners. */
export function computeSmoothNormals(positions: Float32Array, mesh: MeshData): Float32Array {
  const n = new Float32Array(mesh.vertexCount * 3);
  const cv = mesh.cornerVertex;
  for (let t = 0; t < cv.length; t += 3) {
    const a = cv[t] * 3, b = cv[t + 1] * 3, c = cv[t + 2] * 3;
    const ux = positions[b] - positions[a], uy = positions[b + 1] - positions[a + 1], uz = positions[b + 2] - positions[a + 2];
    const vx = positions[c] - positions[a], vy = positions[c + 1] - positions[a + 1], vz = positions[c + 2] - positions[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const i of [a, b, c]) {
      n[i] += nx; n[i + 1] += ny; n[i + 2] += nz;
    }
  }
  for (let i = 0; i < n.length; i += 3) {
    const l = Math.hypot(n[i], n[i + 1], n[i + 2]) || 1;
    n[i] /= l; n[i + 1] /= l; n[i + 2] /= l;
  }
  return n;
}

/** Top-4 influences per source vertex, normalised. `boneIndex` returns -1 for unknown joints. */
export function buildSkinAttributes(
  vertexCount: number,
  skin: SkinData,
  boneIndex: (node: string) => number,
): { indices: Uint16Array; weights: Float32Array; skinnedVertices: number } {
  const indices = new Uint16Array(vertexCount * 4);
  const weights = new Float32Array(vertexCount * 4);
  for (const j of skin.joints) {
    const bi = boneIndex(j.node);
    if (bi < 0) continue;
    for (let i = 0; i < j.vertices.length; i++) {
      const v = j.vertices[i];
      if (v >= vertexCount) continue;
      const w = j.weights[i];
      if (w <= 0) continue;
      const o = v * 4;
      let slot = 0;
      for (let s = 1; s < 4; s++) if (weights[o + s] < weights[o + slot]) slot = s;
      if (w > weights[o + slot]) {
        weights[o + slot] = w;
        indices[o + slot] = bi;
      }
    }
  }
  let skinnedVertices = 0;
  for (let v = 0; v < vertexCount; v++) {
    const o = v * 4;
    const sum = weights[o] + weights[o + 1] + weights[o + 2] + weights[o + 3];
    if (sum > 0) {
      skinnedVertices++;
      for (let s = 0; s < 4; s++) weights[o + s] /= sum;
    }
  }
  return { indices, weights, skinnedVertices };
}

/** base + sum(value * delta) for every active morph. */
export function applyMorphs(
  mesh: MeshData,
  active: { data: MorphData; value: number }[],
  target: Float32Array,
): void {
  target.set(mesh.basePositions);
  for (const { data, value } of active) {
    if (!value) continue;
    for (let i = 0; i < data.indices.length; i++) {
      const v = data.indices[i];
      if (v >= mesh.vertexCount) continue;
      target[v * 3] += data.deltas[i * 3] * value;
      target[v * 3 + 1] += data.deltas[i * 3 + 1] * value;
      target[v * 3 + 2] += data.deltas[i * 3 + 2] * value;
    }
  }
}
