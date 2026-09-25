import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type {
  BoneModel,
  FigureModel,
  MaterialModel,
  MeshData,
  MorphData,
  SceneModel,
  SkinData,
  UVSet,
  Vec3,
} from "../daz/types";
import { applyMorphs, buildCornerUVs, buildSkinAttributes, computeSmoothNormals } from "../daz/geometry";
import { baseName } from "../daz/refs";

const CM = 0.01; // DAZ works in centimetres, the viewport in metres
const D2R = Math.PI / 180;
const EULER_ORDERS = new Set(["XYZ", "XZY", "YXZ", "YZX", "ZXY", "ZYX"]);

export interface ViewOptions {
  skeleton: boolean;
  mesh: boolean;
  wireframe: boolean;
  grid: boolean;
  /** show fingers, toes and face-rig joints */
  detail: boolean;
  /** draw the skeleton over the mesh */
  xray: boolean;
  /** DAZ rotation direction (see README) */
  invertRotation: boolean;
}

export const DEFAULT_VIEW: ViewOptions = {
  skeleton: true,
  mesh: true,
  wireframe: false,
  grid: true,
  detail: false,
  xray: true,
  invertRotation: true,
};

export interface EngineStats {
  bones: number;
  meshes: number;
  triangles: number;
  skinnedVertices: number;
}

interface MeshRuntime {
  key: string;
  data: MeshData;
  object: THREE.Mesh;
  materials: THREE.Material[];
  /** corner -> source vertex, in the material-sorted order the geometry uses */
  sortedCorners: Uint32Array;
  vertexPositions: Float32Array;
  morphs: { data: MorphData; value: number; morphId: string }[];
  skinnedVertices: number;
}

interface FigureRuntime {
  model: FigureModel;
  root: THREE.Group;
  boneModels: Map<string, BoneModel>;
  bones: Map<string, THREE.Bone>;
  boneList: THREE.Bone[];
  skeleton: THREE.Skeleton | null;
  meshes: Map<string, MeshRuntime>;
}

export interface AttachOptions {
  skin?: SkinData;
  uvSet?: UVSet;
  materialModels: MaterialModel[];
  resolveTexture: (url: string) => string | undefined;
}

const TRANSLUCENT = /^(EyeMoisture|Cornea|Tear)/i;
const DOUBLE_SIDED = /^(Eyelashes|EyeMoisture|Cornea|Tear|Sclera|EyeSocket|Irises|Pupils|Mouth|Teeth)/i;

export class ViewerEngine {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;
  private stage = new THREE.Group();
  private grid: THREE.GridHelper;
  private figures = new Map<string, FigureRuntime>();
  private joints = new Map<string, THREE.Mesh>();
  private lines = new Map<string, THREE.LineSegments>();
  private boneModels = new Map<string, BoneModel>();
  private sceneBones: BoneModel[] = [];
  private pose = new Map<string, Vec3>();
  private drivenRotation = new Map<string, Vec3>();
  private jointOffsets = new Map<string, Vec3>();
  private endOffsetsForTips = new Map<string, Vec3>();
  private baseLocalPos = new Map<string, THREE.Vector3>();
  private opts: ViewOptions = { ...DEFAULT_VIEW };
  private selectedId: string | null = null;
  private dirty = true;
  private morphDirty = false;
  private raf = 0;
  private ro: ResizeObserver;
  private disposed = false;
  private loader = new THREE.TextureLoader();

  private sphere = new THREE.SphereGeometry(1, 14, 10);
  private jointMat = new THREE.MeshBasicMaterial({ color: 0x67d1d9, transparent: true, depthTest: false });
  private selectedMat = new THREE.MeshBasicMaterial({ color: 0xffb443, transparent: true, depthTest: false });
  private lineMat = new THREE.LineBasicMaterial({ color: 0x67d1d9, transparent: true, opacity: 0.85, depthTest: false });

  onPick: (boneId: string | null) => void = () => {};
  onChange: () => void = () => {};

  constructor(private host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0x000000, 0);
    host.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.display = "block";

    this.camera = new THREE.PerspectiveCamera(32, 1, 0.05, 200);
    this.camera.position.set(0, 1.1, 4.2);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.12;
    this.controls.target.set(0, 0.9, 0);
    this.controls.addEventListener("change", () => this.invalidate());

