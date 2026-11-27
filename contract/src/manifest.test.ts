import { type Edit, edit, generate } from "./composer.fixture.js";
import {
  type LinkRule,
  type Manifest,
  checkManifest,
  checkMessages,
  checkRules,
  listDynamicLinks,
  listExports,
} from "./manifest.js";

import { describe, expect, it } from "vitest";

import type { Json, JsonObject } from "@a-novel-kit/nodelib-json";

const english = {
  title: "Scenes Composer",
  description: "Lays a story out as beats and scenes.",
  messages: {
    schema: { title: "Composer", beats: "The beats of the story", beat: { title: "Beat title" } },
    exports: { scenes: "Scenes" },
  },
};

const manifest: JsonObject = {
  manifest: 1,
  schema: {
    type: "object",
    title: "schema.title",
    properties: {
      beats: { type: "array", description: "schema.beats", items: { $ref: "#/$defs/beat" } },
    },
    default: { beats: [] },
    $defs: {
      beat: { type: "object", properties: { title: { type: "string", title: "schema.beat.title" } } },
    },
  },
  exports: {
    scenes: { name: "exports.scenes", select: "$.beats[*].scenes[*]", id: "/id", label: "/title" },
  },
};

// The rule of a composer: its scenes in order, across beats, each with its cells.
const order = {
  rule: "sequence",
  steps: { select: "$.beats[*].scenes[*]", id: "/id", target: "scenes" },
  parts: { select: "$.cells[*]", id: "/layer" },
} satisfies LinkRule;

/** Checks the valid manifest with edits applied. */
const check = (...edits: Edit[]) => checkManifest(edit(manifest, ...edits), english);

const ruled = edit(manifest, ["/links", { order }]);

/** Checks the valid manifest with the rule, and edits applied. */
const checkRuled = (...edits: Edit[]) => checkManifest(edit(ruled, ...edits), english);

