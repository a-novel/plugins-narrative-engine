import { v1, v2, v2RootRequired } from "./composer.fixture.js";
import type { Json, JsonObject } from "./json.js";
import { type Migration, upgrade } from "./upgrade.js";

import { describe, expect, it } from "vitest";

const layers = [{ id: "l-0", kind: "notes", name: "Notes" }];
const withScene = (scene: JsonObject): JsonObject => ({
  beats: [{ id: "b-0", title: "Opening", scenes: [{ id: "s-0", title: "Arrival", cells: [], ...scene }] }],
  layers,
});

// Two versions of a counter: an object, then an object with a required label and nothing else.
const counted: JsonObject = { type: "object", required: ["count"], properties: { count: { type: "number" } } };
const labelled: JsonObject = {
  type: "object",
  required: ["count", "label"],
  properties: { count: { type: "number" }, label: { type: "string" } },
  additionalProperties: false,
};

/** Reads a content as the object a migration of the counter expects. */
const members = (content: Json): JsonObject =>
  typeof content === "object" && content !== null && !Array.isArray(content) ? content : {};

describe("upgrade", () => {
  it("returns the content as it is when there is no step", async () => {
    const content = withScene({});
    expect(await upgrade(content, [])).toEqual({ ok: true, content, unmigrated: [] });
  });

  it("carries a valid content through steps without a migration", async () => {
    const content = withScene({ status: "draft" });
    const steps = [
      { version: "2.0.0", schema: v2 },
      { version: "2.0.1", schema: v2 },
    ];

    expect(await upgrade(content, steps)).toEqual({ ok: true, content, unmigrated: [] });
  });

  it("runs each migration on the result of the step before it", async () => {
    const wrap: Migration = (count) => ({ migrated: { count } });
    const label: Migration = async (content) => ({ migrated: { ...members(content), label: "Scenes" } });

    const result = await upgrade(3, [
      { version: "1.1.0", schema: counted, migrate: wrap },
      { version: "2.0.0", schema: labelled, migrate: label },
    ]);

    expect(result).toEqual({ ok: true, content: { count: 3, label: "Scenes" }, unmigrated: [] });
  });

  it("moves aside what fails a step's schema, under that step's version", async () => {
    const result = await upgrade(withScene({ pov: "Mara" }), [
      { version: "1.0.1", schema: v1 },
      { version: "2.0.0", schema: v2 },
    ]);

    expect(result).toEqual({
      ok: true,
      content: withScene({ status: "draft" }),
      unmigrated: [{ version: "2.0.0", path: "/beats/0/scenes/0/pov", value: "Mara" }],
    });
  });

  it("keeps what a migration returns as unmigrated, with an empty path", async () => {
    const dropLabel: Migration = (content) => {
      const { label = null, ...migrated } = members(content);
      return { migrated, unmigrated: { label } };
    };

    const result = await upgrade({ count: 1, label: "Old" }, [
      { version: "3.0.0", schema: counted, migrate: dropLabel },
    ]);

    expect(result).toEqual({
      ok: true,
      content: { count: 1 },
      unmigrated: [{ version: "3.0.0", path: "", value: { label: "Old" } }],
    });
  });

  it("validates what a migration returns, and moves aside what fails", async () => {
    const addTooMuch: Migration = (content) => ({ migrated: { ...members(content), label: "Scenes", extra: true } });

    const result = await upgrade({ count: 1 }, [{ version: "2.0.0", schema: labelled, migrate: addTooMuch }]);

    expect(result).toEqual({
      ok: true,
      content: { count: 1, label: "Scenes" },
      unmigrated: [{ version: "2.0.0", path: "/extra", value: true }],
    });
  });

  it("stops at the step whose schema the content cannot satisfy, and says why", async () => {
    const steps = [
      { version: "2.0.0", schema: v2 },
      { version: "3.0.0", schema: v2RootRequired },
      { version: "3.1.0", schema: { type: "null" } },
    ];

    expect(await upgrade(withScene({}), steps)).toEqual({
      ok: false,
      version: "3.0.0",
      reason: 'Missing required property "meta".',
    });
  });

  it("stops on a root of the wrong type", async () => {
    expect(await upgrade([], [{ version: "2.0.0", schema: v2 }])).toEqual({
      ok: false,
      version: "2.0.0",
      reason: 'Instance type "array" is invalid. Expected "object".',
    });
  });

  it("never modifies its input, even when a migration edits its argument", async () => {
    const content = withScene({ pov: "Mara" });
    const before = structuredClone(content);
    const editInPlace: Migration = (received) => {
      members(received).renamed = true;
      return { migrated: received };
    };

    const result = await upgrade(content, [{ version: "1.0.1", schema: { type: "object" }, migrate: editInPlace }]);

    expect(content).toEqual(before);
    expect(result).toMatchObject({ ok: true, content: { renamed: true } });
  });

  it("rejects with what a migration throws", async () => {
    const fail: Migration = () => {
      throw new TypeError("no such member");
    };

    await expect(upgrade({}, [{ version: "1.1.0", schema: {}, migrate: fail }])).rejects.toThrow("no such member");
  });
});
