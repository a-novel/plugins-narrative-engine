import type { DynamicLink, ExportedItem } from "./contract.js";
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

/**
 * A LinkRule derives dynamic links between the items of one instance, from its content alone. A
 * host reads them with {@link listDynamicLinks}.
 */
export interface LinkRule {
  /**
   * The kind of the rule, from a closed list. A `sequence` orders its steps as the arrays of the
   * content hold them, and derives a link from each step and each part to each other one. The
   * distance of a link is the position of its destination's step minus the position of its source's
   * step.
   */
  rule: "sequence";
  /** The items the rule orders. */
  steps: {
    /**
     * The path to the steps in the content, in the subset an {@link ExportDefinition} selects with.
     * Here `[*]` reaches the items of an array alone: an object keeps its members in no order, so it
     * holds no step.
     */
    select: string;
    /** The JSON Pointer (RFC 6901) to the identifier inside each step. */
    id: string;
    /**
     * The name the steps are addressed under: a step is `<target>/<step ID>`. Under the name of an
     * export, the steps are that export's items, selected with its `select` and its `id`.
     */
    target: string;
  };
  /** The items inside each step, each addressed `<target>/<step ID>/<part ID>`. */
  parts?: {
    /** The path to the parts, where `$` is their step. */
    select: string;
    /** The JSON Pointer (RFC 6901) to the identifier inside each part. */
    id: string;
  };
}

/**
 * A Manifest describes one plugin version: the schema of its content, the items it exports and the
 * rules that derive its dynamic links.
 */
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
  /** The rules, by the relationship of the dynamic links each one derives. */
  links?: Record<string, LinkRule>;
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

// The path subset of an export and of a rule, as the manifest schema checks it.
const PATH = new RegExp(manifestSchema.$defs.path.pattern, "u");

// A checked path holds only names and `*` between its punctuation.
const SEGMENT = /[^$.[\]]+/g;

/**
 * Lists what is wrong with a manifest, each problem opening with a JSON Pointer to its place. A
 * valid manifest lists nothing.
 *
 * A manifest has the shape of `manifest.schema.json`. Its schema stays inside the dialect every
 * validator reads alike: each `$ref` is local, and no subschema uses `$dynamicRef`,
 * `$dynamicAnchor` or `format`. The schema's `default` is valid against it. Every `title` and
 * `description` of the schema and every export name is a key of the English messages. A rule whose
 * steps are addressed under the name of an export selects them as that export does, so one address
 * means one item.
 *
 * Omit `english` for the manifest of a past version, whose messages are gone: its translation keys
 * are then left unchecked.
 */