describe("checkManifest", () => {
  it("accepts a valid manifest", () => {
    expect(check()).toEqual([]);
  });

  it("accepts the reserved member", () => {
    expect(check(["/aiSchema", { type: "object" }])).toEqual([]);
  });

  const shapes: [name: string, edits: Edit[], problem: string][] = [
    ["another format version", [["/manifest", 2]], "/manifest: Instance does not match 1."],
    ["no exports", [["/exports"]], '/: Missing required property "exports".'],
    ["a schema that is no object", [["/schema", []]], '/schema: Instance type "array" is invalid. Expected "object".'],
    ["an export without a label", [["/exports/scenes/label"]], '/exports/scenes: Missing required property "label".'],
    ["an unknown member", [["/migration", true]], "/migration: False boolean schema."],
    ["an AI context", [["/aiContext", "The story so far."]], "/aiContext: False boolean schema."],
    ["an unknown export member", [["/exports/scenes/path", "$"]], "/exports/scenes/path: False boolean schema."],
    [
      "an export name that holds a slash",
      [["/exports/acts~1scenes", { name: "exports.scenes", select: "$", id: "/id", label: "/title" }]],
      "/exports/acts~1scenes: String does not match pattern.",
    ],
  ];

  it.each(shapes)("refuses %s", (_, edits, problem) => {
    expect(check(...edits)).toEqual([problem]);
  });

  it("accepts a manifest without rules, and one with none", () => {
    expect(manifest).not.toHaveProperty("links");
    expect(check()).toEqual([]);
    expect(check(["/links", {}])).toEqual([]);
  });

  it("accepts a rule, with or without parts", () => {
    expect(checkRuled()).toEqual([]);
    expect(checkRuled(["/links/order/parts"])).toEqual([]);
  });

  const rules: [name: string, edits: Edit[], problem: string][] = [
    ["rules that are no object", [["/links", []]], '/links: Instance type "array" is invalid. Expected "object".'],
    [
      "a rule of a kind outside the list",
      [["/links/order/rule", "graph"]],
      '/links/order/rule: Instance does not match "sequence".',
    ],
    ["a rule without a kind", [["/links/order/rule"]], '/links/order: Missing required property "rule".'],
    ["a rule without steps", [["/links/order/steps"]], '/links/order: Missing required property "steps".'],
    [
      "steps without a target",
      [["/links/order/steps/target"]],
      '/links/order/steps: Missing required property "target".',
    ],
    ["parts without an identifier", [["/links/order/parts/id"]], '/links/order/parts: Missing required property "id".'],
    ["an unknown rule member", [["/links/order/label", "/title"]], "/links/order/label: False boolean schema."],
    [
      "parts with a target of their own",
      [["/links/order/parts/target", "cells"]],
      "/links/order/parts/target: False boolean schema.",
    ],
    [
      "a target that holds a slash",
      [["/links/order/steps/target", "beats/scenes"]],
      "/links/order/steps/target: String does not match pattern.",
    ],
  ];

  it.each(rules)("refuses %s", (_, edits, problem) => {
    expect(checkRuled(...edits)).toEqual([problem]);
  });

  it.each(["steps", "parts"])("refuses the JSON Pointer of %s that is none", (member) => {
    expect(checkRuled([`/links/order/${member}/id`, "id"])).toEqual([
      `/links/order/${member}/id: String does not match pattern.`,
    ]);
  });

  const asExport: [name: string, member: string, value: string, expected: string][] = [
    ["other items", "select", "$.beats[*]", "$.beats[*].scenes[*]"],
    ["another identifier", "id", "/key", "/id"],
  ];

  it.each(asExport)("refuses steps addressed as an export that read %s", (_, member, value, expected) => {
    expect(checkRuled([`/links/order/steps/${member}`, value])).toEqual([
      `/links/order/steps/${member}: steps addressed as the export "scenes" take its ${member}, "${expected}".`,
    ]);
  });

  it.each(["moments", "constructor"])("lets steps addressed as %s, which is no export, select freely", (target) => {
    const steps = { select: "$.moments[*]", id: "/key", target };

    expect(checkRuled(["/links/order/steps", steps])).toEqual([]);
  });

  it("refuses a manifest that is no object", () => {
    expect(checkManifest(null, english)).toEqual(['/: Instance type "null" is invalid. Expected "object".']);
  });

  it.each(["$", "$.beats", "$[*]", "$.a_b[*][*].c9"])("accepts the export path %s", (select) => {
    expect(check(["/exports/scenes/select", select])).toEqual([]);
  });

  const outsideSubset = [
    "$..scenes[*]",
    "$..*..*..*..*..*..*..*..*..*..*",
    "$.beats[?@.id=='b-0']",
    "$.beats[?match(@.title, '(a*)*b')]",
    "$" + "[?@".repeat(2000) + ".a" + "]".repeat(2000),
    "beats[*]",
    "$.beats[",
    "$.beats[0]",
    "$['beats']",
    "$.*",
    "$.beats.scenes-list",
  ];

  it.each(outsideSubset.map((select) => [select.slice(0, 40), select]))("refuses the export path %s", (_, select) => {
    expect(check(["/exports/scenes/select", select])).toEqual([
      "/exports/scenes/select: String does not match pattern.",
    ]);
    expect(() => listExports({ scenes: { name: "", select, id: "/id", label: "/title" } }, {})).toThrow(RangeError);
  });

  it.each(outsideSubset.map((select) => [select.slice(0, 40), select]))("refuses the rule path %s", (_, select) => {
    // Steps under a name of their own, which no export holds to its path.
    const steps = { select, id: "/id", target: "moments" };

    expect(checkRuled(["/links/order/steps", steps], ["/links/order/parts/select", select])).toEqual([
      "/links/order/steps/select: String does not match pattern.",
      "/links/order/parts/select: String does not match pattern.",
    ]);
    expect(() => listDynamicLinks({ order: { rule: "sequence", steps } }, {}, "moments/m-0", 1)).toThrow(RangeError);
    expect(() => checkRules({ order: { ...order, parts: { select, id: "/id" } } }, generate(5000))).toThrow(RangeError);
  });

  it.each(["", "/id", "/a/0/b~0c~1d"])("accepts the JSON Pointer %j", (pointer) => {
    expect(check(["/exports/scenes/id", pointer], ["/exports/scenes/label", pointer])).toEqual([]);
  });

  it.each(["id", "#/id", "/a~2", "/a~"])("refuses %j as a JSON Pointer", (pointer) => {
    expect(check(["/exports/scenes/id", pointer], ["/exports/scenes/label", pointer])).toEqual([
      "/exports/scenes/id: String does not match pattern.",
      "/exports/scenes/label: String does not match pattern.",
    ]);
  });

  it.each(["#", "#/$defs/beat", "#beat"])("accepts the local reference %s", (ref) => {
    expect(check(["/schema/$defs/beat/$anchor", "beat"], ["/schema/properties/first", { $ref: ref }])).toEqual([]);
  });

  it.each(["https://example.com/beat.json", "beat.json#/$defs/beat", 5])("refuses the reference %j", (ref) => {
    expect(check(["/schema/properties/first", { $ref: ref }])).toContain(
      '/schema/properties/first/$ref: a reference stays inside the schema, starting with "#".'
    );
  });

  it.each(["$dynamicRef", "$dynamicAnchor", "format"])("refuses a subschema that uses %s", (keyword) => {
    expect(check(["/schema/$defs/beat/properties/title/" + keyword, "date"])).toEqual([
      `/schema/$defs/beat/properties/title/${keyword}: a plugin schema cannot use "${keyword}".`,
    ]);
  });

  it("reads a property named after a keyword, and the content of a value, as data", () => {
    const data = { $ref: "https://example.com", format: "date", $dynamicRef: "#a", title: 5 };
    const problems = check(
      ["/schema/properties/format", { type: "string" }],
      ["/schema/properties/$ref", { type: "string" }],
      ["/schema/properties/title", { type: "string" }],
      ["/schema/properties/first", { default: data, const: data, enum: [data], examples: [data] }]
    );

    expect(problems).toEqual([]);
  });

  const single = [
    "additionalItems",
    "additionalProperties",
    "contains",
    "contentSchema",
    "else",
    "if",
    "items",
    "not",
    "propertyNames",
    "then",
    "unevaluatedItems",
    "unevaluatedProperties",
  ];
  const lists = ["allOf", "anyOf", "oneOf", "prefixItems", "items"];
  const maps = ["$defs", "definitions", "dependencies", "dependentSchemas", "patternProperties", "properties"];
  const nested: [at: string, keyword: string, value: JsonObject | JsonObject[]][] = [
    ...single.map((keyword): [string, string, JsonObject] => [keyword, keyword, { format: "date" }]),
    ...lists.map((keyword): [string, string, JsonObject[]] => [`${keyword}/1`, keyword, [{}, { format: "date" }]]),
    ...maps.map((keyword): [string, string, JsonObject] => [`${keyword}/a`, keyword, { a: { format: "date" } }]),
  ];

  it.each(nested)("finds the subschema at %s", (at, keyword, value) => {
    expect(check(["/schema/properties/first", { [keyword]: value }])).toContain(
      `/schema/properties/first/${at}/format: a plugin schema cannot use "format".`
    );
  });

  it("refuses a schema without a default", () => {
    expect(check(["/schema/default"])).toEqual([
      "/schema/default: a schema needs a default, the content of a new instance.",
    ]);
  });

  it("refuses a default that is not valid against the schema", () => {
    expect(check(["/schema/default", { beats: [{ title: 5 }] }])).toEqual([
      '/schema/default/beats/0/title: Instance type "number" is invalid. Expected "string".',
    ]);
  });

  it("reports a schema that cannot be evaluated", () => {
    const problems = check(
      ["/schema/properties/beats/items/$ref", "#/$defs/missing"],
      ["/schema/default", { beats: [{}] }]
    );

    expect(problems).toEqual([expect.stringMatching(/^\/schema: Unresolved \$ref "#\/\$defs\/missing"\./)]);
  });

  const keys: [name: string, edits: Edit[], problem: string][] = [
    [
      "the title of the schema",
      [["/schema/title", "schema.name"]],
      '/schema/title: "schema.name" is not a key of the English messages.',
    ],
    [
      "the description of a property",
      [["/schema/properties/beats/description", "schema.beat"]],
      '/schema/properties/beats/description: "schema.beat" is not a key of the English messages.',
    ],
    [
      "the title of a nested subschema",
      [["/schema/$defs/beat/properties/title/title", "Beat title"]],
      '/schema/$defs/beat/properties/title/title: "Beat title" is not a key of the English messages.',
    ],
    ["a title that is no string", [["/schema/title", 5]], "/schema/title: 5 is not a key of the English messages."],
    [
      "the name of an export",
      [["/exports/scenes/name", "Scenes"]],
      '/exports/scenes/name: "Scenes" is not a key of the English messages.',
    ],
  ];

  it.each(keys)("refuses %s when it is no translation key", (_, edits, problem) => {
    expect(check(...edits)).toEqual([problem]);
  });

  it("finds no key in English messages that are no object", () => {
    expect(checkManifest(manifest, null)).toHaveLength(4);
  });

  it("leaves the translation keys unchecked without English messages", () => {
    expect(checkManifest(manifest)).toEqual([]);
    expect(checkManifest(edit(manifest, ["/schema/default"]))).toHaveLength(1);
  });
});

