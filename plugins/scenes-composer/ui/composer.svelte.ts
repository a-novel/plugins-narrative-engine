import type { Content, Layer } from "./content.ts";
import * as edits from "./edits.ts";
import { type Messages, type Preset, preset } from "./presets.ts";

import type { Host } from "@a-novel/plugins-narrative-engine-kit";

/** A Composer holds the content of one composer and every edit a writer makes to it. */
export interface Composer {
  /** The content, once the host has given it. Each edit replaces it with a new object. */
  readonly content: Content | undefined;
  /** Whether the host could not give the content. */
  readonly unavailable: boolean;
  /** Whether the host refused the last save. The content on screen is then ahead of the host's. */
  readonly unsaved: boolean;
  /** What tells the last deletion, in the words of the timeline, until the next edit, undo or redo. */
  readonly deleted: string | undefined;

  /** Asks the host for the content again. */
  load(): void;
  /** Sends the content to the host again. */
  save(): void;
  /**
   * Starts the composer from a preset, in the language of the host. A composer starts once: one
   * that holds a beat keeps its content.
   */
  start(name: Preset): void;

  /** Adds a beat at an index and returns its ID. */
  addBeat(index: number): string;
  /** Adds a scene to a beat, at an index of its scenes, and returns its ID. */
  addScene(beat: string, index: number): string;
  /** Adds a layer under the others and returns its ID. */
  addLayer(kind: Layer["kind"]): string;

  /** Gives a beat or a scene its title and what describes it, as one edit. */
  editBeat(id: string, heading: edits.Heading): void;
  editScene(id: string, heading: edits.Heading): void;
  /** Gives a layer its name, its label and its color, as one edit. */
  editLayer(id: string, naming: edits.Naming): void;

  /** Stretches the column of a scene, in quarters of the base text size, or gives it the default back. */
  resizeScene(id: string, width: number | undefined): void;
  /** Stretches the row of a layer to a height at least, or leaves it as tall as what it holds. */
  resizeLayer(id: string, height: number | undefined): void;

  /**
   * Deletes an item. `told` tells the deletion to the writer, who can take it back. The last beat
   * and the last layer stay: a composer without a beat has not started, and a story needs a track.
   */
  deleteBeat(id: string, told: string): void;
  deleteScene(id: string, told: string): void;
  deleteLayer(id: string, told: string): void;
  /** Deletes what a layer holds for a scene. */
  deleteCell(scene: string, layer: string, told: string): void;

  /** Takes the last edit back. A composer keeps its last hundred edits, and never its start. */
  undo(): void;
  /** Gives back the edit `undo` last took. An edit made since leaves nothing to give back. */
  redo(): void;

  /** Writes the text a layer holds for a scene. */
  writeCell(scene: string, layer: string, kind: edits.TextKind, text: string): void;
}

/** How many edits a composer can take back. */
const HISTORY = 100;

/** How long two sizes given to one item count as one edit, in milliseconds. */
const MERGED = 1000;

/** Tells whether an edit left every beat and every layer as the object it was: it changed nothing. */
const same = (one: Content, other: Content) =>
  one.beats.length === other.beats.length &&
  one.layers.length === other.layers.length &&
  one.beats.every((beat, index) => beat === other.beats[index]) &&
  one.layers.every((layer, index) => layer === other.layers[index]);

