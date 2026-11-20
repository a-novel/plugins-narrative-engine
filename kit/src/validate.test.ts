import { v2 } from "./composer.fixture.js";
import type { JsonObject } from "./json.js";
import { validate } from "./validate.js";

import { describe, expect, it } from "vitest";

const layers = [{ id: "l-0", kind: "notes", name: "Notes" }];
const withScene = (scene: JsonObject): JsonObject => ({
  beats: [
    { id: "b-0", title: "Opening", scenes: [{ id: "s-0", title: "Arrival", status: "draft", cells: [], ...scene }] },
  ],
  layers,
});

describe("validate", () => {
  it("lists nothing for a valid content", () => {
    expect(validate(v2, withScene({}))).toEqual([]);
  });

  it("names the innermost failing value, without the objects around it", () => {
    expect(validate(v2, withScene({ title: 5 }))).toEqual([
      { path: "/beats/0/scenes/0/title", message: 'Instance type "number" is invalid. Expected "string".' },
    ]);
  });

  it("lists every problem of a content", () => {
    const problems = validate(v2, withScene({ title: "x".repeat(150), pov: "Mara" }));
    expect(problems.map((problem) => problem.path)).toEqual(["/beats/0/scenes/0/title", "/beats/0/scenes/0/pov"]);
  });

  it("points a missing required property at the object that lacks it", () => {
    const scene = { id: "s-0", title: "Arrival", cells: [] };

    expect(validate(v2, { beats: [{ id: "b-0", title: "Opening", scenes: [scene] }] })).toEqual([
      { path: "", message: 'Missing required property "layers".' },
      { path: "/beats/0/scenes/0", message: 'Missing required property "status".' },
    ]);
  });

  it("reports a wrong root type at the root", () => {
    expect(validate(v2, [])).toEqual([{ path: "", message: 'Instance type "array" is invalid. Expected "object".' }]);
  });

  it("names the failing property of a tagged union branch", () => {
    const notes = { kind: "notes", layer: "l-0", text: "fine", format: "html" };
    expect(validate(v2, withScene({ cells: [notes] })).map((problem) => problem.path)).toEqual([
      "/beats/0/scenes/0/cells/0/format",
    ]);
  });

  it("reports a value that matches no branch of a union as one problem", () => {
    const unknown = { kind: "music", layer: "l-0" };
    expect(validate(v2, withScene({ cells: [unknown] }))).toEqual([
      { path: "/beats/0/scenes/0/cells/0", message: "Instance does not match exactly one subschema (0 matches)." },
    ]);
  });

  it("escapes the member names of a path as a JSON Pointer", () => {
    const schema = { properties: { "a b/c~d": { type: "string" }, "100%": { type: "string" } } };
    const problems = validate(schema, { "a b/c~d": 1, "100%": 2 });

    expect(problems.map((problem) => problem.path)).toEqual(["/a b~1c~0d", "/100%"]);
  });

  it("throws on a schema it cannot evaluate", () => {
    expect(() => validate({ $ref: "#/$defs/missing" }, {})).toThrow('Unresolved $ref "#/$defs/missing"');
  });
});
