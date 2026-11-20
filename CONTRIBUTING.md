# Contributing to plugins-narrative-engine

This document is about working in the plugins repository. Read the [project overview](./README.md)
first. The [developer guide](https://a-novel-kit.github.io/stack/) sets up the workspace and its
shared commands.

## Where code goes

The repository is a pnpm workspace, and the [README](./README.md#packages) names the two locations
of its packages. A directory there joins the workspace once it holds a `package.json`.

The root holds the tooling: the ESLint and Prettier presets of
[`@a-novel-kit/nodelib-config`](https://github.com/a-novel-kit/nodelib/tree/master/packages/configs),
the Vitest configuration, and a `tsconfig.json` that type-checks the root's own TypeScript files.

The kit keeps its sources in `kit/src`, each test beside the file it covers as `<name>.test.ts`. A
`<name>.fixture.ts` file holds data that only tests read. Neither kind is built, so neither is
published.

## What CI checks

Run every command from the repository root.

| Command      | CI job     | What it checks                                                  |
| ------------ | ---------- | --------------------------------------------------------------- |
| `pnpm lint`  | `lint-js`  | Prettier, the type checks and ESLint, over the whole repository |
| `pnpm test`  | `test-js`  | The unit tests, with Vitest                                     |
| `pnpm build` | `build-js` | The kit compiles to `kit/dist`                                  |

Run `pnpm format` before committing, since `lint-js` fails on any Prettier difference.

## Publishing

The kit takes the repository's version, and a release publishes it to GitHub Packages. Cut a release
from **Actions → release**; a `dry_run` shows the version it would cut. The workflow sizes the
release from the commit history, bumps the version and tags the commit, and the tag publishes the
package. The protected `release` environment decides who can cut a release.

## Questions?

[Open an issue](https://github.com/a-novel/plugins-narrative-engine/issues) with logs and
environment details.
