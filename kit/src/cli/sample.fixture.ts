// The sample plugin of `kit/test/sample`, for the tests of the commands.
import { cpSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { onTestFinished } from "vitest";

/** The folder of the sample plugin. */
export const SAMPLE = fileURLToPath(new URL("../../test/sample", import.meta.url));

// What the sample plugin depends on, which the root package declares.
const DEPENDENCIES = fileURLToPath(new URL("../../../node_modules", import.meta.url));

// A UI that imports nothing builds in any folder.
const PLAIN_UI = `const descriptivelyNamedPlugin = {
  mount: () => ({ destroy() {} }),
};

export default descriptivelyNamedPlugin;
`;

/**
 * Copies the sample plugin to a temporary folder for the running test, which removes it once
 * finished. The copy keeps the name of the plugin and its dependencies, and takes a UI that imports
 * nothing. `files` replaces or adds files by their path from the plugin folder, and removes those
 * set to null.
 */
export function copySample(files: Record<string, string | null> = {}): string {
  const root = mkdtempSync(join(tmpdir(), "plugin-kit-"));
  onTestFinished(() => rmSync(root, { recursive: true, force: true }));
  symlinkSync(DEPENDENCIES, join(root, "node_modules"));

  const copy = join(root, basename(SAMPLE));
  cpSync(SAMPLE, copy, { recursive: true, filter: (source) => !["dist", "ui"].includes(basename(source)) });

  for (const [file, text] of Object.entries({ "ui/index.ts": PLAIN_UI, ...files })) {
    if (text === null) {
      rmSync(join(copy, file), { recursive: true });
      continue;
    }

    mkdirSync(dirname(join(copy, file)), { recursive: true });
    writeFileSync(join(copy, file), text);
  }

  return copy;
}
