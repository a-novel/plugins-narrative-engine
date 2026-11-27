import { readPlugin } from "./cli/folder.js";
import { SAMPLE } from "./cli/sample.fixture.js";
import * as kit from "./index.js";

import { describe, expect, it } from "vitest";

import * as contract from "@a-novel/plugins-narrative-engine-contract";

describe("the package entry", () => {
  it("exports the whole contract, and nothing else", () => {
    expect({ ...kit }).toEqual({ ...contract });
  });
});

// The acceptance of the rules: the sample plugin orders its beats, each with its scenes.
describe("the rule of the sample plugin", () => {
  const [past, current] = readPlugin(SAMPLE).versions;
  const { links } = current!.manifest as kit.Manifest;

  /** Reads the dynamic links of an item of a fixture of the current version, as `<destination> <distance>`. */
  function within(distance: number, source: string, fixture = "scenes"): string[] {
    const found = kit.listDynamicLinks(links, current!.fixtures[`fixtures/1.1.0/${fixture}.json`]!, source, distance);
    expect(new Set(found.map(({ relationship }) => relationship))).toEqual(new Set(found.length > 0 ? ["order"] : []));

    return found.map(({ destination, distance }) => `${destination} ${distance}`);
  }

  it("lists the items within distance 1 of a part: its step, the step before and the step after", () => {
    expect(within(1, "beats/midpoint/storm")).toEqual([
      "beats/opening -1",
      "beats/opening/harbor -1",
      "beats/opening/letter -1",
      "beats/midpoint 0",
      "beats/midpoint/wreck 0",
      "beats/finale 1",
      "beats/finale/shore 1",
    ]);
  });

  it("answers from a step with no part, and lists one", () => {
    expect(within(1, "beats/epilogue")).toEqual(["beats/finale -1", "beats/finale/shore -1"]);
    expect(within(1, "beats/finale/shore")).toEqual([
      "beats/midpoint -1",
      "beats/midpoint/storm -1",
      "beats/midpoint/wreck -1",
      "beats/finale 0",
      "beats/epilogue 1",
    ]);
    expect(within(1, "beats/midpoint", "outline")).toEqual(["beats/opening -1"]);
  });

  it("finds nothing before the first step", () => {
    expect(within(1, "beats/opening")).toEqual([
      "beats/opening/harbor 0",
      "beats/opening/letter 0",
      "beats/midpoint 1",
      "beats/midpoint/storm 1",
      "beats/midpoint/wreck 1",
    ]);
    expect(within(1, "beats/opening", "outline")).toEqual(["beats/midpoint 1"]);
  });

  it("derives nothing from a version without rules", () => {
    const { manifest, fixtures } = past!;

    expect(manifest).not.toHaveProperty("links");
    expect(
      kit.listDynamicLinks(
        (manifest as kit.Manifest).links,
        fixtures["fixtures/1.0.0/outline.json"]!,
        "beats/opening",
        1
      )
    ).toEqual([]);
  });
});
