# @a-novel/plugins-narrative-engine-kit

What an author needs to write a plugin of the Narrative Engine: the contract with the application
that hosts it, and the tools that check, build, test and publish a plugin.

## Installation

Configure the registry as the
[repository README](https://github.com/a-novel/plugins-narrative-engine#installation) shows, then add
the package:

```bash
pnpm add @a-novel/plugins-narrative-engine-kit
```

## What it holds

A plugin version is a manifest, a UI module, an optional migration and its messages. An instance is
one use of a plugin in a project: it pins a version and holds one JSON document, its content. The
host is the application that mounts plugins and saves their content, which is Studio today.

| Part                                           | For               | What it gives                                              |
| ---------------------------------------------- | ----------------- | ---------------------------------------------------------- |
| `@a-novel/plugins-narrative-engine-kit`        | A plugin          | The contract between a plugin and its host                 |
| `@a-novel/plugins-narrative-engine-kit/svelte` | A plugin          | `definePlugin`, which makes a plugin of a Svelte component |
| `@a-novel/plugins-narrative-engine-kit/test`   | A plugin's tests  | `mountPlugin`, a host that keeps everything in memory      |
| `plugin-kit`                                   | A plugin's folder | The commands that check, build and publish a plugin        |

The main entry exports the whole
[contract](https://github.com/a-novel/plugins-narrative-engine/tree/master/contract), the
package `@a-novel/plugins-narrative-engine-contract`, so a plugin installs this package alone. The
contract's README is the reference for the `Plugin` and `Host` types, and for the formats of a
manifest, of a language and of a migration. An application that hosts plugins installs the contract
without the kit.

## Writing a plugin

### The folder

A plugin is one folder, named after the plugin, and a private package of its workspace. Its
`package.json` depends on `svelte`, on `@a-novel-kit/uikit` and on this package. The build bundles
the tokens of that uikit, which is 0.27.0 or later.

```text
scenes-composer/
├── package.json
├── versions/1.0.0.yaml      one manifest per released version
├── migrations/1.1.0.ts      optional: the migration to that version
├── fixtures/1.0.0/*.json    sample contents of that version
├── ui/index.ts              the UI module of the current version
└── i18n/en.json             one file per language, English at least
```

The highest version among the manifests is the current version: the UI and the languages belong to
it. Releasing a version adds a manifest and leaves the earlier ones as they are, since instances
still pin them.

### The UI module

A UI module exports a
[`Plugin`](https://github.com/a-novel/plugins-narrative-engine/tree/master/contract#the-ui-module)
by default. The host calls `mount` with an element and a `Host`, and keeps the handle it gets back.
Everything a plugin exchanges with the host is JSON, and every call returns a promise.

A plugin written in Svelte wraps its root component, which receives the host as its `host` prop:

```ts
import App from "./App.svelte";

import { definePlugin } from "@a-novel/plugins-narrative-engine-kit/svelte";

export default definePlugin(App);
```

### The styles

A plugin brings its own components and its own design tokens. `build` bundles the tokens of the
[uikit](https://github.com/a-novel-kit/uikit) the plugin depends on, and the UI module sets them on
the shadow root it mounts in. The host gives the rest: the fonts, the canvas and its lamp.

- **A version renders as built.** An instance pins a version of a plugin, and uikit removes and
  renames tokens between releases. With its tokens in its module, a version looks the same under
  whatever uikit its host runs since.
- **The canvas holds a plugin.** A plugin renders on the page of its host, not inside a card. It
  titles its own groups with uikit's `Section` and builds its own `Card`s, as a page does.
- **A plugin's own CSS keeps uikit's token contract.** Text takes a style in one declaration,
  `font: var(--text-body)`, and each space, size and color takes the token of its role. A value no
  token holds carries an `/* off-scale: <reason> */` comment directly above it. `plugin-kit check`
  holds the `ui` folder to the contract of the tokens it bundles. A browser drops a custom property
  nothing defines without a word, so a misspelled or removed token shows as a missing color or
  space, never as an error: the check is what reports it.
- **The lamp is the host's.** The tokens name the three lamps and read the one the document chose,
  `--color-lamp`. A plugin sets none.

What a plugin opens above its own content behaves as follows from inside a shadow root:

| What a plugin opens                                       | In a shadow root                                                |
| --------------------------------------------------------- | --------------------------------------------------------------- |
| The list of a `Select` or a `Combobox`, a menu, a tooltip | Opens against its source, as on a page                          |
| A modal `Dialog`                                          | Opens and dims the page, which it neither blurs nor holds still |

The modal dialog is a known gap. uikit's `Dialog` blurs and holds the page through rules on the
root of the document, which match nothing from a shadow root. The page behind a plugin's dialog
stays sharp, and scrolls.

### The manifest

A manifest holds the schema of the content and the items an instance exports for links. A plugin
writes one per version in YAML, `versions/<version>.yaml`, and publishes it as JSON. The contract
holds
[its format and its rules](https://github.com/a-novel/plugins-narrative-engine/tree/master/contract#the-manifest),
which `plugin-kit check` applies.

### The messages

Each language is one document, `i18n/<language>.json`, in the
[format of the contract](https://github.com/a-novel/plugins-narrative-engine/tree/master/contract#the-messages).
English is the reference: every other language holds exactly its keys.

### A migration

A version whose schema refuses the content of the version before it ships a migration,
`migrations/<version>.ts`. The module exports a `Migration` by default: it receives the content of
the previous version and returns it in the new shape. What the new shape has no place for goes in
`unmigrated`, which the host keeps for the writer.

```ts
import type { Migration } from "@a-novel/plugins-narrative-engine-kit";

// The version before held the list of beats alone.
const migrate: Migration = (content) => ({ migrated: { beats: content } });

export default migrate;
```

Each version keeps sample contents in `fixtures/<version>/`, one JSON document per file. They are
what proves an upgrade: `plugin-kit check` carries each one to the current version.

### The commands

The package installs `plugin-kit`, which runs in the folder of a plugin.

| Command                          | What it does                                                             |
| -------------------------------- | ------------------------------------------------------------------------ |
| `plugin-kit check`               | Checks the manifests, the languages and the styles, then every fixture   |
| `plugin-kit build`               | Writes `dist/ui.js` and one `dist/migrations/<version>.js` per migration |
| `plugin-kit publish --url <url>` | Checks and builds the plugin, then sends its current version             |

`check` lists every problem under its file, and fails when it finds one. It runs in two stages:

1. Every language holds the keys of English, and every manifest follows the rules of its format.
   These are `checkMessages` and `checkManifest` of the contract, which a tool can
   [call itself](https://github.com/a-novel/plugins-narrative-engine/tree/master/contract#checking-a-version).
   Only the current version reads its translation keys in the English messages: a past version was
   published with its own, so a key it names can leave. The styles of the `ui` folder keep
   [uikit's token contract](#the-styles), which the check of the plugin's own tokens package
   verifies (`uikit-token-contract`).
2. Every fixture is valid against the schema of its own version. It then upgrades through each later
   version as a host upgrades an instance, with the migrations as `build` writes them. An upgrade
   may set content aside only on the step that enters a new major version, and no step may stop it.

`build` bundles each module with everything it imports, minified, into one file that a browser
loads as it is. The command always builds for production, whatever `NODE_ENV` says. A UI module
holds its own Svelte runtime and the components it uses, and nothing of those it leaves out. Its
styles come from its Svelte components, which add them to the shadow root they mount in, and a
build that needs a second file fails. The class that scopes a component's styles is hashed with the
name and the version of the plugin, so two versions on one page never share a style. The tokens add
about 18 KB to the module, 3.4 KB once compressed.

`publish` sends the current version in one `POST` request, with `PLUGIN_PUBLISH_TOKEN` as a bearer
token when the variable is set:

```json
{
  "plugin": "scenes-composer",
  "version": "1.1.0",
  "schema": {},
  "exports": {},
  "ui": "the source of the UI module",
  "migration": "the source of the migration to this version, when it has one",
  "languages": { "en": { "title": "", "description": "", "messages": {} } }
}
```

A registry answers 409 for a version it already holds, which `publish` reads as done, so a release
can run twice. Any other refusal fails the command with the status and the body of the answer.
`--prerelease dev.1` publishes the current version as `<version>-dev.1`, for the registry of a local
stack.

### Testing a plugin

`mountPlugin` mounts a plugin as a host does: in a shadow root, on a document that carries uikit's
fonts and canvas. The document is lit by Studio's lamp, and the plugin sits in the insets of a
page. Its host keeps the content and the links in memory, so a test reads back what the plugin
saved. It needs a real browser, as Vitest gives in browser mode.

A project that imports the UI from its sources compiles Svelte with `css: "injected"`, as `build`
does, so the styles follow the plugin into the shadow root. Such a UI comes without its tokens: it
reads those of the test host's document, and gets none of their rules, so a field in a card keeps
the ring it takes on the canvas. Mount the module `plugin-kit build` writes to see a plugin as its
registry serves it.

```ts
import plugin from "../ui/index.ts";

import { expect, it } from "vitest";
import { page } from "vitest/browser";

import { mountPlugin } from "@a-novel/plugins-narrative-engine-kit/test";

it("saves a new beat", async () => {
  const mounted = mountPlugin(plugin, { content: { beats: [] } });
  const view = page.elementLocator(mounted.target);

  await view.getByRole("textbox", { name: "Title" }).fill("Opening");
  await view.getByRole("button", { name: "Add" }).click();

  await expect.poll(() => mounted.content()).toEqual({ beats: [{ id: "opening", title: "Opening" }] });
  mounted.destroy();
});
```

| Option               | What the test host does with it                                                   |
| -------------------- | --------------------------------------------------------------------------------- |
| `manifest`           | Starts from the schema default, refuses an invalid content, and lists the exports |
| `content`            | Starts from this content                                                          |
| `locale`, `messages` | Gives the plugin this locale, and the `messages` of one language file             |
| `links`              | Holds these links for the project                                                 |
| `pick`               | Answers a link picker in place of the writer, who dismisses it otherwise          |

The test host stands for one instance, `TEST_INSTANCE`. What `mountPlugin` returns reads the host
back: `content()` and `links()` as it holds them, and `opened`, the identifiers the plugin followed.
Its `target` carries a test ID, so `page.elementLocator(mounted.target)` stays on the plugin
whatever it renders.
Every value that crosses the host is copied, so a value that is not plain data, such as a Svelte
state proxy, is refused as a `postMessage` boundary refuses it.
