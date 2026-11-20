import * as kit from "./index.js";

import { describe, expect, it } from "vitest";

import * as contract from "@a-novel/plugins-narrative-engine-contract";

describe("the package entry", () => {
  it("exports the whole contract, and nothing else", () => {
    expect({ ...kit }).toEqual({ ...contract });
  });
});
