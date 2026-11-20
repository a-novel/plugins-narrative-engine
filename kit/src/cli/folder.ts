import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";

import type { Json } from "@a-novel/plugins-narrative-engine-contract";

import { parse as parseYaml } from "yaml";

/** A PluginVersion is one released version of a plugin, as its folder holds it. */
export interface PluginVersion {
  version: string;
  /** The parsed manifest, which nothing has checked yet. */
  manifest: unknown;
  /** The path of the version's migration from the plugin folder, when it has one. */
  migration?: string;
  /** The sample contents of the version, by their path from the plugin folder. */
  fixtures: Record<string, Json>;
}

/** A PluginFolder is what the folder of a plugin holds, read once for every command. */
export interface PluginFolder {
  /** The absolute path of the folder. */
  path: string;
  /** The name of the plugin, which is the name of its folder. */
  name: string;
  /** The current version, which is the highest one. */
  version: string;
  /** Every released version, oldest first. */
  versions: PluginVersion[];
  /** The parsed language files, by language. Nothing has checked them yet. */
  languages: Record<string, unknown>;
}

// A version is three numbers without a leading zero, as semantic versioning writes a release.
const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

/**
 * Reads the folder of a plugin: its manifests, migrations, fixtures and languages. The UI stays on
 * disk for the build.
 *
 * @throws When the folder holds no manifest, when a file is not where the layout expects it, and
 *   when a file cannot be parsed.
 */
export function readPlugin(path: string): PluginFolder {
  // Numeric collation orders 1.10.0 after 1.9.0.
  const released = names(path, "versions", ".yaml").sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
  const current = released.at(-1);
  if (current === undefined) throw new Error("versions: a plugin needs the manifest of one version at least.");

  for (const version of released) {
    if (!VERSION.test(version)) throw new Error(`versions/${version}.yaml: a manifest is named after its version.`);
  }

  const migrations = names(path, "migrations", ".ts");
  const fixtures = names(path, "fixtures", "");
  for (const [directory, entries] of Object.entries({ migrations, fixtures })) {
    const unknown = entries.find((version) => !released.includes(version));
    if (unknown !== undefined) throw new Error(`${directory}/${unknown}: no manifest declares this version.`);
  }

  const versions = released.map((version) => ({
    version,
    manifest: read(path, `versions/${version}.yaml`, parseYaml),
    ...(migrations.includes(version) && { migration: `migrations/${version}.ts` }),
    fixtures: files(path, `fixtures/${version}`),
  }));

  const languages = Object.entries(files(path, "i18n")).map(([file, messages]) => [basename(file, ".json"), messages]);

  return { path, name: basename(path), version: current, versions, languages: Object.fromEntries(languages) };
}

/** Reads every JSON file of a directory of the plugin, by its path from the plugin folder. */
function files(path: string, directory: string): Record<string, Json> {
  const paths = names(path, directory, ".json").map((name) => `${directory}/${name}.json`);

  return Object.fromEntries(paths.map((file) => [file, read(path, file, JSON.parse)]));
}

/**
 * Lists the entries of a directory of the plugin without their extension. A directory the plugin
 * does not have lists nothing, and an entry with another extension is an error.
 */
function names(path: string, directory: string, extension: string): string[] {
  if (!existsSync(join(path, directory))) return [];

  return readdirSync(join(path, directory)).map((entry) => {
    if (!entry.endsWith(extension)) throw new Error(`${directory}/${entry}: expected a ${extension} file.`);

    return entry.slice(0, entry.length - extension.length);
  });
}

/** Decodes a file of the plugin, and names the file in what the decoder throws. */
function read<Decoded>(path: string, file: string, decode: (text: string) => Decoded): Decoded {
  try {
    return decode(readFileSync(join(path, file), "utf8"));
  } catch (error) {
    throw new Error(`${file}: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
  }
}
