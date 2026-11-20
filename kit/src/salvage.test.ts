import { edit, generate, v1, v2, v2AnyOf, v2MinItems, v2RootRequired } from "./composer.fixture.js";
import type { Json, JsonObject } from "./json.js";
import { format, get, isObject, parse } from "./pointer.js";
import { type SalvageResult, salvage } from "./salvage.js";
import { validate } from "./validate.js";

import { describe, expect, it } from "vitest";

type Salvaged = Extract<SalvageResult, { ok: true }>;

const layers = [{ id: "l-0", kind: "notes", name: "Notes" }];
const scene = (extra: JsonObject = {}): JsonObject => ({ id: "s-0", title: "Arrival", cells: [], ...extra });
const withScenes = (...scenes: Json[]): JsonObject => ({ beats: [{ id: "b-0", title: "Opening", scenes }], layers });
const withBeat = (extra: JsonObject): JsonObject => ({
  beats: [{ id: "b-0", title: "Opening", scenes: [], ...extra }],
  layers,
});
const withCells = (...cells: Json[]): JsonObject => withScenes(scene({ cells }));

const at = (document: Json, pointer: string) => get(document, parse(pointer));
const paths = (result: Salvaged) => result.unmigrated.map((entry) => entry.path);
const moved = (result: Salvaged) => result.unmigrated.map(({ path, value }) => [path, value]);

const REMOVED = Symbol("removed");

/** Drops the removed marks from a tree, closing the gaps they leave in arrays. */
function sweep(node: unknown): unknown {
  if (Array.isArray(node)) return node.filter((item) => item !== REMOVED).map(sweep);
  if (!isObject(node)) return node;

  const kept = Object.entries(node).filter(([, value]) => value !== REMOVED);
  return Object.fromEntries(kept.map(([key, value]) => [key, sweep(value)]));
}

/** Translates a pointer into the input to a pointer into the result, past the array items that left. */
function pathAfter(result: Salvaged, path: string): string {
  const removed = paths(result).map(parse);
  const tokens = parse(path);
  const shifted = tokens.map((token, depth) => {
    if (!/^\d+$/.test(token)) return token;

    const parent = format(tokens.slice(0, depth));
    const isEarlierSibling = (other: string[]) =>
      other.length === depth + 1 && format(other.slice(0, depth)) === parent && Number(other[depth]) < Number(token);
    return Number(token) - removed.filter(isEarlierSibling).length;
  });

  return format(shifted);
}

/** Rebuilds what the result must be: the input, minus what left, plus the defaults. */
function rebuild(input: Json, result: Salvaged): unknown {
  const rebuilt: unknown = structuredClone(input);
  const child = (node: unknown, token: string) => (node as Record<string, unknown>)[token];
  const put = (path: string, value: unknown) => {
    const tokens = parse(path);
    const parent = tokens.slice(0, -1).reduce(child, rebuilt) as Record<string, unknown>;
    parent[tokens.at(-1) ?? ""] = value;
  };

  for (const path of paths(result)) put(path, REMOVED);
  for (const path of result.filled) put(path, at(result.content, pathAfter(result, path)));

  return sweep(rebuilt);
}

/** Salvages a content of version 1, and checks what must hold for every run. */
function run(input: Json, schema: JsonObject = v2): SalvageResult {
  const before = structuredClone(input);
  expect(validate(v1, input), "the input is valid against version 1").toEqual([]);

  const result = salvage(schema, input);
  expect(input, "the input is untouched").toEqual(before);
  if (!result.ok) return result;

  expect(validate(schema, result.content), "the result is valid").toEqual([]);
  for (const entry of result.unmigrated) {
    expect(entry.value, `${entry.path} holds the input subtree`).toBe(at(input, entry.path));
    expect(entry.errors, `${entry.path} says why`).not.toHaveLength(0);
    expect(
      paths(result).filter((other) => other.startsWith(entry.path + "/")),
      `${entry.path} is outermost`
    ).toEqual([]);
  }
  expect(rebuild(input, result), "the input, minus what left, plus the defaults, is the result").toEqual(
    result.content
  );

  return result;
}

/** Runs a salvage that must succeed. */
function salvaged(input: Json, schema: JsonObject = v2): Salvaged {
  const result = run(input, schema);
  if (!result.ok) throw new Error(result.reason);

  return result;
}

