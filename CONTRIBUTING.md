# Contributing to plugins-narrative-engine

This document is about working in the plugins repository. Read the [project overview](./README.md)
first. The [developer guide](https://a-novel-kit.github.io/stack/) sets up the workspace and its
shared commands.

## Where code goes

The repository is a pnpm workspace, and the [README](./README.md#packages) names the locations of
its packages. A directory there joins the workspace once it holds a `package.json`.

The root holds the tooling: the ESLint and Prettier presets of
[`@a-novel-kit/nodelib-config`](https://github.com/a-novel-kit/nodelib/tree/master/packages/configs),
the Vitest configuration, and a `tsconfig.json` that type-checks the root's own TypeScript files.

Each package keeps its sources in its `src` directory, each test beside the file it covers as
`<name>.test.ts`. A `<name>.browser.test.ts` file runs in Chromium, and a `<name>.fixture.ts` file
holds data that only tests read. None of them is built, so none is published.

A host loads the contract in a browser and a Worker: its build reads no Node types, and a test fails
when its entry bundles a module outside the package and its dependency. What only a plugin author
runs goes in the kit, whose main entry exports the contract. The commands of `plugin-kit` live in
`kit/src/cli`. Code that knows nothing of plugins goes in
[nodelib](https://github.com/a-novel-kit/nodelib), where the JSON tools both packages depend on live.

A plugin lives in `plugins/<name>`, laid out as the [kit's README](./kit/README.md#the-folder)
describes. The name of its folder is its name in the registry: lowercase letters, digits and
hyphens. Its `package.json` holds no version, since its manifests name them, so a release of the
repository leaves a plugin as it is.

The `ui` folder of a plugin holds everything its UI module is built from: the components, and the
plain modules beside them, such as the types of its content, each with its test. A plugin's tests
write the fixtures of its current version as file snapshots, and `pnpm test -u` writes them again
after a change to what they hold. Its browser tests mount the UI module as `plugin-kit build`
writes it, which a fixture of the plugin builds once for the run, so they see the plugin a registry
serves.

`kit/test/sample` is a small plugin, laid out the same way. The tests check, build, preview and
publish it, then mount it in a browser. It imports the kit by its package name, as a plugin does, and the root
`package.json` declares what it depends on.

Two folders beside it hold a UI alone. `kit/test/overlays` opens what a plugin shows above its own
content, a list, a menu, a tooltip and a dialog, which the tests check from inside a shadow root.
`kit/test/button` imports one component of uikit, for the test of what a build leaves out.

## What CI checks

Run every command from the repository root.

| Command        | CI job     | What it checks                                                            |
| -------------- | ---------- | ------------------------------------------------------------------------- |
| `pnpm lint`    | `lint-js`  | Prettier, the type checks and ESLint, over the whole repository           |
| `pnpm test:ci` | `test-js`  | The packages compile, Vitest runs the tests, then every plugin is checked |
| `pnpm build`   | `build-js` | Each package compiles to its `dist`, the contract first: the kit reads it |

`pnpm test` runs the tests alone, in Node and Chromium, and `pnpm check:plugins` runs
`plugin-kit check` in the folder of every plugin. Both read the packages as compiled, so run
`pnpm build` first after a change to their sources. The browser tests need Chromium.
`pnpm exec playwright install chromium` downloads it, and CI runs them in the Playwright container
image.

Run `pnpm format` before committing, since `lint-js` fails on any Prettier difference.

## Looking at a plugin

`plugin-kit preview` serves a page that mounts a plugin as a host does, from the module
`plugin-kit build` writes. Compile the packages, then run it from the folder of the plugin:

```bash
pnpm build
cd plugins/scenes-composer
pnpm exec plugin-kit preview --host 127.0.0.1
```

It prints the address to open and what that address takes: a language, a fixture to start from,
and `?reset`. The [kit's README](./kit/README.md#the-commands) describes the page.

## Publishing

Both packages take the repository's version, and a release publishes them to GitHub Packages. Cut a
release from **Actions → release**; a `dry_run` shows the version it would cut. The workflow sizes
the release from the commit history, bumps the version and tags the commit, and the tag publishes
the packages. The protected `release` environment decides who can cut a release.

## Questions?

[Open an issue](https://github.com/a-novel/plugins-narrative-engine/issues) with logs and
environment details.
