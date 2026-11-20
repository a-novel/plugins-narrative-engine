import { build, writeBuild } from "./build.js";
import { readPlugin } from "./folder.js";
import { copySample } from "./sample.fixture.js";

import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/** Loads a built module as a browser does: from its source alone, with nothing to import from. */
const load = (source: string) => import(`data:text/javascript,${encodeURIComponent(source)}`);

/** Builds a copy of the sample plugin with files replaced, added or removed. */
const buildWith = (files: Record<string, string | null> = {}) => build(readPlugin(copySample(files)));

describe("build", () => {
  it("builds the UI and each migration into one minified module", async () => {
    const { ui, migrations } = await buildWith();

    expect((await load(ui)).default.mount()).toEqual({ destroy: expect.any(Function) });
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

  it("sets the environment a browser does not define", async () => {
    const { ui } = await buildWith({ "ui/index.ts": "export default process.env.NODE_ENV;" });

    expect((await load(ui)).default).toBe("production");
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
