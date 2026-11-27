// What a writer does to a composer, as functions from one content to the next. None modifies the
// content it receives, and every part an edit leaves alone is the same object in the next content,
// so the timeline redraws what changed and nothing else.
import type { Beat, Content, Layer, Scene } from "./content.ts";

/** The limits the schema sets, which a field or an action keeps so the host accepts every save. */
export const LIMITS = {
  /** The beats of a composer, and the scenes of a beat. */
  items: 500,
  layers: 50,
  /** The characters of a title or of a layer's name. */
  title: 200,
  /** The characters of what describes a beat or a scene. */
  description: 2000,
  logline: 500,
  notes: 20_000,
  /** The least and the most width of a scene's column, in quarters of the base text size. */
  width: [32, 240],
  /** The least and the most a layer's row is stretched to, in the same unit. */
  height: [8, 160],
} as const;

/** The width of a scene's column that stores none, in quarters of the base text size. */
export const DEFAULT_WIDTH = 48;

/** A TextKind is a kind of layer whose cell holds one text, which the timeline edits in place. */
export type TextKind = "notes" | "logline";

/** Inserts an item at an index of a list. */
const insert = <Item>(items: Item[], index: number, item: Item) => items.toSpliced(index, 0, item);

/** Replaces the item of an ID with what `change` makes of it. */
const update = <Item extends { id: string }>(items: Item[], id: string, change: (item: Item) => Item) =>
  items.map((item) => (item.id === id ? change(item) : item));

/** Removes the item of an ID. */
const remove = <Item extends { id: string }>(items: Item[], id: string) => items.filter((item) => item.id !== id);

/** Applies a change to the scenes of every beat, and keeps the beats it leaves as they were. */
function changeScenes(content: Content, change: (scenes: Scene[]) => Scene[]): Content {
  const changed = (beat: Beat) => {
    const scenes = change(beat.scenes);
    const same = scenes.length === beat.scenes.length && scenes.every((scene, index) => scene === beat.scenes[index]);

    return same ? beat : { ...beat, scenes };
  };

  return { ...content, beats: content.beats.map(changed) };
}

/** Adds an untitled beat at an index, with one untitled scene. `id` and `scene` are their new IDs. */
export function addBeat(content: Content, index: number, id: string, scene: string): Content {
  const beat: Beat = { id, title: "", description: "", scenes: [{ id: scene, title: "", description: "", cells: [] }] };

  return { ...content, beats: insert(content.beats, index, beat) };
}

/** Adds an untitled scene to a beat, at an index of its scenes. `id` is its new ID. */
export function addScene(content: Content, beat: string, index: number, id: string): Content {
  const scene: Scene = { id, title: "", description: "", cells: [] };
  const added = (into: Beat) => ({ ...into, scenes: insert(into.scenes, index, scene) });

  return { ...content, beats: update(content.beats, beat, added) };
}

/** Adds an unnamed layer of a kind under the others. `id` is its new ID. */
export function addLayer(content: Content, kind: Layer["kind"], id: string): Content {
  return { ...content, layers: [...content.layers, { id, kind, name: "" }] };
}

/** What names a beat or a scene and tells what it does, which a writer edits together. */
export type Heading = Pick<Scene, "title" | "description">;

export function editBeat(content: Content, id: string, { title, description }: Heading): Content {
  return { ...content, beats: update(content.beats, id, (beat) => ({ ...beat, title, description })) };
}

export function editScene(content: Content, id: string, { title, description }: Heading): Content {
  return changeScenes(content, (scenes) => update(scenes, id, (scene) => ({ ...scene, title, description })));
}

/**
 * Gives an optional member of an item a value, or takes the member away. An item that already holds
 * the value is returned as it is, so an edit that changes nothing shows as none.
 */
function given<Item extends object, Key extends keyof Item>(item: Item, key: Key, value: Item[Key] | undefined): Item {
  if (item[key] === value) return item;

  const { [key]: _, ...rest } = item;

  return (value === undefined ? rest : { ...rest, [key]: value }) as Item;
}

/** Keeps a size a writer asked for inside the limits of the schema, as a whole number. */
const within = (size: number, [least, most]: readonly [number, number]) =>
  Math.min(most, Math.max(least, Math.round(size)));

/** What a writer gives a layer: its name, what they call what it follows, and its color. */
export type Naming = { name: string; label: string | undefined; color: string | undefined };

/** Gives a layer its name, its label and its color, a six-digit hex value. Without a label or a color, it has none. */
export function editLayer(content: Content, id: string, { name, label, color }: Naming): Content {
  const edited = (layer: Layer) => given(given({ ...layer, name }, "label", label || undefined), "color", color);

  return { ...content, layers: update(content.layers, id, edited) };
}

/** Stretches the column of a scene to a width, or gives it the default width back. */
export function resizeScene(content: Content, id: string, width: number | undefined): Content {
  const stretched = width === undefined ? undefined : within(width, LIMITS.width);

  return changeScenes(content, (scenes) => update(scenes, id, (scene) => given(scene, "width", stretched)));
}

/** Stretches the row of a layer to a height at least, or leaves it as tall as what it holds. */
export function resizeLayer(content: Content, id: string, height: number | undefined): Content {
  const stretched = height === undefined ? undefined : within(height, LIMITS.height);

  return { ...content, layers: update(content.layers, id, (layer) => given(layer, "height", stretched)) };
}

/** Removes a beat with its scenes. */
export function deleteBeat(content: Content, id: string): Content {
  return { ...content, beats: remove(content.beats, id) };
}

export function deleteScene(content: Content, id: string): Content {
  return changeScenes(content, (scenes) => remove(scenes, id));
}

/** Removes a layer with the cell every scene holds for it. */
export function deleteLayer(content: Content, id: string): Content {
  const without = (scene: Scene) =>
    scene.cells.some((cell) => cell.layer === id)
      ? { ...scene, cells: scene.cells.filter((cell) => cell.layer !== id) }
      : scene;

  return { ...changeScenes(content, (scenes) => scenes.map(without)), layers: remove(content.layers, id) };
}

/** Removes what a layer holds for a scene. */
export function deleteCell(content: Content, scene: string, layer: string): Content {
  const without = (into: Scene) => ({ ...into, cells: into.cells.filter((cell) => cell.layer !== layer) });

  return changeScenes(content, (scenes) => update(scenes, scene, without));
}

/**
 * Writes the text a layer holds for a scene. An empty text removes the cell: a layer without a cell
 * holds nothing for the scene.
 */
export function writeCell(content: Content, scene: string, layer: string, kind: TextKind, text: string): Content {
  const written = (into: Scene) => {
    const others = into.cells.filter((cell) => cell.layer !== layer);

    return { ...into, cells: text === "" ? others : [...others, { kind, layer, text }] };
  };

  return changeScenes(content, (scenes) => update(scenes, scene, written));
}
