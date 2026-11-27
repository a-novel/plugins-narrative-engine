import { countingIds } from "./content.fixture.ts";
import type { Content } from "./content.ts";
import {
  DEFAULT_WIDTH,
  LIMITS,
  addBeat,
  addLayer,
  addScene,
  deleteBeat,
  deleteCell,
  deleteLayer,
  deleteScene,
  editBeat,
  editLayer,
  editScene,
  resizeLayer,
  resizeScene,
  writeCell,
} from "./edits.ts";
import { MANIFEST } from "./manifest.fixture.ts";

import { describe, expect, it } from "vitest";

import { validateJson } from "@a-novel-kit/nodelib-json";

const nextId = countingIds();
const [setup, climax, ferry, letter, storm, loglines, notes, added, other] = Array.from({ length: 9 }, nextId);

/** A story of two beats and three scenes, under a logline layer and a notes layer. */
const STORY: Content = {
  beats: [
    {
      id: setup!,
      title: "Setup",
      description: "The ordinary world.",
      scenes: [
        {
          id: ferry!,
          title: "The last ferry",
          description: "A quay, at night.",
          cells: [
            { kind: "logline", layer: loglines!, text: "Mara waits." },
            { kind: "notes", layer: notes!, text: "Night.\nRain." },
          ],
        },
        { id: letter!, title: "", description: "", cells: [{ kind: "notes", layer: notes!, text: "The letter." }] },
      ],
    },
    {
      id: climax!,
      title: "",
      description: "",
      scenes: [{ id: storm!, title: "The storm", description: "", cells: [] }],
    },
  ],
  layers: [
    { id: loglines!, kind: "logline", name: "Scenes" },
    { id: notes!, kind: "notes", name: "Characters", color: "#e11d48" },
  ],
};

const frozen = structuredClone(STORY);
const [first, second] = STORY.beats as [Content["beats"][0], Content["beats"][0]];

const titles = (content: Content) =>
  content.beats.map((beat) => [beat.title, ...beat.scenes.map((scene) => scene.title)]);
const cellsOf = (content: Content, scene: string) =>
  content.beats.flatMap((beat) => beat.scenes).find(({ id }) => id === scene)?.cells;

describe("an edit", () => {
  const edits: [string, (content: Content) => Content][] = [
    ["addBeat", (content) => addBeat(content, 1, added!, other!)],
    ["addScene", (content) => addScene(content, setup!, 1, added!)],
    ["addLayer", (content) => addLayer(content, "notes", added!)],
    [
      "editBeat",
      (content) => editBeat(content, climax!, { title: "Climax", description: "The storm breaks.\nMara stays." }),
    ],
    ["editScene", (content) => editScene(content, letter!, { title: "The letter", description: "It was never sent." })],
    ["editLayer", (content) => editLayer(content, loglines!, { name: "", label: "Plot", color: "#84CC16" })],
    [
      "editLayer, its label and its color taken away",
      (content) => editLayer(content, notes!, { name: "People", label: undefined, color: undefined }),
    ],
    ["resizeScene", (content) => resizeScene(content, ferry!, 64.4)],
    ["resizeScene, past the most", (content) => resizeScene(content, ferry!, 10_000)],
    ["resizeScene, back to the default", (content) => resizeScene(content, ferry!, undefined)],
    ["resizeLayer", (content) => resizeLayer(content, notes!, 1)],
    ["deleteCell", (content) => deleteCell(content, ferry!, notes!)],
    ["deleteBeat", (content) => deleteBeat(content, setup!)],
    ["deleteScene", (content) => deleteScene(content, ferry!)],
    ["deleteLayer", (content) => deleteLayer(content, notes!)],
    ["writeCell", (content) => writeCell(content, storm!, loglines!, "logline", "The sea rises.")],
    ["writeCell, emptied", (content) => writeCell(content, ferry!, notes!, "notes", "")],
  ];

  it.each(edits)("%s gives a content the schema accepts, and leaves the one it received as it was", (_, edit) => {
    const next = edit(STORY);

    expect(validateJson(MANIFEST.schema, next)).toEqual([]);
    expect(next).not.toBe(STORY);
    expect(STORY).toEqual(frozen);
  });
});

describe("addBeat", () => {
  it.each([
    [
      0,
      [
        ["", ""],
        ["Setup", "The last ferry", ""],
        ["", "The storm"],
      ],
    ],
    [
      1,
      [
        ["Setup", "The last ferry", ""],
        ["", ""],
        ["", "The storm"],
      ],
    ],
    [
      2,
      [
        ["Setup", "The last ferry", ""],
        ["", "The storm"],
        ["", ""],
      ],
    ],
  ])("adds an untitled beat at index %i, with one untitled scene", (index, expected) => {
    const next = addBeat(STORY, index, added!, other!);

    expect(titles(next)).toEqual(expected);
    expect(next.beats[index]).toEqual({
      id: added,
      title: "",
      description: "",
      scenes: [{ id: other, title: "", description: "", cells: [] }],
    });
  });
});

