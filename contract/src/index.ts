/**
 * The contract between a host and the plugins of the Narrative Engine: the types both sides share,
 * the checks a plugin version passes before it is published, and the upgrade of an instance's
 * content. Nothing here needs a DOM or a framework.
 */
export * from "./contract.js";
export * from "./manifest.js";
export * from "./upgrade.js";

// The JSON types the signatures of this package use. A host that validates content imports
// `@a-novel-kit/nodelib-json` itself.
export type { Json, JsonObject } from "@a-novel-kit/nodelib-json";
