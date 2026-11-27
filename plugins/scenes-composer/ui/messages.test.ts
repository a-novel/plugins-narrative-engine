import { fill } from "./messages.ts";

import { describe, expect, it } from "vitest";

describe("fill", () => {
  it.each([
    ["Scene {{position}}", { position: 12 }, "Scene 12"],
    ["{{layer}}, {{scene}}", { layer: "Scenes", scene: "The last ferry" }, "Scenes, The last ferry"],
    ["You deleted “{{name}}”, {{name}}.", { name: "Setup" }, "You deleted “Setup”, Setup."],
    ["No place to fill", { name: "Setup" }, "No place to fill"],
  ])("fills the places of %j", (message, values, expected) => {
    expect(fill(message, values)).toBe(expected);
  });
});