describe("salvage, from version 1 to version 2", () => {
  it("leaves a valid content alone, in one pass", () => {
    const result = salvaged(withScenes(), v1);
    expect([result.unmigrated, result.filled, result.passes]).toEqual([[], [], 1]);
  });

  it("moves a removed property", () => {
    const result = salvaged(withScenes(scene({ pov: "Mara" })));
    expect(moved(result)).toEqual([["/beats/0/scenes/0/pov", "Mara"]]);
    expect(result.passes).toBe(2);
  });

  it("moves an optional property whose type changed", () => {
    expect(paths(salvaged(withBeat({ act: "1" })))).toEqual(["/beats/0/act"]);
  });

  it("moves an optional string over the tightened maxLength", () => {
    const result = salvaged(withScenes(scene({ summary: "x".repeat(600) })));
    expect(paths(result)).toEqual(["/beats/0/scenes/0/summary"]);
  });

  it("moves the whole array item when a required string is over the tightened maxLength", () => {
    const long = scene({ id: "s-1", title: "x".repeat(150), pov: "Mara" });
    const result = salvaged(withScenes(scene(), long, scene({ id: "s-2" })));

    expect(moved(result), "the item is whole: its title and its pov came back").toEqual([["/beats/0/scenes/1", long]]);
    expect(result.unmigrated[0]?.errors, "the errors of the folded parts are kept").toHaveLength(3);
    expect([result.unmigrated[0]?.pass, result.passes], "removing the title created a new error").toEqual([2, 3]);
    expect(at(result.content, "/beats/0/scenes")).toMatchObject([{ id: "s-0" }, { id: "s-2" }]);
  });

  it("fills a new required property from its default", () => {
    const result = salvaged(withScenes(scene()));
    expect([paths(result), result.filled]).toEqual([[], ["/beats/0/scenes/0/status"]]);
    expect(at(result.content, "/beats/0/scenes/0/status")).toBe("draft");
  });

  it("moves the nearest array item for a new required property without a default", () => {
    const link = { target: "scenes/s-9", relation: "but" };
    const result = salvaged(withCells({ kind: "link", layer: "l-0", links: [link] }));

    expect(moved(result)).toEqual([["/beats/0/scenes/0/cells/0/links/0", link]]);
    expect(at(result.content, "/beats/0/scenes/0/cells/0/links"), "the cell stays").toEqual([]);
  });

  it("moves an optional property holding a removed enum value", () => {
    expect(paths(salvaged(withBeat({ color: "gray" })))).toEqual(["/beats/0/color"]);
  });

  it("moves the array item when a required property holds a removed enum value", () => {
    const blocks = [
      { id: "k-0", type: "action", text: "runs" },
      { id: "k-1", type: "dialogue", text: "hi" },
    ];
    const result = salvaged(withCells({ kind: "script", layer: "l-0", blocks }));

    expect(paths(result)).toEqual(["/beats/0/scenes/0/cells/0/blocks/0"]);
    expect(result.passes).toBe(3);
  });

  it("keeps paths in input coordinates when earlier array items leave", () => {
    const result = salvaged(
      withScenes(
        scene({ title: "x".repeat(150) }),
        scene({ id: "s-1" }),
        scene({ id: "s-2", title: "y".repeat(150) }),
        scene({ id: "s-3", pov: "Mara" })
      )
    );
    expect(paths(result).sort()).toEqual(["/beats/0/scenes/0", "/beats/0/scenes/2", "/beats/0/scenes/3/pov"]);
  });
});

describe("salvage, tagged unions", () => {
  const notes = { kind: "notes", layer: "l-0", text: "fine", format: "html" };
  const logline = { kind: "logline", layer: "l-0", line: "x".repeat(200) };
  const unions: [keyword: string, schema: JsonObject][] = [
    ["oneOf", v2],
    ["anyOf", v2AnyOf],
  ];

  it.each(unions)("%s: moves only the failing optional property of the tagged branch", (_, schema) => {
    expect(paths(salvaged(withCells(notes), schema))).toEqual(["/beats/0/scenes/0/cells/0/format"]);
  });

  it.each(unions)("%s: moves the cell when a required property of its branch fails", (_, schema) => {
    const result = salvaged(withCells(notes, logline), schema);
    expect(paths(result).sort()).toEqual(["/beats/0/scenes/0/cells/0/format", "/beats/0/scenes/0/cells/1"]);
  });

  it("moves the whole cell when no branch accepts its tag", () => {
    const withoutLinkCells = edit(v2, ["/$defs/cell/oneOf/3"]);
    const link = { kind: "link", layer: "l-0", links: [] };
    const result = salvaged(withCells(link, { kind: "notes", layer: "l-0", text: "kept" }), withoutLinkCells);

    expect(paths(result)).toEqual(["/beats/0/scenes/0/cells/0"]);
  });

  it("moves the whole value when a oneOf matches two branches", () => {
    const twoMatches: JsonObject = { oneOf: [{ type: "number" }, { minimum: 0 }, { type: "string" }] };
    const result = salvage({ type: "object", properties: { n: twoMatches } }, { n: 1 });

    expect(result).toMatchObject({ ok: true, content: {}, unmigrated: [{ path: "/n", value: 1 }] });
  });
});

