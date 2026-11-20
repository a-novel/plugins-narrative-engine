# Contributing to plugins-narrative-engine

This document is about working in the plugins repository. Read the [project overview](./README.md)
first. The [developer guide](https://a-novel-kit.github.io/stack/) sets up the workspace and its
shared commands.

## Where code goes

The repository is a pnpm workspace, and the [README](./README.md#packages) names the two locations
of its packages. A directory there joins the workspace once it holds a `package.json`.

The root holds the tooling: the ESLint and Prettier presets of
[`@a-novel-kit/nodelib-config`](https://github.com/a-novel-kit/nodelib/tree/master/packages/configs),
and a `tsconfig.json` that type-checks the root's own TypeScript files.

## What CI checks

`pnpm lint` runs the Prettier check, the type check and ESLint over the whole repository, and CI
runs it as the `lint-js` job. Run `pnpm format` before committing, since the job fails on any
Prettier difference.

## Questions?

[Open an issue](https://github.com/a-novel/plugins-narrative-engine/issues) with logs and
environment details.
