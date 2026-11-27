import * as contract from "./index.js";

import { fileURLToPath } from "node:url";

import { build } from "vite";
import { describe, expect, it } from "vitest";

// The package's one dependency, and the validator that dependency brings.
const DEPENDENCY = /\/node_modules\/(@a-novel-kit\/nodelib-json|@cfworker\/json-schema)\//;

describe("the package entry", () => {
  it("exports the host interface version and the functions, and nothing internal", () => {
    expect(contract.HOST_API).toBe(1);
    expect(Object.keys(contract).sort()).toEqual([
      "HOST_API",
      "checkManifest",
      "checkMessages",
      "checkRules",
      "listDynamicLinks",
      "listExports",
      "upgrade",
    ]);
  });

  // A host imports the entry in a browser and in a Worker, where the modules of Svelte, of Vite and
  // of Node do not load.
  it("bundles its own modules, the JSON tools and their validator, and imports nothing else", async () => {
    const source = fileURLToPath(new URL(".", import.meta.url));
    const built = await build({
      configFile: false,
      logLevel: "silent",
      build: { write: false, lib: { entry: `${source}index.ts`, formats: ["es"] } },
    });

    const [entry] = [built].flat().flatMap((result) => ("output" in result ? result.output : []));
    const modules = Object.keys(entry!.type === "chunk" ? entry!.modules : {});
    const foreign = modules.filter((id) => !id.startsWith(source) && !DEPENDENCY.test(id));

    expect(modules).toContain(`${source}index.ts`);
    expect(foreign).toEqual([]);
    expect(entry).toMatchObject({ imports: [], dynamicImports: [] });
  });
});
