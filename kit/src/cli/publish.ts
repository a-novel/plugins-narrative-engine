import { build } from "./build.js";
import { check } from "./check.js";
import type { PluginFolder } from "./folder.js";

import type { Manifest } from "@a-novel/plugins-narrative-engine-contract";

/** PublishOptions say where a plugin version goes, and under which version. */
export interface PublishOptions {
  /** The URL of the registry route that takes a plugin version. */
  url: string;
  /**
   * Prerelease identifiers, as `dev.1`. The plugin is then published as `<version>-dev.1`, for the
   * registry of a local stack.
   */
  prerelease?: string;
  /** The credential of the publisher, sent as a bearer token. */
  token?: string;
}

/** A Publication tells what a registry made of a plugin version. */
export interface Publication {
  /** The version the plugin was sent under. */
  version: string;
  /** Whether the registry took the version. It refuses one it already holds, which changes nothing. */
  published: boolean;
}

/**
 * Publishes the current version of a plugin: checks the plugin, builds it under the version it
 * publishes, then sends the whole version in one request.
 *
 * @throws When the plugin fails a check, with every problem. When the registry refuses the version,
 *   with the status and the body of its answer. When the registry does not answer.
 */
export async function publish(plugin: PluginFolder, { url, prerelease, token }: PublishOptions): Promise<Publication> {
  const problems = await check(plugin);
  if (problems.length > 0) throw new Error(problems.join("\n"));

  const version = prerelease === undefined ? plugin.version : `${plugin.version}-${prerelease}`;
  const { ui, migrations } = await build(plugin, version);
  const { schema, exports } = plugin.versions.at(-1)!.manifest as Manifest;
  // A version without a migration has no `migration` member: JSON leaves an undefined one out.
  const body = {
    plugin: plugin.name,
    version,
    schema,
    exports,
    ui,
    migration: migrations[plugin.version],
    languages: plugin.languages,
  };

  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token && { authorization: `Bearer ${token}` }) },
    body: JSON.stringify(body),
  }).catch((error: Error) => {
    // fetch says only that it failed. Its cause says why, as a refused connection.
    const reason = error.cause instanceof Error ? error.cause.message : error.message;
    throw new Error(`The registry does not answer at ${url}: ${reason}`, { cause: error });
  });
  const answer = await response.text();

  // A registry answers 409 for a version it holds.
  if (!response.ok && response.status !== 409) throw new Error(`The registry answered ${response.status}: ${answer}`);

  return { version, published: response.ok };
}
