import { check } from "./check.js";
import { readPlugin } from "./folder.js";
import { SAMPLE, copySample } from "./sample.fixture.js";

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const read = (file: string) => readFileSync(join(SAMPLE, file), "utf8");

/** Checks a copy of the sample plugin with files replaced, added or removed. */
const checkWith = (files: Record<string, string | null>) => check(readPlugin(copySample(files)));

// A version 1.0.0 beat with a member that version 1.1.0 has no place for.
const moody = JSON.stringify([{ id: "opening", title: "Opening", mood: "tense" }]);
// A migration that keeps nothing of the content.
const lossy = "export default (content) => ({ migrated: { beats: [] }, unmigrated: content });";

describe("check", () => {
  it("passes the sample plugin", async () => {
    expect(await check(readPlugin(SAMPLE))).toEqual([]);
  });

  it("passes a plugin without a migration or a fixture", async () => {
    expect(await checkWith({ migrations: null, fixtures: null, "versions/1.0.0.yaml": null })).toEqual([]);
  });

  describe("the styles of the UI", () => {
    it("lists what breaks the token contract of the UI kit, under its file and its line", async () => {
      const problems = await checkWith({
        "ui/App.svelte":
          "<p>A beat</p>\n\n<style>\n  p {\n    color: var(--color-border-subtle);\n    font-size: 14px;\n  }\n</style>\n",
      });

      expect(problems).toEqual([
        "ui/App.svelte:5: unknown token: color: var(--color-border-subtle) (nothing defines --color-border-subtle)",
        "ui/App.svelte:6: text style: font-size: 14px (a text style sets it, with font: var(--text-*))",
      ]);
    });

    it("throws when the check does not run, as in a plugin without a UI", async () => {
      await expect(checkWith({ ui: null })).rejects.toThrow(/^ui: the token contract check did not run\./);
    });
  });

  describe("the manifests and the languages", () => {
    it("needs the English messages", async () => {
      expect(await checkWith({ "i18n/en.json": null })).toEqual(["i18n/en.json: a plugin needs its English messages."]);
    });

    it("lists the problems of every language and every manifest under their file", async () => {
      const problems = await checkWith({
        "i18n/en.json": read("i18n/en.json").replace('"title": "Sample"', '"title": ""'),
        "i18n/fr.json": read("i18n/fr.json").replace('"add": "Ajouter le temps fort"', '"more": "Plus"'),
        "versions/1.0.0.yaml": read("versions/1.0.0.yaml").replace("default: []", "default: {}"),
        "versions/1.1.0.yaml": read("versions/1.1.0.yaml").replace("name: exports.beats", "name: exports.scenes"),
      });

      expect(problems).toEqual([
        "i18n/en.json: /title: a language needs a non-empty title.",
        "i18n/fr.json: /messages/add: the translation is missing.",
        "i18n/fr.json: /messages/more: English has no such key.",
        'versions/1.0.0.yaml: /schema/default: Instance type "object" is invalid. Expected "array".',
        'versions/1.1.0.yaml: /exports/beats/name: "exports.scenes" is not a key of the English messages.',
      ]);
    });

    it("lets a past version name a translation key English no longer has", async () => {
      const problems = await checkWith({
        "versions/1.0.0.yaml": read("versions/1.0.0.yaml").replace("name: exports.beats", "name: exports.scenes"),
      });

      expect(problems).toEqual([]);
    });

    it("replays no fixture while a manifest has a problem", async () => {
      const problems = await checkWith({
        "versions/1.1.0.yaml": read("versions/1.1.0.yaml").replace("manifest: 1", "manifest: 2"),
        "fixtures/1.1.0/outline.json": "[]",
      });

      expect(problems).toEqual(["versions/1.1.0.yaml: /manifest: Instance does not match 1."]);
    });
  });

  describe("the fixtures", () => {
    it("refuses a fixture that is invalid against its own version", async () => {
      const problems = await checkWith({
        "fixtures/1.1.0/outline.json": '{ "beats": [{ "id": 1, "title": "Opening" }] }',
      });

      expect(problems).toEqual([
        'fixtures/1.1.0/outline.json: /beats/0/id: Instance type "number" is invalid. Expected "string".',
      ]);
    });

    it("refuses a step inside a major version that moves content aside", async () => {
      expect(await checkWith({ "fixtures/1.0.0/moody.json": moody })).toEqual([
        "fixtures/1.0.0/moody.json: version 1.1.0 loses /beats/0/mood inside a major version.",
      ]);
    });

    it("refuses a migration inside a major version that sets content aside", async () => {
      expect(await checkWith({ "migrations/1.1.0.ts": lossy })).toEqual([
        "fixtures/1.0.0/outline.json: version 1.1.0 loses what its migration set aside inside a major version.",
      ]);
    });

    it("lets the step into a new major version lose content", async () => {
      const problems = await checkWith({
        "versions/1.1.0.yaml": null,
        "versions/2.0.0.yaml": read("versions/1.1.0.yaml"),
        "migrations/1.1.0.ts": null,
        "migrations/2.0.0.ts": lossy,
        "fixtures/1.1.0": null,
        "fixtures/1.0.0/moody.json": moody,
      });

      expect(problems).toEqual([]);
    });

    it("refuses a loss inside a major version that follows a new major version", async () => {
      const problems = await checkWith({
        "versions/2.0.0.yaml": read("versions/1.1.0.yaml"),
        "versions/2.1.0.yaml": read("versions/1.1.0.yaml"),
        "migrations/2.1.0.ts": lossy,
      });

      expect(problems).toEqual([
        "fixtures/1.0.0/outline.json: version 2.1.0 loses what its migration set aside inside a major version.",
        "fixtures/1.1.0/outline.json: version 2.1.0 loses what its migration set aside inside a major version.",
        "fixtures/1.1.0/scenes.json: version 2.1.0 loses what its migration set aside inside a major version.",
      ]);
    });

    it("refuses a step that cannot take the content", async () => {
      expect(await checkWith({ "migrations/1.1.0.ts": null })).toEqual([
        'fixtures/1.0.0/outline.json: version 1.1.0 cannot take the content: Instance type "array" is invalid. Expected "object".',
      ]);
    });

    it("refuses a migration that throws", async () => {
      const throwing = 'export default () => { throw new Error("No beat to read."); };';

      expect(await checkWith({ "migrations/1.1.0.ts": throwing })).toEqual([
        "fixtures/1.0.0/outline.json: the upgrade threw: No beat to read.",
      ]);
    });
  });

  describe("the rules", () => {
    const manifest = read("versions/1.1.0.yaml");
    // Two beats with one identifier, and a beat whose two scenes share one.
    const twice = JSON.stringify({
      beats: [
        { id: "opening", title: "Opening", scenes: [{ id: "harbor", title: "The harbor" }] },
        { id: "opening", title: "Opening again" },
        {
          id: "finale",
          title: "Finale",
          scenes: [
            { id: "shore", title: "The shore" },
            { id: "shore", title: "The tide" },
          ],
        },
      ],
    });

    it("passes a plugin that declares no rule", async () => {
      const [exports] = manifest.split("links:");

      expect(exports).toContain("exports:");
      expect(await checkWith({ "versions/1.1.0.yaml": exports! })).toEqual([]);
    });

    const refused: [name: string, written: string, edited: string, problem: string][] = [
      [
        "a rule of a kind outside the list",
        "rule: sequence",
        "rule: graph",
        '/links/order/rule: Instance does not match "sequence".',
      ],
      [
        "steps with a path outside the subset",
        'steps: { select: "$.beats[*]"',
        'steps: { select: "$..beats[*]"',
        "/links/order/steps/select: String does not match pattern.",
      ],
      [
        "parts with a path outside the subset",
        'parts: { select: "$.scenes[*]"',
        'parts: { select: "$.scenes[0]"',
        "/links/order/parts/select: String does not match pattern.",
      ],
      [
        "steps addressed as an export that read other items",
        'steps: { select: "$.beats[*]"',
        'steps: { select: "$.beats[*].scenes[*]"',
        '/links/order/steps/select: steps addressed as the export "beats" take its select, "$.beats[*]".',
      ],
    ];

    it.each(refused)("refuses %s, with the place of the problem", async (_, written, edited, problem) => {
      expect(manifest).toContain(written);
      expect(await checkWith({ "versions/1.1.0.yaml": manifest.replace(written, edited) })).toEqual([
        `versions/1.1.0.yaml: ${problem}`,
      ]);
    });

    it("refuses a fixture where two steps share an identifier, or two parts of one step", async () => {
      expect(await checkWith({ "fixtures/1.1.0/twice.json": twice })).toEqual([
        'fixtures/1.1.0/twice.json: /beats/1/id: a step of the rule "order" shares the identifier "opening" with an earlier one.',
        'fixtures/1.1.0/twice.json: /beats/2/scenes/1/id: a part of one step of the rule "order" shares the identifier "shore" with an earlier one.',
      ]);
    });

    it("refuses a fixture where a part has no text identifier", async () => {
      const written = 'parts: { select: "$.scenes[*]", id: /id }';
      const scene =
        '{ "beats": [{ "id": "opening", "title": "Opening", "scenes": [{ "id": "harbor", "title": "" }] }] }';

      expect(manifest).toContain(written);
      const problems = await checkWith({
        "versions/1.1.0.yaml": manifest.replace(written, 'parts: { select: "$.scenes[*]", id: /key }'),
        "fixtures/1.1.0/scenes.json": scene,
      });

      expect(problems).toEqual([
        'fixtures/1.1.0/scenes.json: /beats/0/scenes/0/key: a part of one step of the rule "order" has no text identifier.',
      ]);
    });

    it("refuses a fixture that keeps its steps in an object", async () => {
      const keyed = [
        "manifest: 1",
        "schema: { type: object, default: { beats: {} } }",
        "exports: {}",
        "links:",
        "  order:",
        "    rule: sequence",
        '    steps: { select: "$.beats[*]", id: /id, target: beats }',
        "",
      ].join("\n");
      const problems = await checkWith({
        "versions/1.2.0.yaml": keyed,
        "fixtures/1.2.0/keyed.json": '{ "beats": { "opening": { "id": "opening" } } }',
      });

      expect(problems).toEqual([
        'fixtures/1.2.0/keyed.json: /beats: the steps of the rule "order" are the items of an array, and an object keeps its members in no order.',
      ]);
    });

    it("reads the fixtures of each version through the rules of that version", async () => {
      const [ruleless] = manifest.split("links:");
      const problems = await checkWith({
        "versions/1.2.0.yaml": ruleless!,
        "fixtures/1.1.0/twice.json": twice,
        "fixtures/1.2.0/twice.json": twice,
      });

      expect(problems).toEqual([
        'fixtures/1.1.0/twice.json: /beats/1/id: a step of the rule "order" shares the identifier "opening" with an earlier one.',
        'fixtures/1.1.0/twice.json: /beats/2/scenes/1/id: a part of one step of the rule "order" shares the identifier "shore" with an earlier one.',
      ]);
    });
  });

  it("rejects a migration that exports no function", async () => {
    await expect(checkWith({ "migrations/1.1.0.ts": "export default 1;" })).rejects.toThrow(
      "migrations/1.1.0.ts: a migration exports a function by default."
    );
  });
});
