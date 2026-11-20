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

  it("rejects a migration that exports no function", async () => {
    await expect(checkWith({ "migrations/1.1.0.ts": "export default 1;" })).rejects.toThrow(
      "migrations/1.1.0.ts: a migration exports a function by default."
    );
  });
});
