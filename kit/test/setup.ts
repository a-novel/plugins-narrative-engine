// Builds the plugins of the browser tests once, which load each UI as a registry serves it.
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
    /** The UI module of `kit/test/overlays`: what a plugin opens above its own content. */
    overlays: string;
  }
}

const folder = (name: string) => fileURLToPath(new URL(`./${name}`, import.meta.url));

export default async function setup(project: TestProject): Promise<void> {
  const plugin = readPlugin(folder("sample"));
  const current = plugin.versions.at(-1)!;
  const overlays = { path: folder("overlays"), name: "overlays", version: "1.0.0", versions: [], languages: {} };

  // A registry serves production builds, as the command makes them whatever NODE_ENV says.
  const environment = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  const [{ ui }, { ui: prerelease }, { ui: opened }] = await Promise.all([
    build(plugin),
    build(plugin, `${plugin.version}-dev.1`),
    build(overlays),
  ]);
  process.env.NODE_ENV = environment;

  project.provide("overlays", opened);
  project.provide("sample", {
    manifest: current.manifest as Manifest,
    content: Object.values(current.fixtures)[0]!,
    languages: plugin.languages as Record<string, Messages>,
    ui,
    prerelease,
  });
}
