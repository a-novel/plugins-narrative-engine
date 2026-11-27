import english from "../i18n/en.json" with { type: "json" };
import { countingIds, largeContent, serialize } from "./content.fixture.ts";
import type { Beat, Content, Dialogue, Layer, LoglineCell, NotesCell, Scene, ScriptCell } from "./content.ts";
import { MANIFEST } from "./manifest.fixture.ts";
import { preset } from "./presets.ts";

import { describe, expect, it } from "vitest";

import { type Json, validateJson } from "@a-novel-kit/nodelib-json";
import { listExports } from "@a-novel/plugins-narrative-engine-kit";

/** Lists where the schema refuses a content, as JSON Pointers. */
const refusals = (content: Json) => validateJson(MANIFEST.schema, content).map(({ path }) => path);

/** Builds a content with one item of each sort: a beat, a scene, and a layer and a cell of each kind. */
function sample() {
  const nextId = countingIds();
  const [notes, logline, script, link] = [nextId(), nextId(), nextId(), nextId()];

  const notesCell: NotesCell = { kind: "notes", layer: notes, text: "Mara, the keeper.\nNight." };
  const loglineCell: LoglineCell = { kind: "logline", layer: logline, text: "Mara waits for a passenger." };
  const dialogue: Dialogue = { kind: "dialogue", speaker: "Mara", tone: "under her breath", text: "You came." };
  const scriptCell: ScriptCell = {
    kind: "script",
    layer: script,
    blocks: [{ kind: "narration", text: "Rain fell on the harbor.\n\nNobody came." }, dialogue],
  };

  const scene: Scene = {
    id: nextId(),
    title: "The last ferry",
    description: "A quay, at night.",
    width: 64,
    cells: [notesCell, loglineCell, scriptCell],
  };
  const beat: Beat = { id: nextId(), title: "Setup", description: "", scenes: [scene] };
  const linkLayer: Layer = {
    id: link,
    kind: "link",
    name: "Callbacks",
    color: "#F59E0B",
    height: 24,
    accepts: ["scenes"],
  };

  const content: Content = {
    beats: [beat],
    layers: [
      { id: notes, kind: "notes", name: "Characters" },
      { id: logline, kind: "logline", name: "Scenes" },
      { id: script, kind: "script", name: "Enriched scenes" },
      linkLayer,
    ],
  };

  return { content, beat, scene, notesCell, loglineCell, scriptCell, dialogue, linkLayer };
}

describe("the schema", () => {
  it("accepts a beat, a scene, and a layer and a cell of each kind", () => {
    expect(refusals(sample().content)).toEqual([]);
  });

  it("accepts a large content, and keeps it as a fixture: 200 scenes under 10 layers", async () => {
    const content = largeContent();

    expect(content.layers).toHaveLength(10);
    expect(content.beats.flatMap(({ scenes }) => scenes)).toHaveLength(200);
    expect(refusals(content)).toEqual([]);
    await expect(serialize(content)).toMatchFileSnapshot("../fixtures/1.0.0/large.json");
  });

  it("keeps its default as a fixture", async () => {
    await expect(serialize(MANIFEST.schema.default)).toMatchFileSnapshot("../fixtures/1.0.0/default.json");
  });

  it("starts a composer with the layers a preset gives, under their English names", () => {
    const withoutId = ({ layers }: Content) => layers.map((layer) => ({ ...layer, id: undefined }));

    expect(withoutId(MANIFEST.schema.default as Content)).toEqual(withoutId(preset("blank", english.messages)));
  });

  // Each case breaks one rule of the sample, and names where the schema refuses it.
  it.each<[string, (parts: ReturnType<typeof sample>) => void, string]>([
    ["an ID that is not a UUID", ({ beat }) => (beat.id = "setup"), "/beats/0/id"],
    ["an ID in capitals", ({ scene }) => (scene.id = crypto.randomUUID().toUpperCase()), "/beats/0/scenes/0/id"],
    ["a color by its name", ({ linkLayer }) => (linkLayer.color = "red"), "/layers/3/color"],
    ["a color of three digits", ({ linkLayer }) => (linkLayer.color = "#f90"), "/layers/3/color"],
    ["a color on a beat", ({ beat }) => Object.assign(beat, { color: "#e11d48" }), "/beats/0/color"],
    ["a width that is not a whole number", ({ scene }) => (scene.width = 48.5), "/beats/0/scenes/0/width"],
    ["a width under the least", ({ scene }) => (scene.width = 31), "/beats/0/scenes/0/width"],
    ["a width over the most", ({ scene }) => (scene.width = 241), "/beats/0/scenes/0/width"],
    ["a height under the least", ({ linkLayer }) => (linkLayer.height = 7), "/layers/3/height"],
    ["a height over the most", ({ linkLayer }) => (linkLayer.height = 161), "/layers/3/height"],
    ["a title on two lines", ({ scene }) => (scene.title = "The last\nferry"), "/beats/0/scenes/0/title"],
    [
      "a logline on two lines",
      ({ loglineCell }) => (loglineCell.text = "Mara waits.\nNobody comes."),
      "/beats/0/scenes/0/cells/1/text",
    ],
    [
      "a notes cell that holds blocks",
      ({ notesCell }) => Object.assign(notesCell, { blocks: [] }),
      "/beats/0/scenes/0/cells/0/blocks",
    ],
    [
      "a cell of a link layer",
      ({ notesCell, linkLayer }) => Object.assign(notesCell, { kind: "link", layer: linkLayer.id }),
      "/beats/0/scenes/0/cells/0",
    ],
    [
      "a dialogue with an empty tone",
      ({ dialogue }) => (dialogue.tone = ""),
      "/beats/0/scenes/0/cells/2/blocks/1/tone",
    ],
    [
      "a dialogue without a speaker",
      ({ dialogue }) => delete (dialogue as Partial<Dialogue>).speaker,
      "/beats/0/scenes/0/cells/2/blocks/1",
    ],
    [
      "a block of another kind",
      ({ scriptCell }) => Object.assign(scriptCell.blocks[0]!, { kind: "action" }),
      "/beats/0/scenes/0/cells/2/blocks/0",
    ],
    ["a layer of another kind", ({ linkLayer }) => Object.assign(linkLayer, { kind: "table" }), "/layers/3/kind"],
    ["an export name that holds a slash", ({ linkLayer }) => (linkLayer.accepts = ["scenes/1"]), "/layers/3/accepts/0"],
    ["a member it does not describe", ({ beat }) => Object.assign(beat, { act: 1 }), "/beats/0/act"],
  ])("refuses %s", (_, breakRule, path) => {
    const parts = sample();
    breakRule(parts);

    expect(refusals(parts.content)).toEqual([path]);
  });
});

describe("the scenes export", () => {
  it("lists every scene under its ID, with its title as a label", () => {
    const content = largeContent();
    const scenes = content.beats.flatMap(({ scenes }) => scenes);

    expect(listExports(MANIFEST.exports, content)).toEqual(
      scenes.map(({ id, title }) => ({ export: "scenes", id, label: title }))
    );
  });
});
