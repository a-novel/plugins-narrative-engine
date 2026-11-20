/**
 * The contract between a host and the plugins of the Narrative Engine: the types both sides share,
 * the checks a plugin version passes before it is published, and the validation and upgrade of an
 * instance's content. Nothing here needs a DOM or a framework.
 */
export * from "./contract.js";
export type * from "./json.js";
export * from "./manifest.js";
export * from "./salvage.js";
export * from "./upgrade.js";
export { type Problem, validate } from "./validate.js";