describe("addScene", () => {
  it.each([
    [0, ["", "The last ferry", ""]],
    [1, ["The last ferry", "", ""]],
    [2, ["The last ferry", "", ""]],
  ])("adds an untitled scene to a beat at index %i of its scenes", (index, expected) => {
    const next = addScene(STORY, setup!, index, added!);

    expect(next.beats[0]!.scenes.map(({ title }) => title)).toEqual(expected);
    expect(next.beats[0]!.scenes[index]).toEqual({ id: added, title: "", description: "", cells: [] });
    // The other beat is the object it was, so the timeline redraws one beat.
    expect(next.beats[1]).toBe(second);
  });
});

describe("addLayer", () => {
  it.each(["notes", "logline", "script", "link"] as const)("adds an unnamed %s layer under the others", (kind) => {
    const next = addLayer(STORY, kind, added!);

    expect(next.layers).toEqual([...STORY.layers, { id: added, kind, name: "" }]);
    expect(next.beats).toBe(STORY.beats);
  });
});

describe("editing a heading", () => {
  it("gives a beat its title and what describes it in one edit, over the lines it takes", () => {
    const next = editBeat(STORY, climax!, { title: "Climax", description: "The storm breaks.\nMara stays." });

    expect(titles(next)).toEqual([
      ["Setup", "The last ferry", ""],
      ["Climax", "The storm"],
    ]);
    expect(next.beats.map((beat) => beat.description)).toEqual([first.description, "The storm breaks.\nMara stays."]);
    expect(next.beats[0]).toBe(first);
  });

  it("gives a scene its title and what describes it, and keeps the beats it is not in", () => {
    const next = editScene(STORY, letter!, { title: "The letter", description: "It was never sent." });

    expect(titles(next)).toEqual([
      ["Setup", "The last ferry", "The letter"],
      ["", "The storm"],
    ]);
    expect(next.beats[0]!.scenes[1]!.description).toBe("It was never sent.");
    expect(next.beats[0]!.scenes[0]).toBe(first.scenes[0]);
    expect(next.beats[1]).toBe(second);
  });
});

describe("editLayer", () => {
  it("gives a layer its name, its label and its color in one edit, without touching the beats", () => {
    const next = editLayer(STORY, loglines!, { name: "Loglines", label: "Plot", color: "#84cc16" });

    expect(next.layers).toEqual([
      { id: loglines, kind: "logline", name: "Loglines", label: "Plot", color: "#84cc16" },
      STORY.layers[1],
    ]);
    expect(next.beats).toBe(STORY.beats);
  });

  it("takes a label and a color away: a layer without them holds no member for them", () => {
    const labelled = editLayer(STORY, notes!, { name: "Characters", label: "People", color: "#e11d48" });
    const [, plain] = editLayer(labelled, notes!, { name: "Characters", label: "", color: undefined }).layers;

    expect(plain).toEqual({ id: notes, kind: "notes", name: "Characters" });
    expect(Object.hasOwn(plain!, "label")).toBe(false);
    expect(Object.hasOwn(plain!, "color")).toBe(false);
  });
});

describe("resizing", () => {
  const [leastWidth, mostWidth] = LIMITS.width;
  const [leastHeight, mostHeight] = LIMITS.height;
  const width = (content: Content) => content.beats[0]!.scenes[0]!.width;

  it.each([
    [64, 64],
    [64.4, 64],
    [0, leastWidth],
    [10_000, mostWidth],
    [undefined, undefined],
  ])("stretches the column of a scene to %s, kept within the limits of the schema", (asked, kept) => {
    const next = resizeScene(resizeScene(STORY, ferry!, DEFAULT_WIDTH + 8), ferry!, asked);

    expect(width(next)).toBe(kept);
    expect(Object.hasOwn(next.beats[0]!.scenes[0]!, "width")).toBe(kept !== undefined);
    expect(next.beats[1]).toBe(second);
  });

  it.each([
    [40, 40],
    [1, leastHeight],
    [10_000, mostHeight],
    [undefined, undefined],
  ])("stretches the track of a layer to %s at least, kept within the limits of the schema", (asked, kept) => {
    const next = resizeLayer(resizeLayer(STORY, notes!, 24), notes!, asked);

    expect(next.layers[1]!.height).toBe(kept);
    expect(next.layers[1]).toMatchObject({ id: notes, name: "Characters", color: "#e11d48" });
    expect(next.beats).toBe(STORY.beats);
  });

  it("gives back the items it received when a size does not change", () => {
    const sized = resizeLayer(resizeScene(STORY, ferry!, 64), notes!, 40);

    // The same objects, so a size already at its limit shows as no edit at all.
    expect(resizeScene(sized, ferry!, 64).beats[0]).toBe(sized.beats[0]);
    expect(resizeLayer(sized, notes!, 40).layers[1]).toBe(sized.layers[1]);
    expect(resizeScene(STORY, ferry!, undefined).beats[0]).toBe(first);
  });
});

