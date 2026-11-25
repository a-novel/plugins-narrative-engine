import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

import { playwright } from "@vitest/browser-playwright";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  test: {
    // The tests build real modules and run the command, which takes seconds on a CI runner.
    testTimeout: 30_000,
    coverage: {
      enabled: true,
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["{contract,kit}/src/**/*.ts", "plugins/*/ui/**/*.ts"],
      exclude: ["**/*.fixture.ts"],
    },
    projects: [
      {
        extends: true,
        test: {
          name: "node",
          environment: "node",
          include: ["{contract,kit}/src/**/*.test.ts", "plugins/*/ui/**/*.test.ts"],
          exclude: ["**/*.browser.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "browser",
          include: ["kit/{src,test}/**/*.browser.test.ts"],
          // Builds the sample plugin the tests mount.
          globalSetup: "kit/test/setup.ts",
          browser: { enabled: true, provider: playwright(), headless: true, instances: [{ browser: "chromium" }] },
        },
      },
    ],
  },
});
