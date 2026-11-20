import { type Edit, edit, generate } from "./composer.fixture.js";
import type { Json, JsonObject } from "./json.js";
import { type Manifest, checkManifest, checkMessages, listExports } from "./manifest.js";

import { describe, expect, it } from "vitest";

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

/** Checks the valid manifest with edits applied. */
const check = (...edits: Edit[]) => checkManifest(edit(manifest, ...edits), english);

describe("checkManifest", () => {
  it("accepts a valid manifest", () => {
    expect(check()).toEqual([]);
  });

  it("accepts the reserved members", () => {
    expect(check(["/aiSchema", { type: "object" }], ["/aiContext", "The story so far."])).toEqual([]);
  });

  const shapes: [name: string, edits: Edit[], problem: string][] = [
    ["another format version", [["/manifest", 2]], "/manifest: Instance does not match 1."],
    ["no exports", [["/exports"]], '/: Missing required property "exports".'],
    ["a schema that is no object", [["/schema", []]], '/schema: Instance type "array" is invalid. Expected "object".'],
    ["an export without a label", [["/exports/scenes/label"]], '/exports/scenes: Missing required property "label".'],
    ["an unknown member", [["/migration", true]], "/migration: False boolean schema."],
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
