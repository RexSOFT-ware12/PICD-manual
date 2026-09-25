import type { ChannelRef, Formula, FormulaOp } from "./types";
import { dec } from "./refs";

/**
 * Parses a DSON channel url such as
 *   "hip:/data/DAZ%203D/x.dsf#hip?center_point/x"   (scope name, file, id, channel)
 *   "#Some%20Morph?value"
 *   "lShldrBend:?rotation/z"
 */
export function parseChannelRef(url: unknown): ChannelRef | null {
  if (typeof url !== "string") return null;
  const q = url.indexOf("?");
  if (q < 0) return null;
  let head = url.slice(0, q);
  const channel = url.slice(q + 1);
  let name: string | null = null;

  const colon = head.indexOf(":");
  if (colon >= 0) {
    const before = head.slice(0, colon);
    if (!before.includes("/") && !before.includes("#")) {
      name = dec(before);
      head = head.slice(colon + 1);
    }
  }

  let file = "";
  let id = "";
  const hash = head.lastIndexOf("#");
  if (hash >= 0) {
    file = dec(head.slice(0, hash));
    id = dec(head.slice(hash + 1));
  } else if (head.includes("/")) {
    file = dec(head);
  } else {
    id = dec(head);
  }
  if (!id) id = name ?? "";
  if (!id || !channel) return null;
  return { name, file, id, channel };
}

function parseFormula(f: any): Formula | null {
  const output = parseChannelRef(f?.output);
  if (!output || !Array.isArray(f.operations)) return null;
  const ops: FormulaOp[] = [];
  let unsupported = false;
  for (const o of f.operations) {
    switch (o?.op) {
      case "push": {
        if (typeof o.val === "number") ops.push({ op: "push", val: o.val });
        else {
          const ref = parseChannelRef(o.url);
          if (ref) ops.push({ op: "push", ref });
          else unsupported = true;
        }
        break;
      }
      case "add":
      case "sub":
      case "mult":
      case "div":
        ops.push({ op: o.op });
        break;
      default:
        unsupported = true; // spline_tcb, spline_linear, ...
    }
  }
  return { output, stage: f.stage === "mult" ? "mult" : "sum", ops, unsupported };
}

/** Collects every formula from the modifier and node libraries of a .dsf/.duf. */
export function collectFormulas(daz: any): Formula[] {
  const out: Formula[] = [];
  const scan = (list: any) => {
    if (!Array.isArray(list)) return;
    for (const e of list) {
      if (!Array.isArray(e?.formulas)) continue;
      for (const f of e.formulas) {
        const p = parseFormula(f);
        if (p) out.push(p);
      }
    }
  };
  scan(daz?.modifier_library);
  scan(daz?.node_library);
  return out;
}

/**
 * Lazily evaluates channel values: value = own input + sum of "sum" formulas, then times "mult" formulas.
 * Formulas whose operations can't be evaluated are skipped.
 */
export class FormulaGraph {
  private byOutput = new Map<string, Formula[]>();
  unsupportedCount = 0;

  constructor(formulas: Formula[], private keyOf: (ref: ChannelRef) => string) {
    for (const f of formulas) {
      if (f.unsupported) {
        this.unsupportedCount++;
        continue;
      }
      const k = keyOf(f.output);
      const list = this.byOutput.get(k) ?? [];
      list.push(f);
      this.byOutput.set(k, list);
    }
  }

  get outputKeys(): IterableIterator<string> {
    return this.byOutput.keys();
  }

  isDriven(key: string): boolean {
    return this.byOutput.has(key);
  }

  evaluator(inputs: Map<string, number>): (key: string) => number {
    const memo = new Map<string, number>();
    const visiting = new Set<string>();

    const run = (f: Formula): number => {
      const stack: number[] = [];
      for (const op of f.ops) {
        if (op.op === "push") {
          stack.push("val" in op ? op.val : get(this.keyOf(op.ref)));
        } else {
          const b = stack.pop();
          const a = stack.pop();
          if (a === undefined || b === undefined) return 0;
          stack.push(op.op === "add" ? a + b : op.op === "sub" ? a - b : op.op === "mult" ? a * b : b === 0 ? 0 : a / b);
        }
      }
      return stack.length ? stack[stack.length - 1] : 0;
    };

    const get = (key: string): number => {
      const cached = memo.get(key);
      if (cached !== undefined) return cached;
      const base = inputs.get(key) ?? 0;
      const drivers = this.byOutput.get(key);
      if (!drivers || visiting.has(key)) return base; // undriven, or a cycle
      visiting.add(key);
      let v = base;
      for (const f of drivers) if (f.stage === "sum") v += run(f);
      for (const f of drivers) if (f.stage === "mult") v *= run(f);
      visiting.delete(key);
      memo.set(key, v);
      return v;
    };
    return get;
  }
}