describe("checkMessages", () => {
  const french = {
    title: "Compositeur de scènes",
    description: "Découpe une histoire en temps forts et en scènes.",
    messages: {
      schema: { title: "Compositeur", beats: "Les temps forts de l’histoire", beat: { title: "Titre du temps fort" } },
      exports: { scenes: "Scènes" },
    },
  };

  it("accepts English as its own translation", () => {
    expect(checkMessages(english, english)).toEqual([]);
  });

  it("accepts a translation with the keys of English", () => {
    expect(checkMessages(english, french)).toEqual([]);
  });

  it("refuses a language that is no object", () => {
    expect(checkMessages(english, [french])).toEqual(["/: a language is an object."]);
  });

  it("refuses an empty or missing title and description", () => {
    expect(checkMessages(english, { ...french, title: "", description: undefined })).toEqual([
      "/title: a language needs a non-empty title.",
      "/description: a language needs a non-empty description.",
    ]);
  });

  it.each([5, null, ["Les temps forts"]])("refuses the translation %j, which is no string", (beats) => {
    const messages = { ...french.messages, schema: { ...french.messages.schema, beats } };

    expect(checkMessages(english, { ...french, messages })).toEqual([
      "/messages/schema/beats: a translation is a string.",
    ]);
  });

  it("refuses messages that are no object", () => {
    expect(
      checkMessages({ ...english, messages: { exports: { scenes: "Scenes" } } }, { ...french, messages: "" })
    ).toEqual([
      "/messages: the messages of a language are an object.",
      "/messages/exports/scenes: the translation is missing.",
    ]);
  });

  it("refuses a missing key and a key English does not have", () => {
    const messages = { schema: { title: "Compositeur", beats: "Temps forts", beat: {} }, exports: { scene: "Scène" } };

    expect(checkMessages(english, { ...french, messages })).toEqual([
      "/messages/schema/beat/title: the translation is missing.",
      "/messages/exports/scenes: the translation is missing.",
      "/messages/exports/scene: English has no such key.",
    ]);
  });

  it("refuses a string where English nests messages", () => {
    const messages = { ...french.messages, exports: "Scènes" };

    expect(checkMessages(english, { ...french, messages })).toEqual([
      "/messages/exports/scenes: the translation is missing.",
      "/messages/exports: English has no such key.",
    ]);
  });
});

