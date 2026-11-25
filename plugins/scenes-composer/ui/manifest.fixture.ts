// The manifest of the current version, read from its file for the tests. Reading it needs Node.
import { readFileSync } from "node:fs";

import type { Manifest } from "@a-novel/plugins-narrative-engine-kit";

import { parse } from "yaml";

export const MANIFEST = parse(readFileSync(new URL("../versions/1.0.0.yaml", import.meta.url), "utf8")) as Manifest;
