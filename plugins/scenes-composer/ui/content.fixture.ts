// Sample contents of a composer, for the tests and for the fixtures they write. Nothing here reads
// a clock or a random source, so a content is the same on every run.
import type { Beat, Block, Cell, Content, Layer, Scene } from "./content.ts";

/** Writes a content as its fixture file holds it. */
export const serialize = (content: unknown) => `${JSON.stringify(content, null, 2)}\n`;

/** Makes IDs that count up from one, each in the form of a UUID. */
export function countingIds(): () => ReturnType<Crypto["randomUUID"]> {
  let count = 0;

  return () => `00000000-0000-4000-8000-${(++count).toString(16).padStart(12, "0")}`;
}

const WORDS =
  "rain fell on the harbor all night while the last ferry waited for a passenger who never came and the keeper counted the lamps along the quay twice before he let himself believe that one of them had gone dark".split(
    " "
  );

/** Writes a sentence of `length` words, read from the `start`-th word of the list and around it. */
function sentence(start: number, length: number): string {
  const words = Array.from({ length }, (_, word) => WORDS[(start + word) % WORDS.length]).join(" ");

  return `${words.charAt(0).toUpperCase()}${words.slice(1)}.`;
}

const SPEAKERS = ["Mara", "The keeper", "Idris", "A stranger"];

// The two layers of a new composer, then others of every kind. Each kind has a colored layer and an
// uncolored one, for both looks of a track.
const LAYERS: Omit<Layer, "id">[] = [
  { kind: "logline", name: "Scenes" },
  { kind: "script", name: "Enriched scenes" },
  { kind: "notes", name: "Characters", label: "People", color: "#e11d48" },
  { kind: "notes", name: "Setting", color: "#0ea5e9", height: 40 },
  { kind: "notes", name: "Stakes" },
  { kind: "notes", name: "Research", color: "#84cc16" },
  { kind: "logline", name: "Subplot", color: "#a855f7" },
  { kind: "script", name: "First draft", color: "#14b8a6" },
  { kind: "link", name: "Callbacks", color: "#f59e0b", accepts: ["scenes"] },
  { kind: "link", name: "Foreshadowing", accepts: ["scenes"] },
];

// The widths a writer stretched some columns to, in quarters of the base text size.
const WIDTHS = [undefined, undefined, 72, undefined, 36, undefined, undefined];

const BEATS = 20;
const SCENES_PER_BEAT = 10;

/**
 * Builds a large content: 200 scenes in 20 beats, under 10 layers of every kind. Four cells in five
 * are filled, so a track shows cards and empty places side by side. Some scenes and one layer
 * carry the size a writer stretched them to.
 */
export function largeContent(): Content {
  const nextId = countingIds();
  const layers = LAYERS.map((layer) => ({ id: nextId(), ...layer }));

  let seed = 0;
  let count = 0;
  const scene = (): Scene => {
    const width = WIDTHS[count++ % WIDTHS.length];

    return {
      id: nextId(),
      title: sentence(seed, 2 + (seed % 4)).slice(0, -1),
      // One scene in three is described.
      description: count % 3 === 1 ? sentence(seed + 3, 9 + (seed % 9)) : "",
      ...(width && { width }),
      cells: layers.flatMap((layer) => cell(layer, ++seed) ?? []),
    };
  };

  const beat = (_: unknown, index: number): Beat => ({
    id: nextId(),
    title: `Beat ${index + 1}`,
    description: sentence(index, 10 + (index % 12)),
    scenes: Array.from({ length: SCENES_PER_BEAT }, scene),
  });

  return { beats: Array.from({ length: BEATS }, beat), layers };
}

/** Fills the cell of a layer, or leaves it empty: one cell in five, and every cell of a link layer. */
function cell(layer: Layer, seed: number): Cell | undefined {
  if (layer.kind === "link" || seed % 5 === 0) return undefined;

  if (layer.kind === "logline") return { kind: "logline", layer: layer.id, text: sentence(seed, 8 + (seed % 9)) };

  if (layer.kind === "notes") {
    const paragraphs = Array.from({ length: 1 + (seed % 2) }, (_, index) => sentence(seed + index, 6 + (seed % 10)));

    return { kind: "notes", layer: layer.id, text: paragraphs.join("\n\n") };
  }

  return { kind: "script", layer: layer.id, blocks: Array.from({ length: 2 + (seed % 3) }, block(seed)) };
}

/** Writes the blocks of a script cell: a narration, then a dialogue, in turn. */
function block(seed: number): (_: unknown, index: number) => Block {
  return (_, index) => {
    const text = sentence(seed + index, 6 + ((seed + index) % 10));
    if (index % 2 === 0) return { kind: "narration", text };

    const speaker = SPEAKERS[(seed + index) % SPEAKERS.length]!;

    return { kind: "dialogue", speaker, ...((seed + index) % 3 === 0 && { tone: "under her breath" }), text };
  };
}