describe("listExports", () => {
  const exports: Manifest["exports"] = {
    scenes: { name: "exports.scenes", select: "$.beats[*].scenes[*]", id: "/id", label: "/title" },
  };

  it("lists every selected item with its export, its identifier and its label", () => {
    const content = generate(50_000);
    const scenes = content.beats.flatMap((beat) => beat.scenes);

    expect(scenes).toHaveLength(24);
    expect(listExports(exports, content)).toEqual(
      scenes.map((scene) => ({ export: "scenes", id: scene.id, label: scene.title }))
    );
  });

  it("lists nothing on a content without the selected members", () => {
    expect(listExports(exports, { layers: [] })).toEqual([]);
    expect(listExports(exports, { beats: "none" })).toEqual([]);
    expect(listExports(exports, { beats: [["s-0"], null, { scenes: {} }] })).toEqual([]);
  });

  it("skips an item whose identifier is not a string", () => {
    const scenes: Json[] = [{ title: "No identifier" }, { id: 7, title: "A number" }, { id: "s-2", title: "Kept" }];

    expect(listExports(exports, { beats: [{ scenes }] })).toEqual([{ export: "scenes", id: "s-2", label: "Kept" }]);
  });

  it("gives an empty label to an item whose label is not a string", () => {
    const scenes: Json[] = [{ id: "s-0" }, { id: "s-1", title: 4 }];

    expect(listExports(exports, { beats: [{ scenes }] })).toEqual([
      { export: "scenes", id: "s-0", label: "" },
      { export: "scenes", id: "s-1", label: "" },
    ]);
  });

  it("reaches every member value of an object with [*], and the root with $", () => {
    const content = {
      id: "root",
      name: "Root",
      cast: { mara: { id: "c-0", name: "Mara" }, joss: { id: "c-1", name: "Joss" } },
    };
    const several: Manifest["exports"] = {
      characters: { name: "exports.characters", select: "$.cast[*]", id: "/id", label: "/name" },
      story: { name: "exports.story", select: "$", id: "/id", label: "/name" },
    };

    expect(listExports(several, content)).toEqual([
      { export: "characters", id: "c-0", label: "Mara" },
      { export: "characters", id: "c-1", label: "Joss" },
      { export: "story", id: "root", label: "Root" },
    ]);
  });

  it("reads the item itself through an empty pointer", () => {
    const tags: Manifest["exports"] = { tags: { name: "exports.tags", select: "$.tags[*]", id: "", label: "" } };

    expect(listExports(tags, { tags: ["night", 3, "road"] })).toEqual([
      { export: "tags", id: "night", label: "night" },
      { export: "tags", id: "road", label: "road" },
    ]);
  });

  it("reaches own members only", () => {
    const inherited: Manifest["exports"] = {
      constructor: { name: "", select: "$.constructor", id: "/name", label: "/name" },
      length: { name: "", select: "$.list.length", id: "", label: "" },
    };

    expect(listExports(inherited, { list: ["a"] })).toEqual([]);
  });

  it("refuses an identifier that is no JSON Pointer", () => {
    const broken: Manifest["exports"] = { scenes: { name: "", select: "$", id: "id", label: "/title" } };

    expect(() => listExports(broken, {})).toThrow(SyntaxError);
  });
});

