// Builds the composer once for its browser tests, which mount the UI as a registry serves it.
import { MANIFEST } from "./manifest.fixture.ts";

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import type { TestProject } from "vitest/node";

import type { Manifest } from "@a-novel/plugins-narrative-engine-kit";

/** The composer, as a browser test receives it. */
export interface Built {
  /** The manifest of the current version. */
  manifest: Manifest;
  /** The UI module of the current version. */
  ui: string;
}

declare module "vitest" {
  export interface ProvidedContext {
    composer: Built;
  }
}

const FOLDER = fileURLToPath(new URL("..", import.meta.url));

export default function setup(project: TestProject): void {
  // The command of the kit, as an author runs it. It builds for production whatever the runner sets.
  execFileSync(join(FOLDER, "node_modules/.bin/plugin-kit"), ["build"], { cwd: FOLDER, stdio: "pipe" });

  project.provide("composer", { manifest: MANIFEST, ui: readFileSync(join(FOLDER, "dist/ui.js"), "utf8") });
}