export function checkManifest(manifest: unknown, english?: unknown): string[] {
  const problems = validateJson(manifestSchema, manifest as Json).map(
    ({ path, message }) => `${path || "/"}: ${message}`
  );
  if (problems.length > 0) return problems;

  const { schema, exports, links } = manifest as Manifest;
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

  for (const [name, { steps }] of Object.entries(links ?? {})) {
    // A target may spell an inherited member, such as `constructor`.
    if (!Object.hasOwn(exports, steps.target)) continue;

    for (const member of ["select", "id"] as const) {
      const exported = exports[steps.target]![member];
      if (steps[member] === exported) continue;

      const at = formatJsonPointer(["links", name, "steps", member]);
      problems.push(`${at}: steps addressed as the export "${steps.target}" take its ${member}, "${exported}".`);
    }
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
 * Its time is linear in the values the paths visit.
 *
 * @throws RangeError or SyntaxError on a definition that {@link checkManifest} refuses.
 */
export function listExports(exports: Manifest["exports"], content: Json): Omit<ExportedItem, "instance">[] {
  const items: Omit<ExportedItem, "instance">[] = [];

  for (const [name, { select: path, id, label }] of Object.entries(exports)) {
    const [idTokens, labelTokens] = [parseJsonPointer(id), parseJsonPointer(label)];

    for (const [, item] of select(content, path)) {
      const [itemId, itemLabel] = [resolveJsonPointer(item, idTokens), resolveJsonPointer(item, labelTokens)];
      if (typeof itemId !== "string") continue;

      items.push({ export: name, id: itemId, label: typeof itemLabel === "string" ? itemLabel : "" });
    }
  }

  return items;
}

/**
 * Lists the dynamic links the rules of a manifest derive from one item of a content: each link
 * whose distance from `source` is at most `distance`, rule by rule and in document order. `source`
 * is the address of a step or of a part, and an address no rule reads lists nothing. Each call
 * reads the identifier of every step, then the parts of the steps within the distance, in time
 * linear in the values it visits.
 *
 * A step or a part is skipped when it has no text identifier, or when an earlier step, or an
 * earlier part of its step, holds the same one. So are the steps an object holds, which have no
 * order. A skipped step takes no position, and its parts are skipped with it. {@link checkRules}
 * lists what is skipped.
 *
 * @throws RangeError or SyntaxError on a rule that {@link checkManifest} refuses.
 */
export function listDynamicLinks(
  links: Manifest["links"],
  content: Json,
  source: string,
  distance: number
): DynamicLink[] {
  const found: DynamicLink[] = [];

  for (const [relationship, rule] of Object.entries(links ?? {})) {
    const steps = identify(content, rule.steps, { ordered: true }).items;
    // Only a step whose address opens the source can hold it, so the parts of the others stay unread.
    const position = steps.findIndex(
      (step) => `${source}/`.startsWith(`${rule.steps.target}/${step.id}/`) && addresses(rule, step).includes(source)
    );
    if (position < 0) continue;

    for (const [at, step] of steps.entries()) {
      const destinations = Math.abs(at - position) <= distance ? addresses(rule, step) : [];

      for (const destination of destinations) {
        if (destination !== source) found.push({ destination, relationship, distance: at - position });
      }
    }
  }

  return found;
}

/** Lists the addresses a rule gives one of its steps: the address of the step, then those of its parts. */
function addresses({ steps, parts }: LinkRule, step: Identified): string[] {
  const address = `${steps.target}/${step.id}`;
  if (parts === undefined) return [address];

  return [address, ...identify(step.value, parts).items.map((part) => `${address}/${part.id}`)];
}

/**
 * Lists the steps and the parts of a content that its rules cannot address, each problem opening
 * with a JSON Pointer to the identifier in the content. A content whose every step and every part
 * has an address lists nothing.
 *
 * A step and a part each need a text identifier. No two steps of a rule share one, and no two parts
 * of one step. Steps are the items of arrays: an object the path of the steps meets with `[*]` is
 * listed at its own place. {@link listDynamicLinks} skips what this lists.
 *
 * @throws RangeError or SyntaxError on a rule that {@link checkManifest} refuses.
 */
export function checkRules(links: Manifest["links"], content: Json): string[] {
  return Object.entries(links ?? {}).flatMap(([name, rule]) => checkRule(name, rule, content));
}

/** Lists the steps and the parts of a content that one rule cannot address. */
function checkRule(name: string, { steps, parts }: LinkRule, content: Json): string[] {
  const sequence = identify(content, steps, { ordered: true });
  const inParts =
    parts === undefined ? [] : sequence.items.flatMap((step) => identify(step.value, parts, { base: step.at }).refused);
  const unordered = `the steps of the rule "${name}" are the items of an array, and an object keeps its members in no order.`;

  return [
    ...sequence.unordered.map((at) => `${formatJsonPointer(at) || "/"}: ${unordered}`),
    ...sequence.refused.map((step) => refusal(step, `a step of the rule "${name}"`)),
    ...inParts.map((part) => refusal(part, `a part of one step of the rule "${name}"`)),
  ];
}

/** Formats the problem of a selected value that a rule cannot address. */
function refusal({ at, id }: Refused, subject: string): string {
  const reason =
    typeof id === "string"
      ? `shares the identifier ${JSON.stringify(id)} with an earlier one`
      : "has no text identifier";

  return `${formatJsonPointer(at) || "/"}: ${subject} ${reason}.`;
}

/** An Identified is a step or a part that holds its identifier: where it is in the content, and its value. */
interface Identified {
  at: string[];
  id: string;
  value: Json;
}

/** A Refused is a selected value that takes no address: where its identifier is read, and what was read. */
interface Refused {
  at: string[];
  id: Json | undefined;
}

/**
 * Splits the values a rule selects from `from`, in document order. A value is an item when it has
 * a text identifier that no earlier item holds, and is refused otherwise. `base` leads to `from` in
 * the content. An `ordered` selection reaches the items of arrays alone, and lists in `unordered`
 * the place of each object its `[*]` met.
 */
function identify(
  from: Json,
  { select: path, id }: { select: string; id: string },
  { base = [], ordered = false }: { base?: string[]; ordered?: boolean } = {}
): { items: Identified[]; refused: Refused[]; unordered: string[][] } {
  const idTokens = parseJsonPointer(id);
  const held = new Set<string>();
  const items: Identified[] = [];
  const refused: Refused[] = [];
  const unordered: string[][] = [];

  for (const [tokens, value] of select(from, path, ordered ? unordered : undefined)) {
    const found = resolveJsonPointer(value, idTokens);
    const at = [...base, ...tokens];

    if (typeof found !== "string" || held.has(found)) {
      refused.push({ at: [...at, ...idTokens], id: found });
      continue;
    }

    held.add(found);
    items.push({ at, id: found, value });
  }

  return { items, refused, unordered };
}

/** A Selected is a value a path reaches, after the reference tokens that lead to it from where the path starts. */
type Selected = [at: string[], value: Json];

/**
 * Lists the values a path of the subset reaches from a value, in document order. The path is
 * evaluated here, in time linear in the values it visits. No expression of the subset can make it
 * revisit one.
 *
 * With `unordered`, `*` reaches the items of an array alone: a save keeps the members of an object
 * in no order, so the place of each object it meets is added there instead.
 *
 * @throws RangeError on a path outside the subset.
 */
function select(from: Json, path: string, unordered?: string[][]): Selected[] {
  if (!PATH.test(path)) throw new RangeError(`A path stays inside the subset: ${path}`);

  let selected: Selected[] = [[[], from]];
  for (const segment of path.match(SEGMENT) ?? []) {
    selected = selected.flatMap((value) => children(value, segment, unordered));
  }

  return selected;
}

/** Applies one segment of a path to a value: `*` reaches every child, a name reaches one member. */
function children([at, value]: Selected, segment: string, unordered?: string[][]): Selected[] {
  if (segment !== "*") {
    const member = resolveJsonPointer(value, [segment]);
    return member === undefined ? [] : [[[...at, segment], member]];
  }

  if (Array.isArray(value)) return value.map((item, index): Selected => [[...at, String(index)], item]);
  if (!isJsonObject(value)) return [];

  if (unordered === undefined) return Object.entries(value).map(([name, member]): Selected => [[...at, name], member]);
  unordered.push(at);

  return [];
}
