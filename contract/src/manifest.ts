import type { ExportedItem } from "./contract.js";
import manifestSchema from "./manifest.schema.json" with { type: "json" };

import {
  type Json,
  type JsonObject,
  formatJsonPointer,
  isJsonObject,
  listSubschemas,
  parseJsonPointer,
  resolveJsonPointer,
  validateJson,
} from "@a-novel-kit/nodelib-json";

/** An ExportDefinition declares one named list of linkable items of an instance. */
export interface ExportDefinition {
  /** The translation key of the export's display name. */
  name: string;
  /**
   * The path to the items in the content: `$`, then member names (`.name`) and `[*]`. This is a
   * subset of JSONPath (RFC 9535), where `[*]` selects every item of an array and every member
   * value of an object.
   */
  select: string;
  /** The JSON Pointer (RFC 6901) to the identifier inside each item. */
  id: string;
  /** The JSON Pointer (RFC 6901) to the label inside each item. */
  label: string;
}

/** A Manifest describes one plugin version: the schema of its content and the items it exports. */
export interface Manifest {
  /** The version of the manifest format. */
  manifest: 1;
  /**
   * The JSON Schema (draft 2020-12) of an instance's content. Its `default` is the content of a new
   * instance, and each `title` and `description` holds a translation key.
   */
  schema: JsonObject;
  /** The export definitions, by export name. */
  exports: Record<string, ExportDefinition>;
}

/** Messages is one language of a plugin version. */
export interface Messages {
  /** The name of the plugin in that language. */
  title: string;
  /** What the plugin is for, in that language. */
  description: string;
  /**
   * The translations, nested like an i18next catalog. A translation key is the dotted path to one of
   * its strings.
   */
  messages: JsonObject;
}

// Keywords outside the dialect: the browser's validator lacks the first two, and validators
// disagree on formats.
const UNSUPPORTED_KEYWORDS = ["$dynamicRef", "$dynamicAnchor", "format"];

// The path subset of an export, as the manifest schema checks it.
const SELECT = new RegExp(manifestSchema.$defs.export.properties.select.pattern, "u");

// A checked path holds only names and `*` between its punctuation.
const SELECT_STEP = /[^$.[\]]+/g;

/**
 * Lists what is wrong with a manifest, each problem opening with a JSON Pointer to its place. A
 * valid manifest lists nothing.
 *
 * A manifest has the shape of `manifest.schema.json`. Its schema stays inside the dialect every
 * validator reads alike: each `$ref` is local, and no subschema uses `$dynamicRef`,
 * `$dynamicAnchor` or `format`. The schema's `default` is valid against it. Every `title` and
 * `description` of the schema and every export name is a key of the English messages.
 *
 * Omit `english` for the manifest of a past version, whose messages are gone: its translation keys
 * are then left unchecked.
 */
export function checkManifest(manifest: unknown, english?: unknown): string[] {
  const problems = validateJson(manifestSchema, manifest as Json).map(
    ({ path, message }) => `${path || "/"}: ${message}`
  );
  if (problems.length > 0) return problems;

  const { schema, exports } = manifest as Manifest;
  const keys =
    english === undefined ? undefined : translationKeys(isJsonObject(english) ? english.messages : undefined);
  const isMissing = (key: Json | undefined) => keys !== undefined && !(typeof key === "string" && keys.has(key));

  for (const [tokens, subschema] of listSubschemas(schema)) {
    const at = ["schema", ...tokens];

    if (Object.hasOwn(subschema, "$ref") && !(typeof subschema.$ref === "string" && subschema.$ref.startsWith("#"))) {
      problems.push(`${formatJsonPointer([...at, "$ref"])}: a reference stays inside the schema, starting with "#".`);
    }
    for (const keyword of UNSUPPORTED_KEYWORDS) {
      if (Object.hasOwn(subschema, keyword))
        problems.push(`${formatJsonPointer([...at, keyword])}: a plugin schema cannot use "${keyword}".`);
    }
    for (const keyword of ["title", "description"]) {
      if (Object.hasOwn(subschema, keyword) && isMissing(subschema[keyword]))
        problems.push(missingKey([...at, keyword], subschema[keyword]));
    }
  }

  for (const [name, definition] of Object.entries(exports)) {
    if (isMissing(definition.name)) problems.push(missingKey(["exports", name, "name"], definition.name));
  }

  return [...problems, ...checkDefault(schema)];
}

/** Formats the problem of a translation key the English messages lack. */
function missingKey(at: string[], key: Json | undefined): string {
  return `${formatJsonPointer(at)}: ${JSON.stringify(key)} is not a key of the English messages.`;
}

