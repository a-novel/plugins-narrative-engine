import { build, writeBuild } from "./build.js";
import { readPlugin } from "./folder.js";
import { copySample } from "./sample.fixture.js";

import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it, onTestFinished, vi } from "vitest";

/** Loads a built module as a browser does: from its source alone, with nothing to import from. */
const load = (source: string) => import(`data:text/javascript,${encodeURIComponent(source)}`);

/** Builds a copy of the sample plugin with files replaced, added or removed. */
const buildWith = (files: Record<string, string | null> = {}) => build(readPlugin(copySample(files)));

describe("build", () => {
  it("builds the UI and each migration into one minified module", async () => {
    const { ui, migrations } = await buildWith();

    expect((await load(ui)).default).toEqual({ mount: expect.any(Function) });
    expect(ui).not.toContain("descriptivelyNamedPlugin");

    expect(Object.keys(migrations)).toEqual(["1.1.0"]);
    expect((await load(migrations["1.1.0"]!)).default(["beat"])).toEqual({ migrated: { beats: ["beat"] } });
  });

  it("builds a plugin without a migration", async () => {
    const { migrations } = await buildWith({ migrations: null });

    expect(migrations).toEqual({});
  });

  it("bundles what a module imports", async () => {
    const { migrations } = await buildWith({
      "migrations/1.1.0.ts":
        'import { wrap } from "../lib/wrap.ts";\n\nexport default (content) => ({ migrated: wrap(content) });',
      "lib/wrap.ts": "export const wrap = (beats: unknown) => ({ beats });",
    });

    expect((await load(migrations["1.1.0"]!)).default([])).toEqual({ migrated: { beats: [] } });
  });

  it("carries the tokens of the plugin's UI kit, set on the host of its shadow root", async () => {
    const { ui } = await buildWith();

    // The palette and the tokens, then the rules that only a stylesheet of the shadow root applies.
    expect(ui).toContain(":host{--base-canvas:");
    expect(ui).toContain("--space-base:");
    expect(ui).toContain("[data-island]>*{");
    expect(ui).toContain("::selection{");
    expect(ui).not.toContain(":root");
  });

  it("leaves out what the UI does not import: a button of the UI kit brings no translation", async () => {
    const path = fileURLToPath(new URL("../../test/button", import.meta.url));
    // A production build names no file, so only the code of i18next could hold its name.
    vi.stubEnv("NODE_ENV", "production");
    onTestFinished(() => void vi.unstubAllEnvs());

    const { ui } = await build({ path, name: "button", version: "1.0.0", versions: [], languages: {} });

    expect(ui).not.toContain("i18next");
  });

  it("sets the environment a browser does not define", async () => {
    const { migrations } = await buildWith({ "migrations/1.1.0.ts": "export default () => process.env.NODE_ENV;" });

    expect((await load(migrations["1.1.0"]!)).default()).toBe("production");
  });

  it("refuses a module that builds to more than one file", async () => {
    const files = { "ui/index.ts": 'import "./style.css";\n\nexport default {};', "ui/style.css": "p { margin: 0 }" };

    await expect(buildWith(files)).rejects.toThrow(
      /^ui\/index\.ts: a plugin module builds to one file, and this one builds to \S+\.js, \S+\.css\.$/
    );
  });

  it("refuses a module that imports another one at run time", async () => {
    const files = { "ui/index.ts": 'export default () => import("https://plugins.test/more.js");' };

    await expect(buildWith(files)).rejects.toThrow("ui/index.ts: a plugin module imports nothing at run time.");
  });
});

describe("writeBuild", () => {
  it("writes the modules to the dist folder, in place of what it held", async () => {
    const plugin = readPlugin(copySample());
    const dist = join(plugin.path, "dist");
    mkdirSync(join(dist, "migrations"), { recursive: true });
    writeFileSync(join(dist, "migrations", "0.9.0.js"), "");

    writeBuild(plugin, { ui: "export default 1;", migrations: { "1.1.0": "export default 2;" } });

    expect(readdirSync(dist, { recursive: true }).sort()).toEqual(["migrations", "migrations/1.1.0.js", "ui.js"]);
    expect(readFileSync(join(dist, "ui.js"), "utf8")).toBe("export default 1;");
    expect(readFileSync(join(dist, "migrations/1.1.0.js"), "utf8")).toBe("export default 2;");
  });
});
