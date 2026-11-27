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
| The manifest  | The `Manifest` and `Messages` types, `checkManifest`, `checkMessages`                 |
| The content   | `listExports`, `listDynamicLinks`, `checkRules`, and `upgrade` with `Migration`       |

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

A manifest holds the schema of the content, the items an instance exports for links, and the rules
that derive its dynamic links.

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
  },
  "links": {
    "order": { "rule": "sequence", "steps": { "select": "$.beats[*]", "id": "/id", "target": "beats" } }
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
| `links`                         | Optional: the rules, by the relationship of the dynamic links each one derives                    |

`[*]` reaches every item of an array and every member value of an object. The identifier of an item
is what a link stores, so it must survive a reorder: an index would not.

#### Rules

A static link is one a plugin declares, through `host.links.replace`. A dynamic link is one the host
derives from a rule and the content. It is never stored, and it carries a distance: a signed whole
number, where 0 means both items count as one and a negative number means the destination comes
first.

A rule has a kind, from a closed list that holds `sequence` alone. A `sequence` orders its steps as
the arrays of the content hold them, and each step can hold parts:

```json
{
  "rule": "sequence",
  "steps": { "select": "$.beats[*].scenes[*]", "id": "/id", "target": "scenes" },
  "parts": { "select": "$.cells[*]", "id": "/layer" }
}
```

| Member         | Rule                                                                     |
| -------------- | ------------------------------------------------------------------------ |
| `rule`         | `sequence`                                                               |
| `steps.select` | The path to the steps, in the subset of an export, through arrays alone  |
| `steps.id`     | A JSON Pointer to the identifier inside each step                        |
| `steps.target` | The name the steps are addressed under, spelled as the name of an export |
| `parts`        | Optional: the items inside each step                                     |
| `parts.select` | The path to the parts, in the same subset, where `$` is their step       |
| `parts.id`     | A JSON Pointer to the identifier inside each part                        |

A step is addressed `<target>/<step ID>`, and a part `<target>/<step ID>/<part ID>`. A rule names its
own items by path, exported or not. When `steps.target` is the name of an export, the steps take that
export's `select` and `id`, so one address means one item.

The steps are the items of arrays. An object keeps its members in no order: JSON does not order
them, and neither does a store that holds the content. So `[*]` in `steps.select` reaches nothing in
an object, which holds no step. The parts of one step share one distance, so `parts.select` reaches
the members of an object as an export's path does.

A `sequence` derives a link from each step and each part to each other one. The distance of a link
is the position of its destination's step minus the position of its source's step: 0 inside one
step, 1 for the next step, -1 for the previous one.

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

Each check returns a list of problems, each opening with a JSON Pointer to its place, and an empty
list for a valid document. `checkMessages` checks English too, passed as its own translation.

```ts
import { checkManifest, checkMessages, checkRules } from "@a-novel/plugins-narrative-engine-contract";

const problems = [
  ...checkManifest(manifest, english),
  ...checkMessages(english, english),
  ...checkMessages(english, french),
  ...checkRules(manifest.links, sample),
];
```

`checkRules` reads a content of the version through its rules, and lists each step and each part
the rules cannot address. A step and a part each need a text identifier. No two steps of a rule
share one, and no two parts of one step. It also lists each object that holds steps, which have no
order there.

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

A host implements `Host` for each plugin it mounts, and runs the content through four functions.
None of them modifies its input. A host validates with `@a-novel-kit/nodelib-json`, which it
installs itself.

```ts
import { validateJson } from "@a-novel-kit/nodelib-json";
import { listDynamicLinks, listExports, upgrade } from "@a-novel/plugins-narrative-engine-contract";

// On load and before a save: an empty list means the content is valid.
const problems = validateJson(manifest.schema, content);

// On an upgrade: one step per version above the instance's, oldest first.
const result = await upgrade(content, [
  { version: "1.1.0", schema: schema110 },
  { version: "2.0.0", schema: schema200, migrate },
]);

// For the link picker.
const items = listExports(manifest.exports, content);

// The items within one step of a beat, each with its signed distance.
const around = listDynamicLinks(manifest.links, content, "beats/opening", 1);
```

| Function           | What it returns                                                                                       |
| ------------------ | ----------------------------------------------------------------------------------------------------- |
| `validateJson`     | The problems of a content, each with a JSON Pointer to the failing value                              |
| `upgrade`          | The content at the last step with everything the steps set aside, or the step that stopped it and why |
| `listExports`      | The items a content exports, without the instance ID, which the host adds                             |
| `listDynamicLinks` | The dynamic links from one item of a content to the items within a distance of it                     |

`listDynamicLinks` takes the address of a step or of a part, and answers with the address of each
destination inside the same instance, the relationship, which is the name of the rule, and the
distance. An address no rule reads answers nothing, and so does a manifest without rules.

- **Its time follows the items it visits.** Each call reads the identifier of every step, then the
  parts of the steps within the distance. It never builds the links of a whole content: 150 steps
  already relate more than 20,000 pairs.
- **It skips what has no address of its own.** That is a step or a part without a text identifier,
  or one whose identifier an earlier step, or an earlier part of its step, already holds. It also
  skips the steps an object holds. A skipped step takes no position, and its parts are skipped with
  it. `checkRules` lists what is skipped.

`upgrade` runs each step's migration, then validates against that step's schema and moves what fails
aside, as `salvageJson` of nodelib-json does. A missing required property takes its schema default.
When the root has the wrong type or lacks a required property that has no default, the upgrade stops
and returns nothing of the earlier steps, so the host leaves the instance as it was.

### Mounting a plugin

An instance pins a version of a plugin, so a version must render as it was built, whatever the host
runs since. A UI module therefore carries its own styles and the design tokens of the
[uikit](https://github.com/a-novel-kit/uikit) it was built with, and reads no token from its host.

| What a plugin renders with      | Whose        | Where it comes from                                              |
| ------------------------------- | ------------ | ---------------------------------------------------------------- |
| The design tokens               | The plugin's | Its UI module, which sets them on the element of its shadow root |
| Its components and their styles | The plugin's | Its UI module, which adds them to its shadow root                |
| The fonts                       | The host's   | `fonts.css` of `@a-novel-kit/uikit-fonts`, on the document       |
| The canvas and its lamp         | The host's   | `canvas.css` of `@a-novel-kit/uikit-tokens`, on the document     |

A font face only loads from the document, and the canvas is the page itself, so both stay with the
host. Of its host's custom properties, a plugin reads one: the lamp the document chose,
`--color-lamp`.

A host owes three things to every plugin it mounts:

1. **A document that carries the fonts and the canvas**, lit by its lamp.
2. **A shadow root per plugin, on an element the plugin owns.** The plugin sets its tokens on that
   element, so a style the host gives it through a token reads the plugin's value. Lay a plugin out
   from a parent of that element.
3. **A box.** The target has a definite inline size and a definite block size. A plugin fills its
   target and scrolls inside it: it never sizes itself from the screen, and the page around it
   does not scroll for it.

```ts
// The page leaves the plugin one cell of a definite size, which the holder fills.
page.style.display = "grid";
page.style.grid = "minmax(0, 1fr) / minmax(0, 1fr)";

const holder = page.appendChild(document.createElement("div"));
const target = holder.attachShadow({ mode: "open" }).appendChild(document.createElement("div"));
target.style.blockSize = "100%";
const mounted = plugin.mount(target, host);
```

A modal `Dialog` of a plugin built with uikit 0.29.1 or later blurs and holds the page behind it, as
one of the host's own does: while it shows, it adds a stylesheet of its own to the document, with
the values of its own tokens. For that, the page scrolls on its root, which the dialog holds still,
and marks its own frosted surfaces with `data-frost`, so they drop their blur under it.

`validateJson` and `upgrade` block while they run, about a second for a content of a few megabytes.
Run them in a Worker. They throw on a schema that cannot be evaluated, and `upgrade` rejects with
what a migration throws. The validator also throws on a content that fails in more places than it
can report, as
[its limits](https://github.com/a-novel-kit/nodelib/tree/master/packages/json#limits) measure, so
treat a thrown error as a content that cannot be validated.