describe("deleting", () => {
  it("removes a beat with its scenes", () => {
    expect(titles(deleteBeat(STORY, setup!))).toEqual([["", "The storm"]]);
  });

  it("removes a scene, and leaves its beat even without one", () => {
    expect(titles(deleteScene(STORY, ferry!))).toEqual([
      ["Setup", ""],
      ["", "The storm"],
    ]);
    expect(titles(deleteScene(STORY, storm!))).toEqual([["Setup", "The last ferry", ""], [""]]);
  });

  it("removes a layer with the cell every scene holds for it", () => {
    const next = deleteLayer(STORY, notes!);

    expect(next.layers).toEqual([STORY.layers[0]]);
    expect(cellsOf(next, ferry!)).toEqual([{ kind: "logline", layer: loglines, text: "Mara waits." }]);
    expect(cellsOf(next, letter!)).toEqual([]);
    // A scene that held nothing for the layer is the object it was.
    expect(next.beats[1]).toBe(second);
  });
});

describe("deleteCell", () => {
  it("removes what a layer holds for a scene, and nothing else", () => {
    const next = deleteCell(STORY, ferry!, notes!);

    expect(cellsOf(next, ferry!)).toEqual([{ kind: "logline", layer: loglines, text: "Mara waits." }]);
    expect(cellsOf(next, letter!)).toEqual([{ kind: "notes", layer: notes, text: "The letter." }]);
    expect(next.beats[1]).toBe(second);
    expect(next.layers).toBe(STORY.layers);
  });
});

describe("writeCell", () => {
  it("writes the first text a layer holds for a scene", () => {
    const next = writeCell(STORY, storm!, loglines!, "logline", "The sea rises.");

    expect(cellsOf(next, storm!)).toEqual([{ kind: "logline", layer: loglines, text: "The sea rises." }]);
    expect(next.beats[0]).toBe(first);
  });

  it("replaces the text a layer held, and keeps one cell for the layer", () => {
    const next = writeCell(STORY, ferry!, notes!, "notes", "Dawn.");

    expect(cellsOf(next, ferry!)).toEqual([
      { kind: "logline", layer: loglines, text: "Mara waits." },
      { kind: "notes", layer: notes, text: "Dawn." },
    ]);
  });

  it("removes the cell of an emptied text", () => {
    expect(cellsOf(writeCell(STORY, ferry!, notes!, "notes", ""), ferry!)).toEqual([
      { kind: "logline", layer: loglines, text: "Mara waits." },
    ]);
    expect(cellsOf(writeCell(STORY, storm!, notes!, "notes", ""), storm!)).toEqual([]);
  });
});

describe("LIMITS", () => {
  /** Reads a number of the schema at a path of its definitions. */
  const limit = (...path: string[]) =>
    path.reduce<unknown>((at, key) => (at as Record<string, unknown>)[key], MANIFEST.schema);

  it("holds the limits of the schema, which refuses a save past them", () => {
    expect(LIMITS).toEqual({
      items: limit("properties", "beats", "maxItems"),
      layers: limit("properties", "layers", "maxItems"),
      title: limit("$defs", "line", "maxLength"),
      description: limit("$defs", "beat", "properties", "description", "maxLength"),
      logline: limit("$defs", "loglineCell", "properties", "text", "maxLength"),
      notes: limit("$defs", "notesCell", "properties", "text", "maxLength"),
      width: [
        limit("$defs", "scene", "properties", "width", "minimum"),
        limit("$defs", "scene", "properties", "width", "maximum"),
      ],
      height: [
        limit("$defs", "layer", "properties", "height", "minimum"),
        limit("$defs", "layer", "properties", "height", "maximum"),
      ],
    });
    expect(limit("$defs", "beat", "properties", "scenes", "maxItems")).toBe(LIMITS.items);
    expect(limit("$defs", "scene", "properties", "description", "maxLength")).toBe(LIMITS.description);
  });
});
