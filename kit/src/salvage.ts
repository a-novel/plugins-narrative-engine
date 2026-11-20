import type { Json, JsonObject } from "./json.js";
import { format, get, isObject, parse } from "./pointer.js";
import { compile, failures } from "./validate.js";

/** A SalvagedEntry is one subtree that salvage moved out of the content. */
export interface SalvagedEntry {
  /** JSON Pointer (RFC 6901) to the subtree in the input content. */
  path: string;
  /** The subtree, as the input holds it. */
  value: Json;
  /** Why the subtree left. */
  errors: string[];
  /** The pass that cut the subtree. After the first pass, the cut answers an error an earlier cut created. */
  pass: number;
}

/**
 * A SalvageResult is the outcome of {@link salvage}: valid content with what left it, or the reason
 * why the root cannot be made valid.
 */
export type SalvageResult =
  | {
      ok: true;
      /** A valid copy of the input, without the subtrees that failed. */
      content: Json;
      /** The outermost subtrees that failed, in input coordinates. */
      unmigrated: SalvagedEntry[];
      /** JSON Pointers, into the input, to the required properties that took their schema default. */
      filled: string[];
      /** The number of validation passes it took. */
      passes: number;
    }
  | {
      ok: false;
      /** The input itself. */
      content: Json;
      reason: string;
    };

// Each pass climbs one level, so content that fails deeper than this through chained required
// properties is refused instead of cut.
const MAX_PASSES = 16;

/**
 * Makes `content` valid against `schema`, a JSON Schema of draft 2020-12, by moving every failing
 * subtree aside. It validates, cuts the outermost failing subtrees, and repeats until what remains
 * is valid. A missing required property takes its schema default. Without a default, or when the
 * default does not hold, the object that lacks the property leaves.
 *
 * The content cannot be made valid when its root has the wrong type, lacks a required property that
 * has no default, or is still invalid after 16 passes. The input is never modified.
 *
 * @throws When the schema cannot be evaluated, as with a `$ref` that resolves to nothing, and when
 *   the content fails in more places than the validator can report.
 */
export function salvage(schema: JsonObject, content: Json): SalvageResult {
  const validator = compile(schema);
  const work = structuredClone(content);
  // Array of `work` => the input index of each item it still holds.
  const origin = new WeakMap<Json[], number[]>();
  // Input pointer => entry.
  const unmigrated = new Map<string, SalvagedEntry>();
  // Input pointers that received a schema default.
  const filled = new Set<string>();

  /** Translates tokens of `work` into a pointer into the input. */
  const inputPath = (tokens: string[]): string => {
    let node: Json | undefined = work;
    const inputTokens = tokens.map((token) => {
      const index = Array.isArray(node) ? (origin.get(node)?.[Number(token)] ?? token) : token;
      node = get(node, [token]);
      return index;
    });

    return format(inputTokens);
  };

  for (let passes = 1; passes <= MAX_PASSES; passes++) {
    const result = validator.validate(work);
    if (result.valid) {
      return { ok: true, content: work, unmigrated: [...unmigrated.values()], filled: [...filled], passes };
    }

    // Pointer into `work` => what leaves there, and why.
    const removals = new Map<string, { at: string[]; errors: string[] }>();
    const fills: { at: string[]; fill: Json }[] = [];
    for (const { at, error, missing, fill } of failures(schema, work, result.errors)) {
      // A default fills a missing property once. Without one, or when it did not hold, the parent goes.
      if (fill !== undefined && !filled.has(inputPath(at))) {
        fills.push({ at, fill });
        continue;
      }

      const target = missing ? at.slice(0, -1) : at;
      const removal = removals.get(format(target)) ?? { at: target, errors: [] };
      removal.errors.push(error);
      removals.set(format(target), removal);
    }

    const root = removals.get("");
    if (root) return { ok: false, content, reason: root.errors.join(" ") };

    // Only the outermost locations are cut, and nothing is filled inside one.
    const isInside = ({ at }: { at: string[] }) => at.some((_, depth) => removals.has(format(at.slice(0, depth))));

    for (const { at, fill } of fills.filter((entry) => !isInside(entry))) {
      const parent = get(work, at.slice(0, -1));
      if (isObject(parent)) parent[at.at(-1)!] = structuredClone(fill);
      filled.add(inputPath(at));
    }

    // Paths and parents are read before anything moves.
    const cuts = [...removals.values()]
      .filter((removal) => !isInside(removal))
      .map(({ at, errors }) => ({ parent: get(work, at.slice(0, -1)), key: at.at(-1)!, path: inputPath(at), errors }));

    for (const cut of cuts) {
      // An earlier pass may have moved parts of this subtree: the whole input subtree replaces them.
      if (passes > 1) {
        for (const path of [...unmigrated.keys(), ...filled]) {
          if (!path.startsWith(cut.path + "/")) continue;

          cut.errors.push(...(unmigrated.get(path)?.errors ?? []));
          unmigrated.delete(path);
          filled.delete(path);
        }
      }

      const value = get(content, parse(cut.path));
      if (value !== undefined) unmigrated.set(cut.path, { path: cut.path, value, errors: cut.errors, pass: passes });
      if (isObject(cut.parent)) delete cut.parent[cut.key];
    }

    // Array items leave last, highest index first, so that no pending index shifts.
    const items = cuts.flatMap(({ parent, key }) => (Array.isArray(parent) ? [{ parent, index: Number(key) }] : []));
    for (const { parent, index } of items.sort((a, b) => b.index - a.index)) {
      const indexes = origin.get(parent) ?? parent.map((_, position) => position);
      indexes.splice(index, 1);
      parent.splice(index, 1);
      origin.set(parent, indexes);
    }
  }

  return { ok: false, content, reason: `Not valid after ${MAX_PASSES} passes.` };
}
