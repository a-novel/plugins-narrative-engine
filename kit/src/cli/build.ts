import type { PluginFolder, PluginVersion } from "./folder.js";

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

import { type PluginOption, build as bundleWithVite } from "vite";

import { svelte } from "@sveltejs/vite-plugin-svelte";

/** A Build is a plugin version as a registry stores its code: the source of each module. */
export interface Build {
  /** The UI module. */
  ui: string;
  /** The migration modules, by the version each one migrates to. */
  migrations: Record<string, string>;
}

/**
 * Builds the UI of a plugin and its migrations. `version` names the build in every CSS class of the
 * UI, so two versions on one page never share a style.
 *
 * @throws When a module does not build, or builds to more than one file.
 */
export async function build(plugin: PluginFolder, version = plugin.version): Promise<Build> {
  const [ui, migrations] = await Promise.all([buildUi(plugin, version), buildMigrations(plugin)]);

  return { ui, migrations };
}

/** Builds the migrations of a plugin, by the version each one migrates to. */
export async function buildMigrations({ path, versions }: PluginFolder): Promise<Record<string, string>> {
  const built = await Promise.all(versions.map((version) => buildMigration(path, version)));

  return Object.fromEntries(built.flat());
}

/** Builds the migration of one version, when it has one. */
async function buildMigration(path: string, { version, migration }: PluginVersion): Promise<[string, string][]> {
  return migration ? [[version, await bundle(path, migration)]] : [];
}

/** Builds the UI module of a plugin, with its own Svelte runtime and its styles. */
function buildUi({ path, name }: PluginFolder, version: string): Promise<string> {
  const salt = `${name}@${version}`;

  const compiler = svelte({
    configFile: false,
    compilerOptions: {
      // Each component adds its own style element to the shadow root it mounts in.
      css: "injected",
      // The path from the plugin keeps the classes the same wherever the build runs.
      cssHash: ({ hash, css, filename }) => `svelte-${hash(salt + relative(path, filename) + css)}`,
    },
  });

  return bundle(path, "ui/index.ts", [compiler]);
}

/**
 * Bundles one entry of a plugin into one minified ES module, with everything it imports, and
 * returns its source.
 */
async function bundle(root: string, entry: string, plugins: PluginOption[] = []): Promise<string> {
  const built = await bundleWithVite({
    root,
    configFile: false,
    logLevel: "warn",
    plugins,
    // A library build leaves this expression to the bundler of its consumer. A browser loads the
    // module as it is, where `process` does not exist.
    define: { "process.env.NODE_ENV": JSON.stringify("production") },
    build: {
      write: false,
      lib: { entry, formats: ["es"] },
      rolldownOptions: {
        // A library build keeps its whitespace for the same bundler.
        output: { codeSplitting: false, minify: true },
        // uikit's package declares no `sideEffects`, so one imported component brings every other
        // one in, with their own dependencies.
        // Tracked in https://github.com/a-novel-kit/uikit/issues/389
        treeshake: { moduleSideEffects: [{ test: /\/node_modules\/@a-novel-kit\/uikit\/dist\//, sideEffects: false }] },
      },
    },
  });

  const files = [built].flat().flatMap((result) => ("output" in result ? result.output : []));
  const [module] = files;
  if (files.length !== 1 || module?.type !== "chunk") {
    const names = files.map((file) => file.fileName).join(", ");
    throw new Error(`${entry}: a plugin module builds to one file, and this one builds to ${names}.`);
  }
  if (module.imports.length + module.dynamicImports.length > 0) {
    throw new Error(`${entry}: a plugin module imports nothing at run time.`);
  }

  return module.code;
}

/** Writes a build to the `dist` folder of its plugin, in place of what the folder held. */
export function writeBuild({ path }: PluginFolder, { ui, migrations }: Build): void {
  const dist = join(path, "dist");
  rmSync(dist, { recursive: true, force: true });
  mkdirSync(join(dist, "migrations"), { recursive: true });

  writeFileSync(join(dist, "ui.js"), ui);
  for (const [version, source] of Object.entries(migrations)) {
    writeFileSync(join(dist, "migrations", `${version}.js`), source);
  }
}
