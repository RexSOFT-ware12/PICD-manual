import type { ViewerEngine } from "./viewer/engine";
import type { AssetRegistry } from "./daz/assets";
import type { BoneModel, Formula, MorphData, ParsedDaz, SceneModel, Vec3 } from "./daz/types";
import { fragmentOf } from "./daz/refs";
import { ShapeSolver } from "./daz/solver";

export interface AssetReport {
  geometry: { label: string; file: string; found: boolean; matched: boolean; skinned?: number; vertices?: number }[];
  uvSets: { file: string; found: boolean }[];
  morphs: { id: string; file: string; found: boolean }[];
  textures: { file: string; found: boolean }[];
  meshes: number;
  formulas: { count: number; unsupported: number; drivenMorphs: number };
}

export const EMPTY_REPORT: AssetReport = {
  geometry: [],
  uvSets: [],
  morphs: [],
  textures: [],
  meshes: 0,
  formulas: { count: 0, unsupported: 0, drivenMorphs: 0 },
};

/** Morph values and bone rotations exactly as the .duf saved them. */
export function initialState(model: SceneModel): { morphs: Record<string, number>; pose: Record<string, Vec3> } {
  const morphs: Record<string, number> = {};
  for (const m of model.morphs) morphs[m.id] = m.value;
  const pose: Record<string, Vec3> = {};
  for (const b of model.bones) if (b.rotation.some((v) => v !== 0)) pose[b.id] = [...b.rotation] as Vec3;
  return { morphs, pose };
}

/** Re-runs the formulas for the current sliders/pose and pushes the result into the viewer. */
export function applySolve(
  engine: ViewerEngine,
  solver: ShapeSolver,
  morphs: Record<string, number>,
  pose: Record<string, Vec3>,
): void {
  const r = solver.evaluate(morphs, pose);
  for (const [id, v] of r.morphValues) engine.setMorphValue(id, v);
  engine.setJointOffsets(r.centerOffsets, r.endOffsets);
  engine.setDrivenRotation(r.drivenRotation);
}

export interface HydrateResult {
  report: AssetReport;
  solver: ShapeSolver | null;
}

/**
 * Looks up everything the scene references (base meshes, UV sets, morph files, textures) in the
 * user's content library, works out shape-driven joint and morph values, and feeds it all to the
 * viewer. If a figure's exact library path isn't present but a matching base figure (e.g. any
 * "Genesis 8.1 Female" .dsf) is, that's used instead.
 */
export async function hydrate(
  engine: ViewerEngine,
  model: SceneModel,
  embedded: ParsedDaz,
  registry: AssetRegistry,
  morphValues: Record<string, number>,
  pose: Record<string, Vec3>,
  cancelled: () => boolean,
): Promise<HydrateResult> {
  const report: AssetReport = {
    geometry: [],
    uvSets: [],
    morphs: [],
    textures: [],
    meshes: 0,
    formulas: { count: 0, unsupported: 0, drivenMorphs: 0 },
  };
  const formulas: Formula[] = [];
  let solverBones: BoneModel[] | null = null;

  for (const fig of model.figures) {
    for (const g of fig.geometries) {
      let parsed: ParsedDaz | null = null;
      let matched = true;
      if (!g.file) {
        parsed = embedded;
      } else {
        let f = registry.find(g.file);
        if (!f) {
          f = registry.findFigureBase(fig.label);
          matched = false;
        }
        if (f) parsed = (await registry.parse(f)).parsed;
      }
      if (cancelled()) return { report, solver: null };
      const mesh = parsed?.geometries.find((m) => m.id === g.id) ?? (parsed?.geometries.length === 1 ? parsed.geometries[0] : undefined);
      if (!parsed || !mesh) {
        report.geometry.push({ label: g.name, file: g.file || "(embedded)", found: false, matched: false });
        continue;
      }

      const skin = parsed.skins.find((s) => !s.geometryId || s.geometryId === mesh.id);

      if (!fig.conformTarget && !solverBones) {
        solverBones = model.bones.filter((b) => b.figureId === fig.id);
        formulas.push(...parsed.formulas);
      }

      const matForUv = model.materials.find((m) => m.geometryId === mesh.id && m.uvSetUrl);
      let uvSet = undefined;
      if (matForUv?.uvSetUrl) {
        const uvFile = registry.find(matForUv.uvSetUrl);
        report.uvSets.push({ file: matForUv.uvSetUrl, found: !!uvFile });
        if (uvFile) {
          const uv = (await registry.parse(uvFile)).parsed;
          uvSet = uv.uvSets.find((u) => u.id === fragmentOf(matForUv.uvSetUrl)) ?? uv.uvSets[0];
        }
      }
      if (cancelled()) return { report, solver: null };

      const { skinnedVertices } = engine.attachMesh(fig.id, mesh, {
        skin,
        uvSet,
        materialModels: model.materials,
        resolveTexture: (u) => registry.textureUrl(u),
      });
      report.meshes++;
      report.geometry.push({
        label: g.name,
        file: g.file || "(embedded)",
        found: true,
        matched,
        skinned: skinnedVertices,
        vertices: mesh.vertexCount,
      });
    }
  }

  /* morphs the scene sets directly */
  const morphList: { morphId: string; geometryId: string | null; data: MorphData; value: number }[] = [];
  const have = new Set<string>();
  for (const m of model.morphs) {
    const f = registry.find(m.file);
    report.morphs.push({ id: m.id, file: m.file, found: !!f });
    if (!f) continue;
    const parsed = (await registry.parse(f)).parsed;
    if (cancelled()) return { report, solver: null };
    formulas.push(...parsed.formulas);
    const data = parsed.morphs.find((x) => x.id === fragmentOf(m.url)) ?? parsed.morphs[0];
    if (data) {
      morphList.push({ morphId: m.id, geometryId: m.geometryId, data, value: morphValues[m.id] ?? m.value });
      have.add(m.id);
    }
  }

  /*
   * Controller morphs (height, body type…) drive other morphs that the scene never lists. Solve
   * with what we have, load every driven morph that ended up non-zero, and repeat until nothing
   * new turns up.
   */
  const init = initialState(model);
  let solver: ShapeSolver | null = null;
  if (solverBones) {
    for (let round = 0; round < 4; round++) {
      solver = new ShapeSolver(formulas, solverBones);
      solver.setBaseline(init.morphs, init.pose);
      const values = solver.evaluate(morphValues, pose).morphValues;
      let added = 0;
      for (const [id, v] of values) {
        if (have.has(id) || Math.abs(v) < 1e-6 || added >= 150) continue;
        const file = solver.fileForMorph(id);
        const f = file ? registry.find(file) : undefined;
        if (!f) continue;
        const parsed = (await registry.parse(f)).parsed;
        if (cancelled()) return { report, solver: null };
        const data = parsed.morphs.find((x) => x.id === id) ?? parsed.morphs[0];
        have.add(id); // don't retry, even if the file held nothing usable
        if (!data) continue;
        formulas.push(...parsed.formulas);
        morphList.push({ morphId: id, geometryId: null, data, value: v });
        report.formulas.drivenMorphs++;
        added++;
      }
      if (added === 0) break;
    }
  }
  engine.setMorphs(morphList);

  if (solver) {
    report.formulas.count = solver.formulaCount;
    report.formulas.unsupported = solver.unsupportedCount;
    // the baseline is the scene as saved, so its joints are already in place: offsets start at zero
    applySolve(engine, solver, morphValues, pose);
  }

  for (const t of model.textures) report.textures.push({ file: t, found: !!registry.find(t) });
  return { report, solver };
}
