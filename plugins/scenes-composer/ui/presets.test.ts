import english from "../i18n/en.json" with { type: "json" };
import french from "../i18n/fr.json" with { type: "json" };
import { countingIds, serialize } from "./content.fixture.ts";
import { MANIFEST } from "./manifest.fixture.ts";
import { PRESETS, preset } from "./presets.ts";

import { afterEach, describe, expect, it, vi } from "vitest";

import { validateJson } from "@a-novel-kit/nodelib-json";

const LANGUAGES = { en: english.messages, fr: french.messages };

describe("preset", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe.each(PRESETS)("%s", (name) => {
    it.each(Object.entries(LANGUAGES))("builds a content the schema accepts in %s", (_, messages) => {
      expect(validateJson(MANIFEST.schema, preset(name, messages))).toEqual([]);
    });

    it.each(Object.entries(LANGUAGES))("keeps what it builds in %s as a fixture", async (language, messages) => {
      // IDs that count up, so the fixture is the same on every run.
      vi.spyOn(crypto, "randomUUID").mockImplementation(countingIds());

      await expect(serialize(preset(name, messages))).toMatchFileSnapshot(`../fixtures/1.0.0/${name}.${language}.json`);
    });

    it("gives every beat, scene and layer an ID of its own", () => {
      const { beats, layers } = preset(name, english.messages);
      const ids = [...beats, ...beats.flatMap(({ scenes }) => scenes), ...layers].map(({ id }) => id);

      expect(new Set(ids).size).toBe(ids.length);
    });
  });

  it.each(["hollywoodBeats", "fifteenBeats"] as const)("builds every beat %s translates", (name) => {
    const translated = Object.values(english.messages.presets[name].beats).map(({ title }) => title);
    const built = preset(name, english.messages).beats.map(({ title }) => title);

    expect(built.toSorted()).toEqual(translated.toSorted());
  });
});
