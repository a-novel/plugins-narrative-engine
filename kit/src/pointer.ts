import type { Json } from "./json.js";

/** Splits a JSON Pointer (RFC 6901) into its reference tokens. */
export function parse(pointer: string): string[] {
  if (pointer === "") return [];
  if (!pointer.startsWith("/")) throw new SyntaxError(`Invalid JSON Pointer: ${pointer}`);

  return pointer
    .slice(1)
    .split("/")
    .map((token) => token.replaceAll("~1", "/").replaceAll("~0", "~"));
}

/** Joins reference tokens into a JSON Pointer. */
export function format(tokens: readonly (string | number)[]): string {
  return tokens.map((token) => "/" + String(token).replaceAll("~", "~0").replaceAll("/", "~1")).join("");
}

const ARRAY_INDEX = /^(0|[1-9]\d*)$/;

/** Reads the value at the given tokens, or undefined. Only own members and array indexes resolve. */
export function get(document: Json | undefined, tokens: readonly string[]): Json | undefined {
  let node = document;

  for (const token of tokens) {
    if (Array.isArray(node)) node = ARRAY_INDEX.test(token) ? node[Number(token)] : undefined;
    else node = isObject(node) && Object.hasOwn(node, token) ? node[token] : undefined;

    if (node === undefined) return undefined;
  }

  return node;
}

/** Tells a JSON object from every other value, arrays included. */
export function isObject(value: unknown): value is { [key: string]: unknown } {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