/** Checks that a schema has a default, which is valid against it. */
function checkDefault(schema: JsonObject): string[] {
  const initial = schema.default;
  if (initial === undefined) return ["/schema/default: a schema needs a default, the content of a new instance."];

  try {
    return validateJson(schema, initial).map(({ path, message }) => `/schema/default${path}: ${message}`);
  } catch (error) {
    // The validator throws on a schema it cannot evaluate. Its message lists every known schema
    // after the first line.
    const [reason] = (error instanceof Error ? error.message : String(error)).split("\n");
    return [`/schema: ${reason}`];
  }
}

/**
 * Lists what is wrong with one language of a plugin version, each problem opening with a JSON
 * Pointer to its place. A valid language lists nothing.
 *
 * A language is an object with a non-empty `title`, a non-empty `description` and its `messages`,
 * whose leaves are strings. It holds exactly the translation keys of `english`. Pass the English
 * messages as `language` to check English itself.
 */
export function checkMessages(english: Messages, language: unknown): string[] {
  if (!isJsonObject(language)) return ["/: a language is an object."];

  const problems = ["title", "description"]
    .filter((name) => typeof language[name] !== "string" || language[name] === "")
    .map((name) => `/${name}: a language needs a non-empty ${name}.`);

  const keys = translationKeys(language.messages, problems);
  const expected = translationKeys(isJsonObject(english) ? english.messages : undefined);

  for (const key of expected) if (!keys.has(key)) problems.push(`${pointerOf(key)}: the translation is missing.`);
  for (const key of keys) if (!expected.has(key)) problems.push(`${pointerOf(key)}: English has no such key.`);

  return problems;
}

/** Formats the JSON Pointer of a translation key in a language. */
function pointerOf(key: string): string {
  return formatJsonPointer(["messages", ...key.split(".")]);
}

/**
 * Lists the translation keys of a tree of messages: the dotted path to each of its leaves. A leaf
 * that is not a string is added to `problems`.
 */
function translationKeys(messages: unknown, problems: string[] = []): Set<string> {
  const keys = new Set<string>();
  const pending: [string[], unknown][] = [[[], messages]];

  // Members are stacked last to first, so the keys come out in the order of the document.
  for (let entry = pending.pop(); entry; entry = pending.pop()) {
    const [at, node] = entry;
    if (isJsonObject(node)) {
      for (const [name, child] of Object.entries(node).reverse()) pending.push([[...at, name], child]);
    } else if (at.length === 0) {
      problems.push("/messages: the messages of a language are an object.");
    } else {
      keys.add(at.join("."));
      if (typeof node !== "string")
        problems.push(`${formatJsonPointer(["messages", ...at])}: a translation is a string.`);
    }
  }

  return keys;
}

/**
 * Lists the items an instance exports: for each export, the values its `select` reaches in the
 * content, read through its `id` and `label` pointers. An item whose identifier is not a string is
 * skipped, and a label that is not a string reads as empty.
 *
 * The path is evaluated here, in time linear in the values it visits. No expression of the
 * subset can make it revisit one.
 *
 * @throws RangeError or SyntaxError on a definition that {@link checkManifest} refuses.
 */
export function listExports(exports: Manifest["exports"], content: Json): Omit<ExportedItem, "instance">[] {
  const items: Omit<ExportedItem, "instance">[] = [];

  for (const [name, { select, id, label }] of Object.entries(exports)) {
    if (!SELECT.test(select)) throw new RangeError(`Export "${name}" selects outside the path subset: ${select}`);
    const [idTokens, labelTokens] = [parseJsonPointer(id), parseJsonPointer(label)];

    let selected = [content];
    for (const step of select.match(SELECT_STEP) ?? []) selected = selected.flatMap((value) => children(value, step));

    for (const item of selected) {
      const [itemId, itemLabel] = [resolveJsonPointer(item, idTokens), resolveJsonPointer(item, labelTokens)];
      if (typeof itemId !== "string") continue;

      items.push({ export: name, id: itemId, label: typeof itemLabel === "string" ? itemLabel : "" });
    }
  }

  return items;
}

/** Applies one step of an export path to a value: `*` reaches every child, a name reaches one member. */
function children(value: Json, step: string): Json[] {
  if (step !== "*") {
    const member = resolveJsonPointer(value, [step]);
    return member === undefined ? [] : [member];
  }

  if (Array.isArray(value)) return value;
  return isJsonObject(value) ? Object.values(value) : [];
}
