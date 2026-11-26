#!/usr/bin/env node
// The `plugin-kit` command. It runs in the folder of a plugin.
import { build, writeBuild } from "./build.js";
import { check } from "./check.js";
import { readPlugin } from "./folder.js";
import { preview } from "./preview.js";
import { publish } from "./publish.js";

import { basename } from "node:path";
import { parseArgs } from "node:util";

// Vite and Svelte build for the mode NODE_ENV names, and a development build holds the paths of the
// machine it ran on. The command builds what a registry serves, whatever its shell sets.
process.env.NODE_ENV = "production";

const USAGE = `Usage, from the folder of a plugin:
  plugin-kit check
  plugin-kit build
  plugin-kit preview [--port <port>] [--host <address>]
  plugin-kit publish --url <url> [--prerelease <identifiers>]`;

/** Runs the command the arguments name, and returns what to tell the developer. */
async function run(): Promise<string> {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      url: { type: "string" },
      prerelease: { type: "string" },
      port: { type: "string" },
      host: { type: "string" },
    },
  });
  const [command] = positionals;
  if (positionals.length !== 1 || !["check", "build", "preview", "publish"].includes(command!)) throw new Error(USAGE);

  const plugin = readPlugin(process.cwd());
  const current = `${plugin.name}@${plugin.version}`;

  if (command === "build") {
    writeBuild(plugin, await build(plugin));
    return `Built ${current} to dist.`;
  }

  if (command === "preview") {
    const server = await preview(plugin.path, {
      port: values.port ? Number(values.port) : undefined,
      host: values.host,
    });
    const starts = Object.keys(plugin.versions.at(-1)!.fixtures).map((file) => basename(file, ".json"));

    // The page shows the plugin alone, so the command names what its address takes.
    return [
      `Previewing ${current} at ${server.resolvedUrls!.local[0]}`,
      `  ?locale=<${Object.keys(plugin.languages).join("|")}>`,
      `  ?content=<${starts.join("|")}>, the schema default without it`,
      "  ?reset forgets what the plugin saved for that start",
    ].join("\n");
  }

  if (command === "check") {
    const problems = await check(plugin);
    if (problems.length > 0) throw new Error(problems.join("\n"));
    return `${current} passes every check.`;
  }

  if (values.url === undefined) throw new Error(USAGE);
  const token = process.env.PLUGIN_PUBLISH_TOKEN;
  const { version, published } = await publish(plugin, { url: values.url, prerelease: values.prerelease, token });
  return `${plugin.name}@${version} ${published ? "is published" : "was already published"}.`;
}

try {
  console.log(await run());
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
