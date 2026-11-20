import type { Json } from "./json.js";
import { format, get, parse } from "./pointer.js";

import { describe, expect, it } from "vitest";

describe("get", () => {
  const document = { a: { "b/c": [10, 20], "~": 1, "": 2 }, list: [1, 2] };
  const cases: [pointer: string, expected: Json | undefined][] = [
    ["", document],
    ["/a/b~1c/1", 20],
    ["/a/~0", 1],
    ["/a/", 2],
    ["/list/1", 2],
    // Inherited members, non-canonical indexes and missing members resolve to nothing.
    ["/constructor", undefined],
    ["/__proto__", undefined],
    ["/list/length", undefined],
    ["/list/01", undefined],
    ["/list/-", undefined],
    ["/list/2", undefined],
    ["/missing/x", undefined],
  ];

  it.each(cases)("reads %j", (pointer, expected) => {
    expect(get(document, parse(pointer))).toEqual(expected);
  });
});

describe("parse and format", () => {
  it("round-trips tokens", () => {
    expect(format(parse("/a/b~1c/~0/"))).toBe("/a/b~1c/~0/");
    expect(parse("/a~1b/~01")).toEqual(["a/b", "~1"]);
  });

  it("refuses a pointer that does not start with a slash", () => {
    expect(() => parse("a/b")).toThrow(SyntaxError);
  });
});