    this.stage.scale.setScalar(CM);
    this.scene.add(this.stage);

    this.grid = new THREE.GridHelper(6, 60, 0x6b7382, 0x4a5160);
    (this.grid.material as THREE.Material).transparent = true;
    (this.grid.material as THREE.Material).opacity = 0.5;
    this.scene.add(this.grid);

    this.scene.add(new THREE.HemisphereLight(0xe6ecff, 0x39404d, 1.1));
    const key = new THREE.DirectionalLight(0xffffff, 2.4);
    key.position.set(2.5, 4, 3);
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0xbfd2ff, 0.8);
    fill.position.set(-3, 1.5, -2);
    this.scene.add(fill);

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    this.resize();
    this.bindPointer();
    this.loop();
  }

  /* ------------------------------------------------------------ lifecycle */

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.controls.dispose();
    this.clearStage();
    this.sphere.dispose();
    this.jointMat.dispose();
    this.selectedMat.dispose();
    this.lineMat.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  invalidate(): void {
    this.dirty = true;
  }

  private resize(): void {
    const w = Math.max(this.host.clientWidth, 1);
    const h = Math.max(this.host.clientHeight, 1);
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = "100%";
    this.renderer.domElement.style.height = "100%";
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.invalidate();
  }

  private loop = (): void => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    this.controls.update();
    if (this.morphDirty) {
      this.morphDirty = false;
      for (const f of this.figures.values()) for (const m of f.meshes.values()) this.refreshMesh(m);
      this.dirty = true;
    }
    if (this.dirty) {
      this.dirty = false;
      this.renderer.render(this.scene, this.camera);
    }
  };

  screenshot(): string {
    this.renderer.render(this.scene, this.camera);
    return this.renderer.domElement.toDataURL("image/png");
  }

  /* ---------------------------------------------------------------- scene */

  private clearStage(): void {
    for (const f of this.figures.values()) {
      for (const m of f.meshes.values()) this.disposeMesh(m);
    }
    for (const j of this.joints.values()) j.removeFromParent();
    for (const l of this.lines.values()) {
      l.geometry.dispose();
      l.removeFromParent();
    }
    for (const f of this.figures.values()) f.root.removeFromParent();
    this.figures.clear();
    this.joints.clear();
    this.lines.clear();
    this.boneModels.clear();
    this.baseLocalPos.clear();
    this.jointOffsets.clear();
    this.drivenRotation.clear();
    this.selectedId = null;
  }

  /** Rebuilds figures and skeletons from a parsed scene. Meshes are attached separately. */
  setScene(model: SceneModel, pose: Record<string, Vec3>): void {
    this.clearStage();
    this.sceneBones = model.bones;
    this.pose = new Map(Object.entries(pose));

    for (const fig of model.figures) {
      const root = new THREE.Group();
      root.name = fig.id;
      root.position.set(...fig.translation);
      root.scale.setScalar(fig.scale);
      this.stage.add(root);
      this.figures.set(fig.id, {
        model: fig,
        root,
        boneModels: new Map(),
        bones: new Map(),
        boneList: [],
        skeleton: null,
        meshes: new Map(),
      });
    }

    // skeletons only for figures that own their rig (conformed items borrow it)
    for (const fig of this.figures.values()) {
      if (fig.model.conformTarget) continue;
      this.buildSkeleton(fig, model.bones.filter((b) => b.figureId === fig.model.id));
    }

    this.stage.updateMatrixWorld(true);
    for (const fig of this.figures.values()) {
      if (fig.boneList.length) fig.skeleton = new THREE.Skeleton(fig.boneList);
    }
    this.applyAllPose();
    this.applyVisibility();
    this.frame();
    this.onChange();
  }

  private buildSkeleton(fig: FigureRuntime, bones: BoneModel[]): void {
    for (const b of bones) fig.boneModels.set(b.id, b);

    const hasChild = new Set<string>();
    for (const b of bones) if (b.parentId && fig.boneModels.has(b.parentId)) hasChild.add(b.parentId);

    const make = (b: BoneModel): void => {
      if (fig.bones.has(b.id)) return;
      const parentModel = b.parentId ? fig.boneModels.get(b.parentId) : undefined;
      if (parentModel) make(parentModel);
      const parentObj: THREE.Object3D = parentModel ? fig.bones.get(parentModel.id)! : fig.root;
      const pc: Vec3 = parentModel ? parentModel.center : [0, 0, 0];

      const bone = new THREE.Bone();
      bone.name = b.id;
      bone.position.set(
        b.center[0] - pc[0] + b.translation[0],
        b.center[1] - pc[1] + b.translation[1],
        b.center[2] - pc[2] + b.translation[2],
      );
      parentObj.add(bone);
      fig.bones.set(b.id, bone);
      fig.boneList.push(bone);
      this.boneModels.set(b.id, b);
      this.baseLocalPos.set(b.id, bone.position.clone());

      const joint = new THREE.Mesh(this.sphere, this.jointMat);
      joint.scale.setScalar(b.detail ? 0.45 : 0.95);
      joint.renderOrder = 20;
      joint.userData.boneId = b.id;
      bone.add(joint);
      this.joints.set(b.id, joint);

      // segment from the parent joint to this joint, drawn in the parent's frame
      if (parentModel) {
        const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), bone.position.clone()]);
        const line = new THREE.LineSegments(g, this.lineMat);
        line.renderOrder = 19;
        parentObj.add(line);
        this.lines.set(b.id, line);
      }
    };
    for (const b of bones) make(b);

    // tip segments for leaf bones
    for (const b of bones) {
      if (hasChild.has(b.id)) continue;
      const d = new THREE.Vector3(b.end[0] - b.center[0], b.end[1] - b.center[1], b.end[2] - b.center[2]);
      if (d.lengthSq() < 1e-6) continue;
      const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), d]);
      const line = new THREE.LineSegments(g, this.lineMat);
      line.renderOrder = 19;
      line.userData.tipOf = b.id;
      fig.bones.get(b.id)!.add(line);
      this.lines.set(`${b.id}#tip`, line);
    }
  }

  /* ----------------------------------------------------------------- pose */

  setPose(pose: Record<string, Vec3>): void {
    this.pose = new Map(Object.entries(pose));
    this.applyAllPose();
  }

  setBoneRotation(boneId: string, rot: Vec3): void {
    this.pose.set(boneId, rot);
    this.applyBone(boneId);
    this.invalidate();
  }

  private applyAllPose(): void {
    for (const id of this.boneModels.keys()) this.applyBone(id);
    this.invalidate();
  }

  private applyBone(id: string): void {
    const bm = this.boneModels.get(id);
    if (!bm) return;
    const base = this.pose.get(id) ?? [0, 0, 0];
    const drive = this.drivenRotation.get(id);
    const rot: Vec3 = drive ? [base[0] + drive[0], base[1] + drive[1], base[2] + drive[2]] : base;
    const s = (this.opts.invertRotation ? -1 : 1) * D2R;
    // DAZ applies rotations in the order named (e.g. "YZX" = Y first, then Z, then X);
    // three.js Euler orders are intrinsic, so the string is reversed.
    const order = bm.rotationOrder.split("").reverse().join("").toUpperCase();
    const euler = new THREE.Euler(rot[0] * s, rot[1] * s, rot[2] * s, (EULER_ORDERS.has(order) ? order : "ZYX") as THREE.EulerOrder);
    for (const f of this.figures.values()) {
      const bone = f.bones.get(id);
      if (bone) bone.quaternion.setFromEuler(euler);
    }
  }

  /**
   * Applies how shape morphs move joints (e.g. a height morph lengthening the spine). Offsets are
   * in the same DAZ-space units as the rest-pose joint centers, relative to how the .duf was saved.
   */
  setJointOffsets(centers: Map<string, Vec3>, ends: Map<string, Vec3>): void {
    const moved = [...centers.values()].some((v) => v.some((x) => Math.abs(x) > 1e-6));
    if (!moved && this.jointOffsets.size === 0) return; // nothing to do, and nothing to undo
    this.jointOffsets = centers;
    this.endOffsetsForTips = ends;
    for (const id of this.boneModels.keys()) this.applyJointOffset(id);
    this.rebindRest();
    this.invalidate();
  }

  private applyJointOffset(id: string): void {
    const base = this.baseLocalPos.get(id);
    if (!base) return;
    const bm = this.boneModels.get(id);
    const own = this.jointOffsets.get(id) ?? [0, 0, 0];
    const parentOff = (bm?.parentId && this.jointOffsets.get(bm.parentId)) || [0, 0, 0];
    const delta = new THREE.Vector3(own[0] - parentOff[0], own[1] - parentOff[1], own[2] - parentOff[2]);
    for (const f of this.figures.values()) {
      const bone = f.bones.get(id);
      if (!bone) continue;
      bone.position.copy(base).add(delta);
      const line = this.lines.get(id);
      if (line) line.geometry.setFromPoints([new THREE.Vector3(), bone.position.clone()]);
    }
  }

  /**
   * After joints move, the skin has to be bound to the new rest pose. Otherwise every vertex is
   * dragged by how far its joint moved, which shows up as bulging eyes and warped hands.
   */
  private rebindRest(): void {
    for (const f of this.figures.values()) {
      if (!f.skeleton) continue;
      const saved = f.boneList.map((b) => b.quaternion.clone());
      for (const b of f.boneList) b.quaternion.identity();
      f.root.updateMatrixWorld(true);
      f.skeleton.calculateInverses();
      f.boneList.forEach((b, i) => b.quaternion.copy(saved[i]));
    }
  }

  setDrivenRotation(rotations: Map<string, Vec3>): void {
    const touched = new Set([...this.drivenRotation.keys(), ...rotations.keys()]);
    this.drivenRotation = rotations;
    for (const id of touched) this.applyBone(id);
    this.invalidate();
  }

  /* --------------------------------------------------------------- meshes */

  /* --------------------------------------------------------------- meshes */

  /**
   * Adds (or replaces) a mesh for a figure. Conformed figures (eyelashes, tears, clothes)
   * are skinned to the skeleton of the figure they conform to.
   */
  attachMesh(figureId: string, data: MeshData, opt: AttachOptions): { skinnedVertices: number } {
    const owner = this.figures.get(figureId);
    if (!owner) return { skinnedVertices: 0 };
    const host = this.rigOwner(owner);
    const key = `${figureId}:${data.id}`;
    const old = owner.meshes.get(key);
    if (old) {
      this.disposeMesh(old);
      owner.meshes.delete(key);
    }

    const triCount = data.triMaterial.length;
    const corners = triCount * 3;
    const matCount = Math.max(data.materialNames.length, 1);

    // sort triangles by material so each material is one contiguous draw group
    const counts = new Uint32Array(matCount);
    for (let t = 0; t < triCount; t++) counts[Math.min(data.triMaterial[t], matCount - 1)]++;
    const starts = new Uint32Array(matCount);
    for (let m = 1; m < matCount; m++) starts[m] = starts[m - 1] + counts[m - 1];
    const cursor = starts.slice();
    const dest = new Uint32Array(triCount);
    const sortedCorners = new Uint32Array(corners);
    for (let t = 0; t < triCount; t++) {
      const d = cursor[Math.min(data.triMaterial[t], matCount - 1)]++;
      dest[t] = d;
      sortedCorners[d * 3] = data.cornerVertex[t * 3];
      sortedCorners[d * 3 + 1] = data.cornerVertex[t * 3 + 1];
      sortedCorners[d * 3 + 2] = data.cornerVertex[t * 3 + 2];
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(corners * 3), 3));
    geometry.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(corners * 3), 3));
    for (let m = 0; m < matCount; m++) if (counts[m] > 0) geometry.addGroup(starts[m] * 3, counts[m] * 3, m);

    let hasUV = false;
    if (opt.uvSet) {
      const cornerUV = buildCornerUVs(data, opt.uvSet);
      const sortedUV = new Float32Array(corners * 2);
      for (let t = 0; t < triCount; t++) {
        const d = dest[t] * 6;
        sortedUV.set(cornerUV.subarray(t * 6, t * 6 + 6), d);
      }
      geometry.setAttribute("uv", new THREE.BufferAttribute(sortedUV, 2));
      hasUV = true;
    }

    let skinnedVertices = 0;
    let skinned = false;
    if (opt.skin && host.skeleton) {
      const nameToIndex = new Map<string, number>();
      host.boneList.forEach((b, i) => nameToIndex.set(b.name, i));
      const attrs = buildSkinAttributes(data.vertexCount, opt.skin, (node) => this.resolveJoint(owner, host, node, nameToIndex));
      skinnedVertices = attrs.skinnedVertices;
      if (skinnedVertices > 0) {
        const si = new Uint16Array(corners * 4);
        const sw = new Float32Array(corners * 4);
        for (let c = 0; c < corners; c++) {
          const v = sortedCorners[c];
          for (let k = 0; k < 4; k++) {
            si[c * 4 + k] = attrs.indices[v * 4 + k];
            sw[c * 4 + k] = attrs.weights[v * 4 + k];
          }
        }
        geometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(si, 4));
        geometry.setAttribute("skinWeight", new THREE.Float32BufferAttribute(sw, 4));
        skinned = true;
      }
    }

    const materials = this.buildMaterials(data, opt.materialModels, opt.resolveTexture, hasUV);
    const object: THREE.Mesh = skinned ? new THREE.SkinnedMesh(geometry, materials) : new THREE.Mesh(geometry, materials);
    object.frustumCulled = false;
    object.name = data.name;
    object.visible = this.opts.mesh;
    host.root.add(object);
    if (skinned && host.skeleton) {
      host.root.updateMatrixWorld(true);
      // pass the bind matrix explicitly: bind() would otherwise recompute the inverses from the current pose
      (object as THREE.SkinnedMesh).bind(host.skeleton, object.matrixWorld);
    }

    const rt: MeshRuntime = {
      key,
      data,
      object,
      materials,
      sortedCorners,
      vertexPositions: new Float32Array(data.basePositions),
      morphs: [],
      skinnedVertices,
    };
    owner.meshes.set(key, rt);
    for (const m of materials) (m as THREE.MeshStandardMaterial).wireframe = this.opts.wireframe;
    this.refreshMesh(rt);
    this.onChange();
    return { skinnedVertices };
  }

  private rigOwner(fig: FigureRuntime): FigureRuntime {
    let cur = fig;
    for (let i = 0; i < 8 && cur.model.conformTarget; i++) {
      const next = this.figures.get(cur.model.conformTarget);
      if (!next) break;
      cur = next;
    }
    return cur;
  }

  /** Maps a joint name from a .dsf skin binding to an index in the host skeleton, or -1. */
  private resolveJoint(owner: FigureRuntime, host: FigureRuntime, node: string, nameToIndex: Map<string, number>): number {
    // conformed figures carry their own copies of the bones: go via the scene-node name
    const own = this.sceneBones.find((b) => b.figureId === owner.model.id && b.dsfKey === node);
    const name = own?.name ?? node;
    for (const b of host.boneModels.values()) if (b.name === name) return nameToIndex.get(b.id) ?? -1;
    for (const b of host.boneModels.values()) if (b.dsfKey === node) return nameToIndex.get(b.id) ?? -1;
    return -1;
  }

  private buildMaterials(
    data: MeshData,
    models: MaterialModel[],
    resolveTexture: (url: string) => string | undefined,
    hasUV: boolean,
  ): THREE.Material[] {
    const names = data.materialNames.length ? data.materialNames : ["default"];
    return names.map((name) => {
      const m = models.find((mm) => mm.groups.includes(name) && (!mm.geometryId || mm.geometryId === data.id));
      const color = new THREE.Color().setRGB(m?.color[0] ?? 0.75, m?.color[1] ?? 0.75, m?.color[2] ?? 0.75, THREE.SRGBColorSpace);
      const mat = new THREE.MeshStandardMaterial({
        color,
        roughness: 0.6,
        metalness: 0,
        side: DOUBLE_SIDED.test(name) ? THREE.DoubleSide : THREE.FrontSide,
      });
      mat.name = name;
      if (TRANSLUCENT.test(name)) {
        mat.transparent = true;
        mat.opacity = 0.14;
        mat.depthWrite = false;
      }
      if (m && hasUV) {
        if (m.diffuseMap) this.loadTexture(mat, "map", m.diffuseMap, resolveTexture);
        const alpha = m.maps.find((mp) => /opacity|cutout/i.test(mp.channel));
        if (alpha) this.loadTexture(mat, "alphaMap", alpha.file, resolveTexture);
      }
      return mat;
    });
  }

  private loadTexture(mat: THREE.MeshStandardMaterial, slot: "map" | "alphaMap", file: string, resolve: (u: string) => string | undefined): void {
    const url = resolve(file);
    if (!url || /\.(tif|tiff|exr|hdr)$/i.test(file)) return;
    this.loader.load(
      url,
      (tex) => {
        if (slot === "map") tex.colorSpace = THREE.SRGBColorSpace;
        // Genesis textures use UDIM tiles: the tile number is the 4-digit suffix (1001 = u0 v0, 1002 = u1 v0, ...)
        const tile = /_(10\d\d)\.[a-z0-9]+$/i.exec(baseName(file))?.[1];
        if (tile) {
          const n = parseInt(tile, 10) - 1001;
          tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
          tex.offset.set(-(n % 10), -Math.floor(n / 10));
        }
        tex.anisotropy = 8;
        mat[slot] = tex;
        if (slot === "alphaMap") {
          mat.transparent = true;
          mat.alphaTest = 0.4;
        }
        mat.needsUpdate = true;
        this.invalidate();
      },
      undefined,
      () => {
        /* unreadable image: keep the flat colour */
      },
    );
  }

  private disposeMesh(m: MeshRuntime): void {
    m.object.removeFromParent();
    m.object.geometry.dispose();
    for (const mat of m.materials) {
      const s = mat as THREE.MeshStandardMaterial;
      s.map?.dispose();
      s.alphaMap?.dispose();
      mat.dispose();
    }
  }

  /* --------------------------------------------------------------- morphs */

  /** Replaces the morph set for meshes of a geometry. `values` are keyed by morph id. */
  setMorphs(list: { morphId: string; geometryId: string | null; data: MorphData; value: number }[]): void {
    for (const f of this.figures.values()) {
      for (const m of f.meshes.values()) {
        m.morphs = list
          .filter((x) => (!x.geometryId || x.geometryId === m.data.id) && (!x.data.vertexCount || x.data.vertexCount === m.data.vertexCount))
          .map((x) => ({ data: x.data, value: x.value, morphId: x.morphId }));
      }
    }
    this.morphDirty = true;
  }

  setMorphValue(morphId: string, value: number): void {
    for (const f of this.figures.values()) {
      for (const m of f.meshes.values()) {
        for (const x of m.morphs) if (x.morphId === morphId) x.value = value;
      }
    }
    this.morphDirty = true;
  }

  private refreshMesh(m: MeshRuntime): void {
    applyMorphs(m.data, m.morphs, m.vertexPositions);
    const normals = computeSmoothNormals(m.vertexPositions, m.data);
    const geo = m.object.geometry;
    const pos = geo.getAttribute("position") as THREE.BufferAttribute;
    const nrm = geo.getAttribute("normal") as THREE.BufferAttribute;
    const p = pos.array as Float32Array;
    const n = nrm.array as Float32Array;
    const vp = m.vertexPositions;
    const sc = m.sortedCorners;
    for (let c = 0; c < sc.length; c++) {
      const v = sc[c] * 3;
      const o = c * 3;
      p[o] = vp[v]; p[o + 1] = vp[v + 1]; p[o + 2] = vp[v + 2];
      n[o] = normals[v]; n[o + 1] = normals[v + 1]; n[o + 2] = normals[v + 2];
    }
    pos.needsUpdate = true;
    nrm.needsUpdate = true;
    this.invalidate();
  }

  /* ------------------------------------------------------ view + selection */

  setOptions(patch: Partial<ViewOptions>): void {
    const rotationChanged = patch.invertRotation !== undefined && patch.invertRotation !== this.opts.invertRotation;
    this.opts = { ...this.opts, ...patch };
    if (rotationChanged) this.applyAllPose();
    this.applyVisibility();
  }

  private applyVisibility(): void {
    this.grid.visible = this.opts.grid;
    this.jointMat.depthTest = !this.opts.xray;
    this.selectedMat.depthTest = !this.opts.xray;
    this.lineMat.depthTest = !this.opts.xray;
    for (const [id, j] of this.joints) {
      const b = this.boneModels.get(id);
      j.visible = this.opts.skeleton && (!b?.detail || this.opts.detail);
    }
    for (const [key, l] of this.lines) {
      const id = key.replace(/#tip$/, "");
      const b = this.boneModels.get(id);
      l.visible = this.opts.skeleton && (!b?.detail || this.opts.detail);
    }
    for (const f of this.figures.values()) {
      for (const m of f.meshes.values()) {
        m.object.visible = this.opts.mesh;
        for (const mat of m.materials) (mat as THREE.MeshStandardMaterial).wireframe = this.opts.wireframe;
      }
    }
    this.invalidate();
  }

  select(id: string | null): void {
    if (this.selectedId) {
      const prev = this.joints.get(this.selectedId);
      if (prev) {
        prev.material = this.jointMat;
        prev.scale.setScalar(this.boneModels.get(this.selectedId)?.detail ? 0.45 : 0.95);
      }
    }
    this.selectedId = id;
    if (id) {
      const j = this.joints.get(id);
      if (j) {
        j.material = this.selectedMat;
        j.scale.setScalar(1.7);
        j.visible = this.opts.skeleton;
      }
    }
    this.invalidate();
  }

  private figureBox(): THREE.Box3 {
    const box = new THREE.Box3();
    for (const f of this.figures.values()) {
      if (f.model.boxMin && f.model.boxMax && !f.model.conformTarget) {
        box.expandByPoint(new THREE.Vector3(...f.model.boxMin).multiplyScalar(CM));
        box.expandByPoint(new THREE.Vector3(...f.model.boxMax).multiplyScalar(CM));
      }
    }
    if (box.isEmpty()) box.setFromObject(this.stage);
    if (box.isEmpty()) box.set(new THREE.Vector3(-0.5, 0, -0.5), new THREE.Vector3(0.5, 1.8, 0.5));
    return box;
  }

  frame(): void {
    this.fitTo(this.figureBox(), new THREE.Vector3(0.25, 0.12, 1).normalize());
  }

  view(preset: "front" | "back" | "left" | "right" | "top"): void {
    const dirs: Record<string, THREE.Vector3> = {
      front: new THREE.Vector3(0, 0, 1),
      back: new THREE.Vector3(0, 0, -1),
      left: new THREE.Vector3(1, 0, 0),
      right: new THREE.Vector3(-1, 0, 0),
      top: new THREE.Vector3(0, 1, 0.001),
    };
    this.fitTo(this.figureBox(), dirs[preset].clone().normalize());
  }

  private fitTo(box: THREE.Box3, dir: THREE.Vector3): void {
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    // the DAZ oriented box for a T-posed figure is wide; height drives the framing
    const extent = Math.max(size.y, Math.min(size.x, size.y * 1.2), 0.3);
    const dist = (extent / 2 / Math.tan((this.camera.fov * D2R) / 2)) * 1.25;
    this.controls.target.copy(center);
    this.camera.position.copy(center).addScaledVector(dir, dist);
    this.camera.near = Math.max(dist / 200, 0.01);
    this.camera.far = dist * 60;
    this.camera.updateProjectionMatrix();
    this.controls.update();
    this.invalidate();
  }

  /* --------------------------------------------------------------- picking */

  private bindPointer(): void {
    const el = this.renderer.domElement;
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    let down: { x: number; y: number } | null = null;
    el.addEventListener("pointerdown", (e) => {
      down = { x: e.clientX, y: e.clientY };
    });
    el.addEventListener("pointerup", (e) => {
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4) return;
      down = null;
      const r = el.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, this.camera);
      const pickables = [...this.joints.values()].filter((j) => j.visible);
      const hit = ray.intersectObjects(pickables, false)[0];
      this.onPick((hit?.object.userData.boneId as string | undefined) ?? null);
    });
  }

  /* ----------------------------------------------------------------- stats */

  getStats(): EngineStats {
    let meshes = 0, triangles = 0, skinnedVertices = 0;
    for (const f of this.figures.values()) {
      for (const m of f.meshes.values()) {
        meshes++;
        triangles += m.data.triMaterial.length;
        skinnedVertices += m.skinnedVertices;
      }
    }
    return { bones: this.boneModels.size, meshes, triangles, skinnedVertices };
  }
}
