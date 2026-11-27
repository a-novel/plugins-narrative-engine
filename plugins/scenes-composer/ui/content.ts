// The content of a composer, as the manifest of the current version describes it. Each shape is a
// type alias: only an alias is assignable to the `Json` a host exchanges.

/** A Content is the whole document of one composer. */
export type Content = {
  /** The beats, in story order. */
  beats: Beat[];
  /** The layers, in the order of their rows. */
  layers: Layer[];
};

/** A Beat is one step of the story: an ordered set of scenes. */
export type Beat = {
  id: string;

  title: string;
  /** What the beat does in the story. */
  description: string;

  /** The scenes, in story order. */
  scenes: Scene[];
};

/** A Scene is the story's unit of time, and one column of the timeline. */
export type Scene = {
  id: string;

  title: string;
  /** What happens in the scene, in the writer's own words. */
  description: string;
  /**
   * The width of the scene's column on a wide screen, in quarters of the base text size. A scene
   * without one takes the default width.
   */
  width?: number;

  /** What the layers hold for the scene, with one cell per layer at most. */
  cells: Cell[];
};

/**
 * A Cell is what one layer holds for one scene. Its `kind` repeats the kind of its layer. A link
 * layer has no cell: its links live in the links of the project.
 */
export type Cell = NotesCell | LoglineCell | ScriptCell;

/** A NotesCell holds free text about a scene. */
export type NotesCell = {
  kind: "notes";
  /** The ID of the layer the cell belongs to. */
  layer: string;

  text: string;
};

/** A LoglineCell tells a scene in one line. */
export type LoglineCell = {
  kind: "logline";
  /** The ID of the layer the cell belongs to. */
  layer: string;

  /** The line, without a line break. */
  text: string;
};

/** A ScriptCell holds the text of a scene. */
export type ScriptCell = {
  kind: "script";
  /** The ID of the layer the cell belongs to. */
  layer: string;

  /** The blocks, in reading order. */
  blocks: Block[];
};

/** A Block is one unit of script text. It has a position in its cell and no ID. */
export type Block = Narration | Dialogue;

/** A Narration is prose the narrator tells. */
export type Narration = {
  kind: "narration";

  /** The prose, where a blank line separates two paragraphs. */
  text: string;
};

/** A Dialogue is one character's spoken line. */
export type Dialogue = {
  kind: "dialogue";

  /** Who speaks, by the name the story gives them. */
  speaker: string;
  /** How the line is said. A line said in no particular tone has none. */
  tone?: string;
  /** The words spoken, without quotation marks. */
  text: string;
};

/** A Layer is one row of the timeline: it follows one kind of information across the scenes. */
export type Layer = {
  id: string;

  /** What the layer holds for each scene. */
  kind: "notes" | "logline" | "script" | "link";

  name: string;
  /** What the writer calls what the layer follows. A layer without one shows its kind. */
  label?: string;
  /** A six-digit hex value. A layer without one has no color. */
  color?: string;
  /**
   * The least height of the layer's row on a wide screen, in quarters of the base text size. A
   * layer without one is as tall as what it holds.
   */
  height?: number;
  /** On a link layer, the names of the exports whose items its links point at. */
  accepts?: string[];
};