describe("salvage, keywords read as a whole", () => {
  it("moves the array that contains no matching item, and leaves its items in it", () => {
    const schema = { properties: { tags: { type: "array", contains: { const: "night" } } } };
    const result = salvage(schema, { tags: ["road", "mill"] });

    expect(result).toMatchObject({ ok: true, content: {}, unmigrated: [{ path: "/tags", pass: 1 }], passes: 2 });
  });

  it("moves the object whose required properties sit behind a reference to an anchor", () => {
    const thing = { $anchor: "thing", type: "object", required: ["size"], properties: { size: { default: 1 } } };
    const schema = { properties: { first: { $ref: "#thing" } }, $defs: { thing } };

    expect(salvage(schema, { first: {} })).toMatchObject({ ok: true, content: {}, filled: [], passes: 2 });
  });
});

describe("salvage, cascades", () => {
  it("folds a cascade into one entry: links emptied, then links, then the cell", () => {
    const cell = { kind: "link", layer: "l-0", links: [{ target: "scenes/s-9", relation: "but" }] };
    const result = salvaged(withCells(cell, { kind: "notes", layer: "l-0", text: "kept" }), v2MinItems);

    expect(moved(result)).toEqual([["/beats/0/scenes/0/cells/0", cell]]);
    expect(result.passes).toBe(4);
    expect(result.unmigrated[0]?.errors).toHaveLength(3);
  });

  it("moves the parent when the default itself is invalid, without looping", () => {
    const invalidDefault = edit(v2, ["/$defs/scene/properties/status/default", "archived"]);
    const result = salvaged(withScenes(scene()), invalidDefault);

    expect([paths(result), result.filled]).toEqual([["/beats/0/scenes/0"], []]);
  });

  it("removes an array that grew over a new maxItems, whole", () => {
    const noLayers = edit(v2, ["/properties/layers/maxItems", 0], ["/properties/layers/default", []]);
    const result = salvaged(withScenes(), noLayers);

    expect([paths(result), result.filled, at(result.content, "/layers")]).toEqual([["/layers"], ["/layers"], []]);
  });
});

describe("salvage, abort", () => {
  it("aborts when the root needs a property that has no default", () => {
    const input = withScenes(scene({ pov: "Mara" }));
    const result = run(input, v2RootRequired);

    expect(result.ok).toBe(false);
    expect(result.content, "the very same content comes back").toBe(input);
    expect(result).toHaveProperty("reason", expect.stringContaining('"meta"'));
  });

  it("aborts when the root has the wrong type", () => {
    const input: Json = [];
    const result = salvage(v2, input);

    expect(result.ok).toBe(false);
    expect(result.content).toBe(input);
    expect(result).toHaveProperty("reason", expect.stringContaining('Expected "object"'));
  });

  it("fills a root property that has a default instead of aborting", () => {
    const withDefault = edit(v2RootRequired, ["/properties/meta/default", { owner: "nobody" }]);
    const result = salvaged(withScenes(), withDefault);

    expect([result.filled, at(result.content, "/meta")]).toEqual([["/meta"], { owner: "nobody" }]);
  });

  it("aborts when the failing value is required at the root", () => {
    const schema = { type: "object", required: ["a"], properties: { a: { type: "string" } } };
    expect(salvage(schema, { a: 1 })).toMatchObject({ ok: false, reason: 'Missing required property "a".' });
  });

  it("climbs one level per pass, and gives up after 16 passes", () => {
    // Nested objects, each requiring the next, under one optional property.
    const level = {
      type: "object",
      required: ["next"],
      properties: { next: { $ref: "#/$defs/level" }, leaf: { const: 1 } },
    };
    const schema = { type: "object", properties: { chain: { $ref: "#/$defs/level" } }, $defs: { level } };
    const nested = (depth: number) => {
      let chain: JsonObject = { next: {}, leaf: 2 };
      for (let wrapped = 0; wrapped < depth; wrapped++) chain = { next: chain };
      return { chain };
    };

    expect(salvage(schema, nested(10))).toMatchObject({ ok: true, content: {}, passes: 13 });
    expect(salvage(schema, nested(20))).toMatchObject({ ok: false, reason: "Not valid after 16 passes." });
  });
});

describe("salvage, generated contents", () => {
  const sizes: [label: string, bytes: number, scenes: number][] = [
    ["50 kB", 50_000, 24],
    ["1 MB", 1_000_000, 478],
  ];

  it.each(sizes)("salvages a %s content of version 1 in three passes and loses nothing", (_, bytes, scenes) => {
    const result = salvaged(generate(bytes));
    expect(result.passes).toBe(3);

    // Every scene gets its default status, except inside the scenes that left whole.
    const wholeScenes = paths(result).filter((path) => /^\/beats\/\d+\/scenes\/\d+$/.test(path));
    expect(result.filled).toHaveLength(scenes - wholeScenes.length);
    expect(result.unmigrated.length).toBeGreaterThan(scenes);
  });

  it.each(sizes)("is idempotent on the result of a %s content", (_, bytes) => {
    const first = salvaged(generate(bytes));
    const again = salvage(v2, first.content);

    expect(again).toEqual({ ok: true, content: first.content, unmigrated: [], filled: [], passes: 1 });
  });
});
