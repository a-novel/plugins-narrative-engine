import type { Content } from "./content.ts";

/** Messages are the translations of the plugin in one language: the `messages` of its file. */
export type Messages = (typeof import("../i18n/en.json"))["messages"];

type Presets = Messages["presets"];

/** The presets, in the order a composer offers them. */
export const PRESETS = ["blank", "hollywoodBeats", "fifteenBeats"] as const;

/** A Preset names a starting structure, whose name and description are `presets.<preset>`. */
export type Preset = (typeof PRESETS)[number];

// The beats of each preset, in story order. A language file is an object, which keeps no order.
const HOLLYWOOD_BEATS = [
  "setup",
  "incitingIncident",
  "firstPlotPoint",
  "risingAction",
  "midpoint",
  "secondPlotPoint",
  "crisis",
  "climax",
  "resolution",
] as const satisfies (keyof Presets["hollywoodBeats"]["beats"])[];

const FIFTEEN_BEATS = [
  "openingImage",
  "themeStated",
  "setup",
  "catalyst",
  "debate",
  "breakIntoTwo",
  "bStory",
  "funAndGames",
  "midpoint",
  "badGuysCloseIn",
  "allIsLost",
  "darkNightOfTheSoul",
  "breakIntoThree",
  "finale",
  "finalImage",
] as const satisfies (keyof Presets["fifteenBeats"]["beats"])[];

/** Reads the beats of each preset in one language. */
const BEATS: Record<Preset, (presets: Presets) => { title: string; description: string }[]> = {
  blank: () => [{ title: "", description: "" }],
  hollywoodBeats: ({ hollywoodBeats }) => HOLLYWOOD_BEATS.map((beat) => hollywoodBeats.beats[beat]),
  fifteenBeats: ({ fifteenBeats }) => FIFTEEN_BEATS.map((beat) => fifteenBeats.beats[beat]),
};

/**
 * Builds the content a preset starts a composer with, in the language of `messages`: its beats,
 * each with one empty scene, and the two layers of a new composer under their translated names.
 *
 * Every preset holds a beat, the blank one included. A composer with no beat is one that has not
 * started yet.
 */
export function preset(name: Preset, messages: Messages): Content {
  return {
    beats: BEATS[name](messages.presets).map(({ title, description }) => ({
      id: crypto.randomUUID(),
      title,
      description,
      scenes: [{ id: crypto.randomUUID(), title: "", description: "", cells: [] }],
    })),
    layers: [
      { id: crypto.randomUUID(), kind: "logline", name: messages.layers.scenes },
      { id: crypto.randomUUID(), kind: "script", name: messages.layers.enrichedScenes },
    ],
  };
}
