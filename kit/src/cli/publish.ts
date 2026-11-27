import { build } from "./build.js";
import { check } from "./check.js";
import type { PluginFolder } from "./folder.js";

import { createHash } from "node:crypto";

import { type JwtPayload, createProofSigner, createRequestTokenSigner } from "@a-novel-kit/nodelib-server";
import type { Manifest } from "@a-novel/plugins-narrative-engine-contract";

/** The variable that holds the publisher's API key: an Ed25519 private key, in PEM. */
export const API_KEY_VARIABLE = "PLUGIN_PUBLISH_PRIVATE_KEY";

/** The one thing an API key of a publisher may do (a-novel/.github#642). */
const PURPOSE = "publish-narrative-engine-plugin";

/** ApiKey signs with the publisher's API key the two tokens of a-novel/.github#642. */
export interface ApiKey {
  /** Signs the request token of a body, which the request sends as its bearer token. */
  signRequest: (body: string) => string;
  /** Signs the proof of a version, which the body carries and the registry keeps with it. */
  signProof: (claims: JwtPayload) => string;
}

/** PublishOptions say where a plugin version goes, and under which version. */
export interface PublishOptions {
  /** The URL of the registry route that takes a plugin version. */
  url: string;
  /**
   * Prerelease identifiers, as `dev.1`. The plugin is then published as `<version>-dev.1`, for the
   * registry of a local stack.
   */
  prerelease?: string;
  /**
   * The publisher's API key. Without it, the request carries no credential and the version no proof,
   * for the open registry of a local stack.
   */
  apiKey?: ApiKey;
}

/** A Publication tells what a registry made of a plugin version. */
export interface Publication {
  /** The version the plugin was sent under. */
  version: string;
  /** Whether the registry took the version. It refuses one it already holds, which changes nothing. */
  published: boolean;
}

/**
 * Reads the publisher's API key from the environment, and returns what signs with it. Without the
 * variable, a publish carries no credential and no proof.
 *
 * @throws When the variable holds no Ed25519 private key in PEM, an empty value included. The error
 *   names the variable and quotes none of its value.
 */
export function readApiKey(environment: NodeJS.ProcessEnv): ApiKey | undefined {
  const privateKey = environment[API_KEY_VARIABLE];
  if (privateKey === undefined) return undefined;

  const options = { privateKey, purpose: PURPOSE };
  try {
    return { signRequest: createRequestTokenSigner(options), signProof: createProofSigner(options) };
  } catch {
    throw new Error(`${API_KEY_VARIABLE} holds no Ed25519 private key in PEM.`);
  }
}

/**
 * Publishes the current version of a plugin: checks the plugin, builds it under the version it
 * publishes, then sends the whole version in one request.
 *
 * @throws When the plugin fails a check, with every problem. When the registry refuses the version,
 *   with the status and the body of its answer. When the registry does not answer.
 */
export async function publish(plugin: PluginFolder, { url, prerelease, apiKey }: PublishOptions): Promise<Publication> {
  const problems = await check(plugin);
  if (problems.length > 0) throw new Error(problems.join("\n"));

  const version = prerelease === undefined ? plugin.version : `${plugin.version}-${prerelease}`;
  const { ui, migrations } = await build(plugin, version);
  const { schema, exports } = plugin.versions.at(-1)!.manifest as Manifest;
  const migration = migrations[plugin.version];
  // The proof covers both modules byte for byte, as the registry stores and serves them
  // (a-novel/.github#617). JSON leaves out an undefined member, so a version without a migration
  // sends neither `migration` nor its digest.
  const proof = apiKey?.signProof({
    plugin: plugin.name,
    version,
    uiSHA256: sha256(ui),
    migrationSHA256: migration === undefined ? undefined : sha256(migration),
  });
  // The request token signs the digest of the body, so the request sends this very string.
  const body = JSON.stringify({
    plugin: plugin.name,
    version,
    schema,
    exports,
    ui,
    migration,
    languages: plugin.languages,
    proof,
  });

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(apiKey && { authorization: `Bearer ${apiKey.signRequest(body)}` }),
    },
    body,
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

/** The lowercase hex SHA-256 of a module, a string counting as its UTF-8 bytes. */
function sha256(module: string): string {
  return createHash("sha256").update(module).digest("hex");
}
