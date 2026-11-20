# @a-novel/plugins-narrative-engine-contract

The contract between a host application and the plugins of the Narrative Engine: the types both
sides share, the formats of a plugin version with their checks, and the upgrade of an instance's
content.

## Installation

Configure the registry as the
[repository README](https://github.com/a-novel/plugins-narrative-engine#installation) shows, then add
the package:

```bash
pnpm add @a-novel/plugins-narrative-engine-contract
```

## What it holds

A plugin version is a manifest, a UI module, an optional migration and its messages. An instance is
one use of a plugin in a project: it pins a version and holds one JSON document, its content. The
host is the application that mounts plugins and saves their content, which is Studio today.

The package has one entry, which both sides import. It needs no DOM, no framework and no Node
module, so it runs in a browser, a Worker and Node.

| Subject       | What the package gives                                                                |
| ------------- | ------------------------------------------------------------------------------------- |
| The UI module | The `Plugin` and `Host` types: what a plugin exports, and what it can ask of the host |
| The manifest  | The `Manifest` and `Messages` types, `checkManifest`, `checkMessages`, `listExports`  |
| The content   | `upgrade`, with the `Migration` type                                                  |

Its one dependency is
[`@a-novel-kit/nodelib-json`](https://github.com/a-novel-kit/nodelib/tree/master/packages/json),
which validates a JSON value against a schema. The package exports the `Json` and `JsonObject` types
its own signatures use, and nothing else of that dependency.

## A plugin version

### The UI module

A UI module exports a `Plugin` by default. The host calls `mount` with an element and a `Host`, and
keeps the handle it gets back. This plugin edits its content as raw JSON:

```ts
import type { Plugin } from "@a-novel/plugins-narrative-engine-contract";

const plugin: Plugin = {
  mount(target, host) {
    const field = document.createElement("textarea");
    void host.content.get().then((content) => (field.value = JSON.stringify(content)));
    field.addEventListener("change", () => void host.content.set(JSON.parse(field.value)));
    target.append(field);

    return { destroy: () => field.remove() };
  },
};

export default plugin;
```

Everything a plugin exchanges with the host is JSON, and every call returns a promise. The host owns
persistence: `host.content.set` hands it the whole content, which it validates against the schema
before saving. A plugin keeps its own editing state, such as its undo history.

### The manifest

A manifest holds the schema of the content and the items an instance exports for links.

```json
{
  "manifest": 1,
  "schema": {
    "type": "object",
    "title": "schema.title",
    "required": ["beats"],
    "properties": {
      "beats": { "type": "array", "items": { "$ref": "#/$defs/beat" } }
    },
    "default": { "beats": [] },
    "$defs": {
      "beat": {
        "type": "object",
        "required": ["id", "title"],
        "properties": { "id": { "type": "string" }, "title": { "type": "string" } }
      }
    }
  },
  "exports": {
    "beats": { "name": "exports.beats", "select": "$.beats[*]", "id": "/id", "label": "/title" }
  }
}
```

| Member                          | Rule                                                                                              |
| ------------------------------- | ------------------------------------------------------------------------------------------------- |
| `schema`                        | JSON Schema, draft 2020-12, without `format`, `$dynamicRef` or `$dynamicAnchor`                   |
| `$ref`                          | Stays inside the schema: it starts with `#`                                                       |
| `schema.default`                | Valid against the schema: it is the content of a new instance                                     |
| `title`, `description`          | A translation key, in every subschema                                                             |
| `exports.<name>`                | Letters, digits, `_` and `-`, starting with a letter: a link addresses an item as `<export>/<id>` |
| `exports.<name>.name`           | A translation key                                                                                 |
| `exports.<name>.select`         | `$`, then member names (`.beats`) and `[*]`: the subset of JSONPath the host evaluates            |
| `exports.<name>.id` and `label` | A JSON Pointer inside each selected item. An item is exported when its `id` reads as a string     |

`[*]` reaches every item of an array and every member value of an object. The identifier of an item
is what a link stores, so it must survive a reorder: an index would not.

The package also exports the shape as a JSON Schema, for tools that read a manifest without this
package: `@a-novel/plugins-narrative-engine-contract/manifest.schema.json`.

### The messages

Each language is one document. `title` and `description` present the plugin, and `messages` holds
its translations, nested like an i18next catalog. A translation key is the dotted path to one of
them, as `exports.beats` here.

```json
{
  "title": "Scenes Composer",
  "description": "Lays a story out as beats and scenes.",
  "messages": {
    "schema": { "title": "Composer" },
    "exports": { "beats": "Beats" }
  }
}
```

English is the reference: every other language holds exactly its keys.

### Checking a version

Both checks return a list of problems, each opening with a JSON Pointer to its place, and an empty
list for a valid document. `checkMessages` checks English too, passed as its own translation.

```ts
import { checkManifest, checkMessages } from "@a-novel/plugins-narrative-engine-contract";

const problems = [
  ...checkManifest(manifest, english),
  ...checkMessages(english, english),
  ...checkMessages(english, french),
];
```

### A migration

A version whose schema refuses the content of the version before it ships a migration. The module
exports a `Migration` by default: it receives the content of the previous version and returns it in
the new shape. What the new shape has no place for goes in `unmigrated`, which the host keeps for
the writer.

```ts
import type { Migration } from "@a-novel/plugins-narrative-engine-contract";

// The version before held the list of beats alone.
const migrate: Migration = (content) => ({ migrated: { beats: content } });

export default migrate;
```

## Hosting plugins

A host implements `Host` for each plugin it mounts, and runs the content through three functions.
None of them modifies its input. A host validates with `@a-novel-kit/nodelib-json`, which it
installs itself.

```ts
import { validateJson } from "@a-novel-kit/nodelib-json";
import { listExports, upgrade } from "@a-novel/plugins-narrative-engine-contract";

// On load and before a save: an empty list means the content is valid.
const problems = validateJson(manifest.schema, content);

// On an upgrade: one step per version above the instance's, oldest first.
const result = await upgrade(content, [
  { version: "1.1.0", schema: schema110 },
  { version: "2.0.0", schema: schema200, migrate },
]);

// For the link picker.
const items = listExports(manifest.exports, content);
```

| Function       | What it returns                                                                                       |
| -------------- | ----------------------------------------------------------------------------------------------------- |
| `validateJson` | The problems of a content, each with a JSON Pointer to the failing value                              |
| `upgrade`      | The content at the last step with everything the steps set aside, or the step that stopped it and why |
| `listExports`  | The items a content exports, without the instance ID, which the host adds                             |

`upgrade` runs each step's migration, then validates against that step's schema and moves what fails
aside, as `salvageJson` of nodelib-json does. A missing required property takes its schema default.
When the root has the wrong type or lacks a required property that has no default, the upgrade stops
and returns nothing of the earlier steps, so the host leaves the instance as it was.

`validateJson` and `upgrade` block while they run, about a second for a content of a few megabytes.
Run them in a Worker. They throw on a schema that cannot be evaluated, and `upgrade` rejects with
what a migration throws. The validator also throws on a content that fails in more places than it
can report, as
[its limits](https://github.com/a-novel-kit/nodelib/tree/master/packages/json#limits) measure, so
treat a thrown error as a content that cannot be validated.
