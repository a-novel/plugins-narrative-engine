import manifest from "../../package.json" with { type: "json" };
import { SAMPLE, copySample } from "./sample.fixture.js";

import { spawn, spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
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

  it.each([[[]], [["release"]], [["check", "build"]], [["publish"]]])(
    "prints its usage for the arguments %j",
    (args) => {
      const { status, stdout, stderr } = run(SAMPLE, ...args);

      expect({ status, stdout }).toEqual({ status: 1, stdout: "" });
      expect(stderr).toContain("plugin-kit publish --url <url> [--prerelease <identifiers>]");
    }
  );
});
