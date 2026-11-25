# Narrative Engine plugins

The plugins A-Novel maintains for the Narrative Engine.

[![X (formerly Twitter) Follow](https://img.shields.io/twitter/follow/agorastoryverse)](https://twitter.com/agorastoryverse)
[![Fluxer](https://img.shields.io/badge/Fluxer-Agora-blue?logo=fluxer)](https://fluxer.gg/zrf7UIAg)

<hr />

![GitHub repo file or directory count](https://img.shields.io/github/directory-file-count/a-novel/plugins-narrative-engine)
![GitHub code size in bytes](https://img.shields.io/github/languages/code-size/a-novel/plugins-narrative-engine)
[![License: RPL-1.5](https://img.shields.io/badge/license-RPL--1.5-blue)](LICENSE)

![GitHub Actions Workflow Status](https://img.shields.io/github/actions/workflow/status/a-novel/plugins-narrative-engine/main.yaml)
[![codecov](https://codecov.io/gh/a-novel/plugins-narrative-engine/graph/badge.svg)](https://codecov.io/gh/a-novel/plugins-narrative-engine)

![Coverage graph](https://codecov.io/gh/a-novel/plugins-narrative-engine/graphs/sunburst.svg)

## What this is

This repository is the home of the plugins A-Novel maintains for the
[Narrative Engine](https://github.com/a-novel/service-narrative-engine), and of what they are built
with: the contract between a plugin and the application that hosts it, and the kit that checks,
builds, tests and publishes a plugin. A plugin defines one kind of document a writer works on: the
schema of its content, and the interface that edits it.

## Installation

The packages live on GitHub Packages. GitHub asks for a Personal Access Token with the
`read:packages` scope, even for a public package
([details](https://github.com/orgs/community/discussions/23386#discussioncomment-3240193)). Point the
`@a-novel` scope at the registry in an `.npmrc` at your project root, and the `@a-novel-kit` scope
with it, since the packages depend on [nodelib](https://github.com/a-novel-kit/nodelib) and
[uikit](https://github.com/a-novel-kit/uikit):

```ini
@a-novel:registry=https://npm.pkg.github.com
@a-novel-kit:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${YOUR_PERSONAL_ACCESS_TOKEN}
```

A plugin adds the kit, which brings the contract with it:

```bash
pnpm add @a-novel/plugins-narrative-engine-kit
```

An application that hosts plugins adds the contract alone:

```bash
pnpm add @a-novel/plugins-narrative-engine-contract
```

## Packages

The repository is a pnpm workspace. Its `pnpm-workspace.yaml` declares the locations of its
packages.

| Location          | For                                                                                                                                                                                |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `contract/`       | [`@a-novel/plugins-narrative-engine-contract`](./contract): what a host and a plugin share. Their types, the formats of a plugin version with their checks, and the upgrade chain. |
| `kit/`            | [`@a-novel/plugins-narrative-engine-kit`](./kit): what a plugin is written with. The contract, and the commands that check, build and publish a plugin.                            |
| `plugins/<name>/` | One plugin per directory, named after the plugin.                                                                                                                                  |

## Contributing

Start with the [developer guide](https://a-novel-kit.github.io/stack/), then read the
[contribution guide](./CONTRIBUTING.md).