/** Creates the composer of the instance a host mounts, and asks the host for its content. */
export function createComposer(host: Host): Composer {
  const messages = host.messages as Messages;

  // The host validates the content against the schema of the version it mounts.
  let content = $state.raw<Content>();
  let unavailable = $state(false);
  let unsaved = $state(false);
  let deleted = $state.raw<string>();

  // The contents `undo` goes back to and `redo` returns to, oldest first. Each edit shares what it
  // left alone with the one before, so an entry costs what the edit changed.
  const past: Content[] = [];
  const future: Content[] = [];
  // What the last edit resized, and when: a column stretched step by step is taken back at once.
  let resized: { item: string; at: number } | undefined;

  // One save runs at a time. The host receives the whole content, so the last one holds every edit.
  let saving = false;
  let stale = false;

  async function save() {
    stale = true;
    if (saving || content === undefined) return;

    saving = true;
    try {
      while (stale) {
        stale = false;
        await host.content.set(content);
      }
      unsaved = false;
    } catch (error) {
      console.error(error);
      unsaved = true;
    } finally {
      saving = false;
    }
  }

  function load() {
    unavailable = false;
    host.content.get().then(
      (held) => (content = held as Content),
      (error: unknown) => {
        console.error(error);
        unavailable = true;
      }
    );
  }

  /**
   * Shows an edit at once, saves it, and keeps the content before it for `undo`. `told` tells a
   * deletion. `resizes` names the item an edit resizes: the sizes one item takes in a row are one
   * entry of the history.
   */
  function apply(next: Content, { told, resizes }: { told?: string; resizes?: string } = {}) {
    // An edit that changes nothing, such as a size already at its limit, is none: nothing is saved,
    // and undo has nothing more to take back.
    if (same(content!, next)) return;

    const now = Date.now();
    const joins = resizes !== undefined && resized?.item === resizes && now - resized.at < MERGED;
    if (!joins) {
      past.push(content!);
      if (past.length > HISTORY) past.shift();
    }

    resized = resizes === undefined ? undefined : { item: resizes, at: now };
    future.length = 0;
    show(next, told);
  }

  /** Moves the content one entry along the history: from `from`, which loses it, towards `to`. */
  function travel(from: Content[], to: Content[]) {
    const next = from.pop();
    if (next === undefined || content === undefined) return;

    to.push(content);
    resized = undefined;
    show(next);
  }

  function show(next: Content, told?: string) {
    deleted = told;
    content = next;
    void save();
  }

  /** Applies an edit that adds an item, and returns the ID it gave the item. */
  function add(edit: (content: Content, id: string) => Content): string {
    const id = crypto.randomUUID();
    apply(edit(content!, id));

    return id;
  }

  load();

  return {
    get content() {
      return content;
    },
    get unavailable() {
      return unavailable;
    },
    get unsaved() {
      return unsaved;
    },
    get deleted() {
      return deleted;
    },

    load,
    save: () => void save(),
    start: (name) => {
      // A structure is chosen once: the history never goes back to the choice.
      if (content?.beats.length === 0) show(preset(name, messages));
    },

    addBeat: (index) => add((content, id) => edits.addBeat(content, index, id, crypto.randomUUID())),
    addScene: (beat, index) => add((content, id) => edits.addScene(content, beat, index, id)),
    addLayer: (kind) => add((content, id) => edits.addLayer(content, kind, id)),

    editBeat: (id, heading) => apply(edits.editBeat(content!, id, heading)),
    editScene: (id, heading) => apply(edits.editScene(content!, id, heading)),
    editLayer: (id, naming) => apply(edits.editLayer(content!, id, naming)),

    resizeScene: (id, width) => apply(edits.resizeScene(content!, id, width), { resizes: id }),
    resizeLayer: (id, height) => apply(edits.resizeLayer(content!, id, height), { resizes: id }),

    deleteBeat: (id, told) => {
      if (content!.beats.length > 1) apply(edits.deleteBeat(content!, id), { told });
    },
    deleteScene: (id, told) => apply(edits.deleteScene(content!, id), { told }),
    deleteLayer: (id, told) => {
      if (content!.layers.length > 1) apply(edits.deleteLayer(content!, id), { told });
    },
    deleteCell: (scene, layer, told) => apply(edits.deleteCell(content!, scene, layer), { told }),

    undo: () => travel(past, future),
    redo: () => travel(future, past),

    writeCell: (scene, layer, kind, text) => apply(edits.writeCell(content!, scene, layer, kind, text)),
  };
}