// Four scenes in order, across two beats. The third one holds no cell.
const scenes = {
  beats: [
    {
      id: "b-0",
      scenes: [
        { id: "s-0", cells: [{ layer: "l-0" }, { layer: "l-1" }] },
        { id: "s-1", cells: [{ layer: "l-0" }] },
      ],
    },
    {
      id: "b-1",
      scenes: [
        { id: "s-2", cells: [] },
        { id: "s-3", cells: [{ layer: "l-1" }] },
      ],
    },
  ],
};

/** Reads the dynamic links of the composer's rule, as `<destination> <distance>`. */
function read(content: Json, source: string, distance: number, links: Manifest["links"] = { order }): string[] {
  return listDynamicLinks(links, content, source, distance).map((link) => `${link.destination} ${link.distance}`);
}

describe("listDynamicLinks", () => {
  it("lists the items within a distance of a part, each with the signed distance of its step", () => {
    expect(listDynamicLinks({ order }, scenes, "scenes/s-1/l-0", 1)).toEqual([
      { destination: "scenes/s-0", relationship: "order", distance: -1 },
      { destination: "scenes/s-0/l-0", relationship: "order", distance: -1 },
      { destination: "scenes/s-0/l-1", relationship: "order", distance: -1 },
      { destination: "scenes/s-1", relationship: "order", distance: 0 },
      { destination: "scenes/s-2", relationship: "order", distance: 1 },
    ]);
  });

  it("starts from a step as from one of its parts", () => {
    expect(read(scenes, "scenes/s-0", 0)).toEqual(["scenes/s-0/l-0 0", "scenes/s-0/l-1 0"]);
    expect(read(scenes, "scenes/s-0/l-1", 0)).toEqual(["scenes/s-0 0", "scenes/s-0/l-0 0"]);
    expect(read(scenes, "scenes/s-2", 0)).toEqual([]);
  });

  it("stops at both ends of the sequence", () => {
    expect(read(scenes, "scenes/s-0", 1)).toEqual([
      "scenes/s-0/l-0 0",
      "scenes/s-0/l-1 0",
      "scenes/s-1 1",
      "scenes/s-1/l-0 1",
    ]);
    expect(read(scenes, "scenes/s-3", 1)).toEqual(["scenes/s-2 -1", "scenes/s-3/l-1 0"]);
  });

  it("reaches the whole sequence at a distance that covers it, and nothing at one below zero", () => {
    expect(read(scenes, "scenes/s-3", Infinity)).toEqual([
      "scenes/s-0 -3",
      "scenes/s-0/l-0 -3",
      "scenes/s-0/l-1 -3",
      "scenes/s-1 -2",
      "scenes/s-1/l-0 -2",
      "scenes/s-2 -1",
      "scenes/s-3/l-1 0",
    ]);
    expect(read(scenes, "scenes/s-3", 2.5)).toEqual(read(scenes, "scenes/s-3", 2));
    expect(read(scenes, "scenes/s-3", -1)).toEqual([]);
    expect(read(scenes, "scenes/s-3", NaN)).toEqual([]);
  });

  it("derives the opposite link from the destination", () => {
    const content = generate(50_000);
    const [scene] = content.beats[2]!.scenes;
    const source = `scenes/${scene!.id}`;
    const found = listDynamicLinks({ order }, content, source, 2);

    expect(new Set(found.map(({ distance }) => distance))).toEqual(new Set([-2, -1, 0, 1, 2]));
    for (const { destination, distance } of found) {
      const opposite = { destination: source, relationship: "order", distance: -distance || 0 };

      expect(listDynamicLinks({ order }, content, destination, 2)).toContainEqual(opposite);
    }
  });

  it.each(["scenes/s-9", "scenes/s-0/l-9", "scenes/s-0/", "scenes/", "scenes", "beats/b-0", "s-0", ""])(
    "lists nothing for the address %j, which the rule does not read",
    (source) => {
      expect(read(scenes, source, 1)).toEqual([]);
    }
  );

  it("lists nothing without a rule, or on a content without the selected members", () => {
    expect(listDynamicLinks(undefined, scenes, "scenes/s-0", 1)).toEqual([]);
    expect(listDynamicLinks({}, scenes, "scenes/s-0", 1)).toEqual([]);
    expect(read({ beats: "none" }, "scenes/s-0", 1)).toEqual([]);
  });

  it("reads a rule without parts, whose steps are its only items", () => {
    const steps = { order: { rule: "sequence", steps: order.steps } } satisfies Manifest["links"];

    expect(read(scenes, "scenes/s-1", 1, steps)).toEqual(["scenes/s-0 -1", "scenes/s-2 1"]);
    expect(read(scenes, "scenes/s-1/l-0", 1, steps)).toEqual([]);
  });

  it("names each link after the rule that derives it", () => {
    const links: Manifest["links"] = {
      order,
      beat: { rule: "sequence", steps: { select: "$.beats[*]", id: "/id", target: "beats" } },
      scene: { rule: "sequence", steps: order.steps },
    };

    expect(listDynamicLinks(links, scenes, "scenes/s-3", 0)).toEqual([
      { destination: "scenes/s-3/l-1", relationship: "order", distance: 0 },
    ]);
    expect(listDynamicLinks(links, scenes, "scenes/s-3", 1)).toEqual([
      { destination: "scenes/s-2", relationship: "order", distance: -1 },
      { destination: "scenes/s-3/l-1", relationship: "order", distance: 0 },
      { destination: "scenes/s-2", relationship: "scene", distance: -1 },
    ]);
    expect(listDynamicLinks(links, scenes, "beats/b-1", 1)).toEqual([
      { destination: "beats/b-0", relationship: "beat", distance: -1 },
    ]);
  });

  it("tells a step from one whose identifier opens the same way", () => {
    const content: Json = {
      beats: [{ scenes: [{ id: "s-1" }, { id: "s-10", cells: [{ layer: "l-0" }] }, { id: "s-100" }] }],
    };

    expect(read(content, "scenes/s-10", 1)).toEqual(["scenes/s-1 -1", "scenes/s-10/l-0 0", "scenes/s-100 1"]);
    expect(read(content, "scenes/s-10/l-0", 0)).toEqual(["scenes/s-10 0"]);
  });

  it("skips a step without a text identifier, which takes no position", () => {
    const unnamed: Json[] = [{ id: "s-0" }, { cells: [{ layer: "l-0" }] }, { id: 7 }, { id: "s-1" }];

    expect(read({ beats: [{ scenes: unnamed }] }, "scenes/s-0", 1)).toEqual(["scenes/s-1 1"]);
  });

  it("skips a step that shares its identifier with an earlier one", () => {
    const twice: Json[] = [
      { id: "s-0", cells: [{ layer: "l-0" }] },
      { id: "s-1" },
      { id: "s-0", cells: [{ layer: "l-1" }] },
      { id: "s-2" },
    ];

    expect(read({ beats: [{ scenes: twice }] }, "scenes/s-1", 1)).toEqual([
      "scenes/s-0 -1",
      "scenes/s-0/l-0 -1",
      "scenes/s-2 1",
    ]);
  });

  it("skips a part without a text identifier, and one that shares its identifier inside its step", () => {
    const cells: Json[] = [{ layer: "l-0" }, {}, { layer: 3 }, { layer: "l-0" }, { layer: "l-1" }];

    expect(read({ beats: [{ scenes: [{ id: "s-0", cells }] }] }, "scenes/s-0", 0)).toEqual([
      "scenes/s-0/l-0 0",
      "scenes/s-0/l-1 0",
    ]);
  });

  it("reads the parts of the steps within the distance alone", () => {
    const opened = new Set<string>();
    // 150 steps relate more than 20,000 pairs of them.
    const many = Array.from({ length: 150 }, (_, index) => ({
      id: `s-${index}`,
      get cells() {
        opened.add(this.id);

        return [{ layer: "l-0" }];
      },
    }));

    expect(read({ beats: [{ scenes: many }] }, "scenes/s-75/l-0", 1)).toHaveLength(5);
    expect(opened).toEqual(new Set(["s-74", "s-75", "s-76"]));
  });

  it("refuses an identifier that is no JSON Pointer", () => {
    const broken: Manifest["links"] = { order: { rule: "sequence", steps: { ...order.steps, id: "id" } } };

    expect(() => listDynamicLinks(broken, scenes, "scenes/s-0", 1)).toThrow(SyntaxError);
  });
});

