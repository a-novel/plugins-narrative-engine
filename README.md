# Narrative Engine plugins

The plugins A-Novel maintains for the Narrative Engine.

[![X (formerly Twitter) Follow](https://img.shields.io/twitter/follow/agorastoryverse)](https://twitter.com/agorastoryverse)
[![Fluxer](https://img.shields.io/badge/Fluxer-Agora-blue?logo=fluxer)](https://fluxer.gg/zrf7UIAg)

<hr />

![GitHub repo file or directory count](https://img.shields.io/github/directory-file-count/a-novel/plugins-narrative-engine)
![GitHub code size in bytes](https://img.shields.io/github/languages/code-size/a-novel/plugins-narrative-engine)
[![License: RPL-1.5](https://img.shields.io/badge/license-RPL--1.5-blue)](LICENSE)

![GitHub Actions Workflow Status](https://img.shields.io/github/actions/workflow/status/a-novel/plugins-narrative-engine/main.yaml)

## What this is

This repository is the home of the plugins A-Novel maintains for the
[Narrative Engine](https://github.com/a-novel/service-narrative-engine), and of the kit they are
built with. A plugin defines one kind of document a writer works on: the schema of its content, and
the interface that edits it.

## Installation

The kit lives on GitHub Packages. GitHub asks for a Personal Access Token with the `read:packages`
scope, even for a public package
([details](https://github.com/orgs/community/discussions/23386#discussioncomment-3240193)). Point the
`@a-novel` scope at the registry in an `.npmrc` at your project root:

```ini
@a-novel:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${YOUR_PERSONAL_ACCESS_TOKEN}
```

Then add the kit:

```bash
pnpm add @a-novel/plugins-narrative-engine-kit
```

## Packages

The repository is a pnpm workspace. Its `pnpm-workspace.yaml` declares two locations for packages.

| Location          | For                                                                                                                                                          |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `kit/`            | [`@a-novel/plugins-narrative-engine-kit`](./kit): the contract between a host and a plugin, with the checks and the upgrade chain that keep a content valid. |
| `plugins/<name>/` | One plugin per directory, named after the plugin.                                                                                                            |

## Contributing

Start with the [developer guide](https://a-novel-kit.github.io/stack/), then read the
[contribution guide](./CONTRIBUTING.md).
