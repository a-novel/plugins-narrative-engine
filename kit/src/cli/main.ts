#!/usr/bin/env node
// The `plugin-kit` command. It runs in the folder of a plugin.
import { build, writeBuild } from "./build.js";
import { check } from "./check.js";
import { readPlugin } from "./folder.js";
import { publish } from "./publish.js";

import { parseArgs } from "node:util";

const USAGE = `Usage, from the folder of a plugin:
  plugin-kit check
  plugin-kit build
  plugin-kit publish --url <url> [--prerelease <identifiers>]`;

/** Runs the command the arguments name, and returns what to tell the developer. */
async function run(): Promise<string> {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: { url: { type: "string" }, prerelease: { type: "string" } },
  });
  const [command] = positionals;
  if (positionals.length !== 1 || !["check", "build", "publish"].includes(command!)) throw new Error(USAGE);

  const plugin = readPlugin(process.cwd());
  const current = `${plugin.name}@${plugin.version}`;

  if (command === "build") {
    writeBuild(plugin, await build(plugin));
    return `Built ${current} to dist.`;
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