describe("checkRules", () => {
  it("lists nothing when every step and every part has an address", () => {
    expect(checkRules({ order }, scenes)).toEqual([]);
    expect(checkRules({ order }, generate(50_000))).toEqual([]);
    expect(checkRules({ order }, { layers: [] })).toEqual([]);
  });

  it("lists nothing without a rule", () => {
    expect(checkRules(undefined, { beats: [{ scenes: [{}, {}] }] })).toEqual([]);
  });

  it("lists each step without a text identifier, at the place of its identifier", () => {
    const unnamed: Json[] = [{ id: "s-0" }, {}, { id: 7 }];

    expect(checkRules({ order }, { beats: [{ scenes: [] }, { scenes: unnamed }] })).toEqual([
      '/beats/1/scenes/1/id: a step of the rule "order" has no text identifier.',
      '/beats/1/scenes/2/id: a step of the rule "order" has no text identifier.',
    ]);
  });

  it("lists each step that shares its identifier with an earlier one, in another beat too", () => {
    const content = { beats: [{ scenes: [{ id: "s-0" }, { id: "s-1" }] }, { scenes: [{ id: "s-0" }] }] };

    expect(checkRules({ order }, content)).toEqual([
      '/beats/1/scenes/0/id: a step of the rule "order" shares the identifier "s-0" with an earlier one.',
    ]);
  });

  it("lists each part without a text identifier, and each that shares one inside its step", () => {
    const cells: Json[] = [{ layer: "l-0" }, {}, { layer: 3 }, { layer: "l-0" }];
    const content = {
      beats: [
        {
          scenes: [
            { id: "s-0", cells },
            { id: "s-1", cells: [{ layer: "l-0" }] },
          ],
        },
      ],
    };

    expect(checkRules({ order }, content)).toEqual([
      '/beats/0/scenes/0/cells/1/layer: a part of one step of the rule "order" has no text identifier.',
      '/beats/0/scenes/0/cells/2/layer: a part of one step of the rule "order" has no text identifier.',
      '/beats/0/scenes/0/cells/3/layer: a part of one step of the rule "order" shares the identifier "l-0" with an earlier one.',
    ]);
  });

  it("leaves the parts of a step it cannot address unread", () => {
    const content = { beats: [{ scenes: [{ cells: [{}, {}] }] }] };

    expect(checkRules({ order }, content)).toEqual([
      '/beats/0/scenes/0/id: a step of the rule "order" has no text identifier.',
    ]);
  });

  it("names the rule of each problem", () => {
    const links: Manifest["links"] = {
      order,
      beat: { rule: "sequence", steps: { select: "$.beats[*]", id: "/id", target: "beats" } },
    };

    expect(checkRules(links, { beats: [{ id: "b-0", scenes: [{}] }, { id: "b-0" }] })).toEqual([
      '/beats/0/scenes/0/id: a step of the rule "order" has no text identifier.',
      '/beats/1/id: a step of the rule "beat" shares the identifier "b-0" with an earlier one.',
    ]);
  });
});
