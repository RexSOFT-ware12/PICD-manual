import { FormulaGraph } from "./formulas";
import type { BoneModel, ChannelRef, Formula, Vec3 } from "./types";

export interface SolveResult {
  /** effective value for every morph the scene sets or a formula drives */
  morphValues: Map<string, number>;
  /** joint centre / end-point movement relative to how the scene was saved */
  centerOffsets: Map<string, Vec3>;
  endOffsets: Map<string, Vec3>;
  /** rotation added to a bone by formulas (twist following bend, etc.), degrees */
  drivenRotation: Map<string, Vec3>;
}

const AXES = ["x", "y", "z"] as const;

/**
 * Works out how the scene's morph values and pose spread through Daz "formulas": controller morphs
 * that drive other morphs, morphs that move joints, and bones that follow other bones.
 */
export class ShapeSolver {
  private graph: FormulaGraph;
  private alias = new Map<string, string>();
  private baseline: Map<string, Vec3> | null = null;
  private affectedBones: BoneModel[];
  readonly formulaCount: number;
  readonly unsupportedCount: number;
  /** morph id -> the .dsf that holds it, for morphs that are only ever driven by other morphs */
  private driverFiles = new Map<string, string>();

  constructor(formulas: Formula[], private bones: BoneModel[]) {
    for (const b of bones) {
      this.alias.set(b.id, b.id);
      if (!this.alias.has(b.name)) this.alias.set(b.name, b.id);
      if (!this.alias.has(b.dsfKey)) this.alias.set(b.dsfKey, b.id);
    }
    for (const f of formulas) {
      if (f.output.channel === "value" && f.output.file && !this.driverFiles.has(f.output.id)) {
        this.driverFiles.set(f.output.id, f.output.file);
      }
    }
    this.graph = new FormulaGraph(formulas, (r) => this.key(r));
    this.formulaCount = formulas.length;
    this.unsupportedCount = this.graph.unsupportedCount;
    this.affectedBones = bones.filter((b) =>
      ["center_point", "end_point", "rotation"].some((c) => AXES.some((a) => this.graph.isDriven(`${b.id}?${c}/${a}`))),
    );
  }

  fileForMorph(id: string): string | undefined {
    return this.driverFiles.get(id);
  }

  private key(r: ChannelRef): string {
    const id = (r.name && this.alias.get(r.name)) || this.alias.get(r.id) || r.id;
    return `${id}?${r.channel}`;
  }

  private inputs(morphs: Record<string, number>, pose: Record<string, Vec3>): Map<string, number> {
    const m = new Map<string, number>();
    for (const [id, v] of Object.entries(morphs)) m.set(`${id}?value`, v);
    for (const b of this.bones) {
      const r = pose[b.id];
      if (!r) continue;
      AXES.forEach((a, i) => m.set(`${b.id}?rotation/${a}`, r[i]));
    }
    return m;
  }

  /** Remember what the scene looked like as saved, so later changes are reported as differences. */
  setBaseline(morphs: Record<string, number>, pose: Record<string, Vec3>): void {
    const get = this.graph.evaluator(this.inputs(morphs, pose));
    this.baseline = new Map();
    for (const b of this.affectedBones) {
      this.baseline.set(`${b.id}#c`, this.read(get, b.id, "center_point"));
      this.baseline.set(`${b.id}#e`, this.read(get, b.id, "end_point"));
    }
  }

  private read(get: (k: string) => number, id: string, channel: string): Vec3 {
    return [get(`${id}?${channel}/x`), get(`${id}?${channel}/y`), get(`${id}?${channel}/z`)];
  }

  evaluate(morphs: Record<string, number>, pose: Record<string, Vec3>): SolveResult {
    const get = this.graph.evaluator(this.inputs(morphs, pose));

    const morphValues = new Map<string, number>();
    for (const [id, v] of Object.entries(morphs)) morphValues.set(id, get(`${id}?value`) ?? v);
    for (const key of this.graph.outputKeys) {
      if (key.endsWith("?value")) morphValues.set(key.slice(0, -6), get(key));
    }

    const centerOffsets = new Map<string, Vec3>();
    const endOffsets = new Map<string, Vec3>();
    const drivenRotation = new Map<string, Vec3>();
    for (const b of this.affectedBones) {
      const c = this.read(get, b.id, "center_point");
      const e = this.read(get, b.id, "end_point");
      const bc = this.baseline?.get(`${b.id}#c`) ?? [0, 0, 0];
      const be = this.baseline?.get(`${b.id}#e`) ?? [0, 0, 0];
      centerOffsets.set(b.id, [c[0] - bc[0], c[1] - bc[1], c[2] - bc[2]]);
      endOffsets.set(b.id, [e[0] - be[0], e[1] - be[1], e[2] - be[2]]);
      const base = pose[b.id] ?? [0, 0, 0];
      const total = this.read(get, b.id, "rotation");
      // rotation is undriven -> read() returns the pose itself when the input exists, else 0
      const driven: Vec3 = [total[0] - base[0], total[1] - base[1], total[2] - base[2]];
      if (driven.some((v) => Math.abs(v) > 1e-9)) drivenRotation.set(b.id, driven);
    }
    return { morphValues, centerOffsets, endOffsets, drivenRotation };
  }
}
