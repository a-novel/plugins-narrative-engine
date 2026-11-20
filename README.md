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

## Packages

The repository is a pnpm workspace. Its `pnpm-workspace.yaml` declares two locations for packages,
and neither holds one yet.

| Location          | For                                                                |
| ----------------- | ------------------------------------------------------------------ |
| `kit/`            | The kit: the package a plugin is built, tested and published with. |
| `plugins/<name>/` | One plugin per directory, named after the plugin.                  |

## Contributing

Start with the [developer guide](https://a-novel-kit.github.io/stack/), then read the
[contribution guide](./CONTRIBUTING.md).
