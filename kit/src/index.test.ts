import * as kit from "./index.js";

import { describe, expect, it } from "vitest";

describe("the package entry", () => {
  it("exports the host interface version and the functions, and nothing internal", () => {
    expect(kit.HOST_API).toBe(1);
    expect(Object.keys(kit).sort()).toEqual([
      "HOST_API",
      "checkManifest",
      "checkMessages",
      "listExports",
      "salvage",
      "upgrade",
      "validate",
    ]);
  });
});
