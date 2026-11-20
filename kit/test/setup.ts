// Builds the sample plugin once for the browser tests, which load its UI as a registry serves it.
import { build } from "../src/cli/build.js";
import { readPlugin } from "../src/cli/folder.js";

import { fileURLToPath } from "node:url";

import type { TestProject } from "vitest/node";

import type { Json, Manifest, Messages } from "@a-novel/plugins-narrative-engine-contract";

/** The sample plugin, as a browser test receives it. */
export interface Sample {
  /** The manifest of the current version. */
  manifest: Manifest;
  /** A content of the current version. */
  content: Json;
  languages: Record<string, Messages>;
  /** The UI module of the current version. */
  ui: string;
  /** The same UI, built as a prerelease of the current version. */
  prerelease: string;
}

declare module "vitest" {
  export interface ProvidedContext {
    sample: Sample;
  }
}

export default async function setup(project: TestProject): Promise<void> {
  const plugin = readPlugin(fileURLToPath(new URL("./sample", import.meta.url)));
  const current = plugin.versions.at(-1)!;
  const [{ ui }, { ui: prerelease }] = await Promise.all([build(plugin), build(plugin, `${plugin.version}-dev.1`)]);

  project.provide("sample", {
    manifest: current.manifest as Manifest,
    content: Object.values(current.fixtures)[0]!,
    languages: plugin.languages as Record<string, Messages>,
    ui,
    prerelease,
  });
}
