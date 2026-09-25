export type Vec3 = [number, number, number];

/** A bone as described by a DUF scene node. */
export interface BoneModel {
  id: string;
  name: string;
  label: string;
  parentId: string | null;
  figureId: string;
  /** Node id inside the source .dsf (the fragment after `#` in the node url). */
  dsfKey: string;
  /** Rest-pose joint position in DAZ world space (cm). */
  center: Vec3;
  /** Rest-pose end point in DAZ world space (cm). */
  end: Vec3;
  rotationOrder: string;
  /** Pose rotation in degrees, as stored in the scene. */
  rotation: Vec3;
  translation: Vec3;
  /** True for fingers, toes and face rig bones. */
  detail: boolean;
}

export interface GeometryRef {
  id: string;
  url: string;
  file: string;
  name: string;
  type: string;
  subdivisionLevel: number;
}

export interface FigureModel {
  id: string;
  label: string;
  url: string;
  conformTarget: string | null;
  geometries: GeometryRef[];
  translation: Vec3;
  rotation: Vec3;
  rotationOrder: string;
  scale: number;
  boxMin: Vec3 | null;
  boxMax: Vec3 | null;
}

export interface MorphModel {
  id: string;
  label: string;
  value: number;
  region: string;
  group: string;
  url: string;
  file: string;
  geometryId: string | null;
}

export interface MaterialChannelMap {
  channel: string;
  file: string;
}

export interface MaterialModel {
  id: string;
  name: string;
  geometryId: string | null;
  groups: string[];
  color: Vec3;
  diffuseMap: string | null;
  opacity: number;
  uvSetUrl: string | null;
  shader: string;
  maps: MaterialChannelMap[];
}

export interface SceneModel {
  title: string;
  fileName: string;
  fileVersion: string;
  author: string;
  modified: string;
  figures: FigureModel[];
  bones: BoneModel[];
  morphs: MorphModel[];
  materials: MaterialModel[];
  /** Nodes without a viewport preview, e.g. measurement followers. */
  helperNodeCount: number;
  nodeCount: number;
  textures: string[];
  background: Vec3;
  fps: number;
}

/* ---------- geometry ---------- */

export interface MeshData {
  id: string;
  name: string;
  vertexCount: number;
  /** xyz per source vertex, in cm */
  basePositions: Float32Array;
  /** source vertex index for each triangle corner (3 per triangle) */
  cornerVertex: Uint32Array;
  /** source polygon index for each triangle */
  triPolygon: Uint32Array;
  /** material group index per triangle */
  triMaterial: Uint16Array;
  materialNames: string[];
  groupNames: string[];
}

export interface SkinJoint {
  node: string;
  vertices: Uint32Array;
  weights: Float32Array;
}

export interface SkinData {
  geometryId: string | null;
  joints: SkinJoint[];
}

export interface MorphData {
  id: string;
  name: string;
  /** vertex count of the mesh this morph was authored for */
  vertexCount: number;
  indices: Uint32Array;
  /** xyz per index */
  deltas: Float32Array;
}

export interface UVSet {
  id: string;
  name: string;
  uvs: Float32Array;
  /** polygon * vertexCount + vertex -> uv index, for seams */
  overrides: Map<number, number>;
  vertexCount: number;
}

/* ---------- formulas (DSON "formulas": drivers between channels) ---------- */

export interface ChannelRef {
  /** optional "name:" scope prefix */
  name: string | null;
  /** asset file the channel lives in, empty when local */
  file: string;
  /** node or modifier id */
  id: string;
  /** e.g. "value", "rotation/x", "center_point/y" */
  channel: string;
}

export type FormulaOp =
  | { op: "push"; ref: ChannelRef }
  | { op: "push"; val: number }
  | { op: "add" | "sub" | "mult" | "div" };

export interface Formula {
  output: ChannelRef;
  stage: "sum" | "mult";
  ops: FormulaOp[];
  /** true when the formula uses an operation this viewer can't evaluate (e.g. splines) */
  unsupported: boolean;
}

/** A node (bone) definition inside a .dsf figure file. */
export interface DsfNode {
  id: string;
  name: string;
  parent: string | null;
  center: Vec3;
  end: Vec3;
  orientation: Vec3;
  rotationOrder: string;
}

export interface ParsedDaz {
  geometries: MeshData[];
  skins: SkinData[];
  morphs: MorphData[];
  uvSets: UVSet[];
  nodes: DsfNode[];
  formulas: Formula[];
}
