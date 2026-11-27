import { buildMigrations } from "./build.js";
import { type PluginFolder, findTokens } from "./folder.js";

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { validateJson } from "@a-novel-kit/nodelib-json";
import {
  type Json,
  type Manifest,
  type Messages,
  type Migration,
  type UpgradeStep,
  checkManifest,
  checkMessages,
  checkRules,
  upgrade,
} from "@a-novel/plugins-narrative-engine-contract";

/**
 * Lists what is wrong with a plugin, each problem opening with the file it is in. A valid plugin
 * lists nothing.
 *
 * Every manifest and every language passes the checks of the contract, where only the current
 * version is held to the English translation keys, and the styles of the UI keep the token contract
 * of the UI kit. Then every fixture is valid against its own version, whose rules address each of
 * its steps and parts, and upgrades to the current one through the built migrations, where a step
 * may set content aside only when it enters a new major version.
 *
 * @throws When a migration does not build, when the plugin does not depend on the UI kit, or when
 *   the token contract check does not run.
 */
export async function check(plugin: PluginFolder): Promise<string[]> {
  const problems = [...checkFiles(plugin), ...checkStyles(plugin)];
  // A fixture replays through the schema of every manifest, so the manifests hold first.
  if (problems.length > 0) return problems;

  return checkFixtures(plugin, await buildMigrations(plugin));
}

/**
 * Holds the styles of the UI to the token contract of the UI kit the plugin depends on, whose
 * tokens its build bundles. The tokens package ships the check as a command. A browser drops a
 * token nothing defines without a word: this check is what reports it.
 */
function checkStyles({ path }: PluginFolder): string[] {
  const tokens = findTokens(path);
  const { bin } = JSON.parse(readFileSync(join(tokens, "package.json"), "utf8")) as { bin: Record<string, string> };
  const contract = join(tokens, bin["uikit-token-contract"]!);

  const { stdout, stderr } = spawnSync(process.execPath, [contract, "ui"], { cwd: path, encoding: "utf8" });
  // The check ends on a count, after one line per violation.
  if (!/^Token contract: /m.test(stdout + stderr)) {
    throw new Error(`ui: the token contract check did not run.\n${stderr}`);
  }

  return stderr.split("\n").filter((line) => line !== "" && !line.startsWith("Token contract: "));
}

/**
 * Checks the languages of a plugin against English, and its manifests. Only the current version
 * reads its translation keys in the English messages: a past version was published with messages
 * the folder no longer holds.
 */
function checkFiles({ version: current, versions, languages }: PluginFolder): string[] {
  const english = languages.en as Messages | undefined;
  if (english === undefined) return ["i18n/en.json: a plugin needs its English messages."];

  const inLanguages = Object.entries(languages).flatMap(([language, messages]) =>
    checkMessages(english, messages).map((problem) => `i18n/${language}.json: ${problem}`)
  );
  const inManifests = versions.flatMap(({ version, manifest }) =>
    checkManifest(manifest, version === current ? english : undefined).map(
      (problem) => `versions/${version}.yaml: ${problem}`
    )
  );

  return [...inLanguages, ...inManifests];
}

/** Replays the fixtures of every version through the versions above it. */
async function checkFixtures({ versions }: PluginFolder, migrations: Record<string, string>): Promise<string[]> {
  const steps = await Promise.all(
    versions.map(async ({ version, manifest }) => ({
      version,
      schema: (manifest as Manifest).schema,
      migrate: await load(version, migrations[version]),
    }))
  );
  // The steps that stay inside a major version, where an upgrade loses nothing.
  const lossless = new Set(
    versions
      .map(({ version }) => version)
      .filter((version, index) => major(version) === major(versions[index - 1]?.version))
  );

  const problems: string[] = [];
  for (const [index, { manifest, fixtures }] of versions.entries()) {
    for (const [file, content] of Object.entries(fixtures)) {
      const found = await replay(content, manifest as Manifest, steps.slice(index + 1), lossless);
      problems.push(...found.map((problem) => `${file}: ${problem}`));
    }
  }

  return problems;
}

/** Reads the major number of a version. */
function major(version: string | undefined): string | undefined {
  return version?.split(".")[0];
}

/**
 * Loads a built migration from its source. A data URL resolves no import, so the module loads only
 * when it is whole.
 */
async function load(version: string, source: string | undefined): Promise<Migration | undefined> {
  if (source === undefined) return undefined;

  const module: { default?: unknown } = await import(`data:text/javascript,${encodeURIComponent(source)}`);
  if (typeof module.default !== "function") {
    throw new Error(`migrations/${version}.ts: a migration exports a function by default.`);
  }

  return module.default as Migration;
}

/** Checks one fixture against its own version, then against the upgrade to the current one. */
async function replay(
  content: Json,
  { schema, links }: Manifest,
  steps: UpgradeStep[],
  lossless: Set<string>
): Promise<string[]> {
  const invalid = validateJson(schema, content);
  if (invalid.length > 0) return invalid.map(({ path, message }) => `${path || "/"}: ${message}`);

  return [...checkRules(links, content), ...(await carry(content, steps, lossless))];
}

/** Carries one fixture to the current version, and lists what stops the upgrade or loses content. */
async function carry(content: Json, steps: UpgradeStep[], lossless: Set<string>): Promise<string[]> {
  let upgraded;
  try {
    upgraded = await upgrade(content, steps);
  } catch (error) {
    return [`the upgrade threw: ${error instanceof Error ? error.message : String(error)}`];
  }

  if (!upgraded.ok) return [`version ${upgraded.version} cannot take the content: ${upgraded.reason}`];

  return upgraded.unmigrated
    .filter(({ version }) => lossless.has(version))
    .map(
      ({ version, path }) =>
        `version ${version} loses ${path || "what its migration set aside"} inside a major version.`
    );
}
