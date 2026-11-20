import { readPlugin } from "./folder.js";
import { SAMPLE, copySample } from "./sample.fixture.js";

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const manifest = readFileSync(join(SAMPLE, "versions/1.1.0.yaml"), "utf8");

describe("readPlugin", () => {
  it("reads the name, the versions and the languages of a plugin folder", () => {
    const plugin = readPlugin(SAMPLE);

    expect(plugin).toMatchObject({ path: SAMPLE, name: "sample", version: "1.1.0" });
    expect(Object.keys(plugin.languages)).toEqual(["en", "fr"]);
    expect(plugin.languages.fr).toMatchObject({ title: "Exemple" });

    const beats = [
      { id: "opening", title: "Opening" },
      { id: "midpoint", title: "Midpoint" },
    ];
    expect(plugin.versions).toEqual([
      {
        version: "1.0.0",
        manifest: expect.objectContaining({ manifest: 1, exports: expect.any(Object) }),
        fixtures: { "fixtures/1.0.0/outline.json": beats },
      },
      {
        version: "1.1.0",
        manifest: expect.objectContaining({ schema: expect.objectContaining({ default: { beats: [] } }) }),
        migration: "migrations/1.1.0.ts",
        fixtures: { "fixtures/1.1.0/outline.json": { beats } },
      },
    ]);
  });

  it("orders the versions by their numbers, and takes the highest as the current one", () => {
    const plugin = readPlugin(copySample({ "versions/1.9.0.yaml": manifest, "versions/1.10.0.yaml": manifest }));

    expect(plugin.versions.map(({ version }) => version)).toEqual(["1.0.0", "1.1.0", "1.9.0", "1.10.0"]);
    expect(plugin.version).toBe("1.10.0");
  });

  it("reads a plugin without a migration or a fixture", () => {
    const plugin = readPlugin(copySample({ migrations: null, fixtures: null, "versions/1.0.0.yaml": null }));

    expect(plugin.versions).toEqual([{ version: "1.1.0", manifest: expect.any(Object), fixtures: {} }]);
  });

  const refused: [name: string, files: Record<string, string | null>, error: string][] = [
    ["no manifest", { versions: null }, "versions: a plugin needs the manifest of one version at least."],
    [
      "a manifest that names no version",
      { "versions/next.yaml": manifest },
      "versions/next.yaml: a manifest is named after its version.",
    ],
    [
      "a version with a leading zero",
      { "versions/1.02.0.yaml": manifest },
      "versions/1.02.0.yaml: a manifest is named after its version.",
    ],
    [
      "a manifest with another extension",
      { "versions/1.2.0.yml": manifest },
      "versions/1.2.0.yml: expected a .yaml file.",
    ],
    [
      "a migration to a version without a manifest",
      { "migrations/2.0.0.ts": "export default (content) => ({ migrated: content });" },
      "migrations/2.0.0: no manifest declares this version.",
    ],
    [
      "fixtures of a version without a manifest",
      { "fixtures/0.9.0/outline.json": "[]" },
      "fixtures/0.9.0: no manifest declares this version.",
    ],
    [
      "a fixture that is not JSON",
      { "fixtures/1.1.0/notes.txt": "" },
      "fixtures/1.1.0/notes.txt: expected a .json file.",
    ],
  ];

  it.each(refused)("refuses %s", (_, files, error) => {
    expect(() => readPlugin(copySample(files))).toThrow(new Error(error));
  });

  it.each([
    ["a manifest", "versions/1.1.0.yaml", "schema: [unclosed"],
    ["a language", "i18n/fr.json", "{"],
  ])("names %s that cannot be parsed", (_, file, text) => {
    expect(() => readPlugin(copySample({ [file]: text }))).toThrow(new RegExp(`^${file}: .`));
  });
});
