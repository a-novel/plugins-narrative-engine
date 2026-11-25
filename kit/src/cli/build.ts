import { type PluginFolder, type PluginVersion, findTokens } from "./folder.js";

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

// The module a UI builds from, which no file holds.
const UI = "\0plugin-kit:ui";

/**
 * Builds the UI module of a plugin, with its own Svelte runtime, its styles and the design tokens
 * it was built with.
 */
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

  return bundle(path, "ui/index.ts", [compiler, withTokens(path)], UI);
}

/**
 * Wraps the UI of a plugin so that it carries the tokens of its own UI kit, and reads none from its
 * host: an instance pins a version of the plugin, which must render as built whatever the host
 * runs since. The tokens set themselves on the root of a document, so each `:root` becomes the
 * host of the shadow root the plugin mounts in. The root's text style comes with them, since a
 * plugin inherits its host's otherwise.
 */
function withTokens(path: string): PluginOption {
  const tokens = `${join(findTokens(path), "tokens.css")}?inline`;
  const wrapped = `
    import plugin from ${JSON.stringify(join(path, "ui/index.ts"))};
    import tokens from ${JSON.stringify(tokens)};

    let sheet;

    export default {
      mount(target, host) {
        if (sheet === undefined) {
          sheet = new CSSStyleSheet();
          sheet.replaceSync(tokens + ":host{font:var(--text-body)}");
        }

        const root = target.getRootNode();
        if (!root.adoptedStyleSheets.includes(sheet)) root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet];

        return plugin.mount(target, host);
      },
    };
  `;

  return {
    name: "plugin-kit:tokens",
    // After Vite has inlined the stylesheet's imports and minified it into a string.
    enforce: "post",
    resolveId: (id) => (id === UI ? id : undefined),
    load: (id) => (id === UI ? wrapped : undefined),
    transform: (code, id) => (id === tokens ? code.replaceAll(":root", ":host") : undefined),
  };
}

/**
 * Bundles one entry of a plugin into one minified ES module, with everything it imports, and
 * returns its source. `input` names the module to bundle when no file holds it.
 */
async function bundle(root: string, entry: string, plugins: PluginOption[] = [], input?: string): Promise<string> {
  const built = await bundleWithVite({
    root,
    configFile: false,
    logLevel: "warn",
    plugins,
    // A library build leaves this expression to the bundler of its consumer. A browser loads the
    // module as it is, where `process` does not exist.
    define: { "process.env.NODE_ENV": JSON.stringify("production") },
    // The tokens build as the UI kit ships them, whatever PostCSS configuration sits above the plugin.
    css: { postcss: {} },
    build: {
      write: false,
      lib: { entry, formats: ["es"] },
      rolldownOptions: {
        input,
        // Compiling Svelte is most of a build, which the bundler reports as a warning on a slow machine.
        checks: { bundlerTimings: false },
        // A library build keeps its whitespace for the same bundler.
        output: { codeSplitting: false, minify: true },
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
