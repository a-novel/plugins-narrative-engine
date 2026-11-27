import manifest from "../../package.json" with { type: "json" };
import { makeApiKey, readToken } from "./apiKey.fixture.js";
import { SAMPLE, copySample } from "./sample.fixture.js";

import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { readFileSync, readdirSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it, onTestFinished } from "vitest";

// The command as the package ships it, which `pnpm build` compiles.
const COMMAND = fileURLToPath(new URL(`../../${manifest.bin["plugin-kit"]}`, import.meta.url));

/** Runs the command in the folder of a plugin. */
function run(folder: string, ...args: string[]) {
  const { status, stdout, stderr } = spawnSync(process.execPath, [COMMAND, ...args], { cwd: folder, encoding: "utf8" });

  return { status, stdout, stderr };
}

/** Runs the command as `run` does, without blocking, so a registry of the test can answer it. */
async function runAsync(folder: string, environment: Record<string, string>, ...args: string[]) {
  const command = spawn(process.execPath, [COMMAND, ...args], { cwd: folder, env: { ...process.env, ...environment } });
  let stdout = "";
  let stderr = "";
  command.stdout.setEncoding("utf8").on("data", (text: string) => (stdout += text));
  command.stderr.setEncoding("utf8").on("data", (text: string) => (stderr += text));
  const [status] = await once(command, "close");

  return { status, stdout, stderr };
}

describe("plugin-kit", () => {
  it("checks the plugin of the folder it runs in", () => {
    expect(run(SAMPLE, "check")).toEqual({ status: 0, stdout: "sample@1.1.0 passes every check.\n", stderr: "" });
  });

  it("lists the problems of a plugin, and fails", () => {
    const folder = copySample({ "fixtures/1.0.0/outline.json": "{}", "fixtures/1.1.0/outline.json": "[]" });

    expect(run(folder, "check")).toEqual({
      status: 1,
      stdout: "",
      stderr:
        'fixtures/1.0.0/outline.json: /: Instance type "object" is invalid. Expected "array".\n' +
        'fixtures/1.1.0/outline.json: /: Instance type "array" is invalid. Expected "object".\n',
    });
  });

  it("builds the sample plugin to one UI module and one module per migration", () => {
    expect(run(SAMPLE, "build")).toEqual({ status: 0, stdout: "Built sample@1.1.0 to dist.\n", stderr: "" });

    const built = readdirSync(join(SAMPLE, "dist"), { recursive: true }).sort();
    expect(built).toEqual(["migrations", "migrations/1.1.0.js", "ui.js"]);
    // The test runner sets NODE_ENV, under which Svelte would name each component's file in the module.
    expect(readFileSync(join(SAMPLE, "dist/ui.js"), "utf8")).not.toContain("App.svelte");
  });

  it("serves the preview of the plugin, and names what its address takes", async () => {
    const command = spawn(process.execPath, [COMMAND, "preview", "--port", "0", "--host", "127.0.0.1"], {
      cwd: SAMPLE,
    });
    onTestFinished(() => void command.kill());

    let printed = "";
    command.stdout.setEncoding("utf8").on("data", (text: string) => (printed += text));
    await expect.poll(() => printed, { timeout: 20_000 }).toContain("?reset");

    const [, address] = /^Previewing sample@1\.1\.0 at (http:\/\/127\.0\.0\.1:\d+\/)$/m.exec(printed) ?? [];
    expect(printed).toContain("  ?locale=<en|fr>\n  ?content=<outline>, the schema default without it\n");
    expect(await (await fetch(`${address}plugin.json`)).json()).toMatchObject({ name: "sample", version: "1.1.0" });
  });

  it("signs a publish with the API key of its environment, and prints none of it", async () => {
    const apiKey = makeApiKey();
    let authorization = "";
    let body: { proof?: string } = {};
    const registry = createServer(async (request, response) => {
      authorization = request.headers.authorization ?? "";
      body = JSON.parse(Buffer.concat(await request.toArray()).toString());
      response.writeHead(201).end();
    });
    await new Promise<void>((resolve) => registry.listen(0, "127.0.0.1", resolve));
    onTestFinished(() => void registry.close());
    const url = `http://127.0.0.1:${(registry.address() as AddressInfo).port}/`;

    expect(await runAsync(SAMPLE, { PLUGIN_PUBLISH_PRIVATE_KEY: apiKey.pem }, "publish", "--url", url)).toEqual({
      status: 0,
      stdout: "sample@1.1.0 is published.\n",
      stderr: "",
    });
    const token = authorization.replace(/^Bearer /, "");
    expect(readToken(token, apiKey.publicKey).claims).toMatchObject({ aud: "publish-narrative-engine-plugin" });
    expect(readToken(body.proof ?? "", apiKey.publicKey).claims).toMatchObject({ plugin: "sample", version: "1.1.0" });
  });

  // GitHub Actions sets an empty variable for a missing secret.
  it("fails on an empty API key before the check and any request", async () => {
    // The copy fails its check, so the check would report its fixture first. Port 0 answers
    // nothing: a request would fail on the registry instead.
    const folder = copySample({ "fixtures/1.0.0/outline.json": "{}" });
    expect(
      await runAsync(folder, { PLUGIN_PUBLISH_PRIVATE_KEY: "" }, "publish", "--url", "http://127.0.0.1:0/")
    ).toEqual({
      status: 1,
      stdout: "",
      stderr: "PLUGIN_PUBLISH_PRIVATE_KEY holds no Ed25519 private key in PEM.\n",
    });
  });

  it.each([[[]], [["release"]], [["check", "build"]], [["publish"]]])(
    "prints its usage for the arguments %j",
    (args) => {
      const { status, stdout, stderr } = run(SAMPLE, ...args);

      expect({ status, stdout }).toEqual({ status: 1, stdout: "" });
      expect(stderr).toContain("plugin-kit publish --url <url> [--prerelease <identifiers>]");
    }
  );
});
