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
      // The browser tests mount a UI as built, which no report maps back to its entry and its runes.
      exclude: ["**/*.fixture.ts", "plugins/*/ui/index.ts", "plugins/*/ui/**/*.svelte.ts"],
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
          include: ["kit/{src,test}/**/*.browser.test.ts", "plugins/*/ui/**/*.browser.test.ts"],
          // Build the plugins the tests mount: the sample of the kit, and the composer.
          globalSetup: ["kit/test/setup.ts", "plugins/scenes-composer/ui/built.fixture.ts"],
          browser: { enabled: true, provider: playwright(), headless: true, instances: [{ browser: "chromium" }] },
        },
      },
    ],
  },
});
