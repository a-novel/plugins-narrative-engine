import type { Json, JsonObject } from "./json.js";
import { salvage } from "./salvage.js";

/** A MigrationResult is what a migration makes of the content of the previous version. */
export interface MigrationResult {
  /** The content, in the shape of the migration's own version. */
  migrated: Json;
  /** What the new shape has no place for, kept for the writer to read. */
  unmigrated?: Json;
}

/**
 * A Migration rewrites the content of the previous version for its own version. It is the default
 * export of a version's migration module.
 */
export type Migration = (content: Json) => MigrationResult | Promise<MigrationResult>;

/** An UpgradeStep is one version on the way from the content's version to its target. */
export interface UpgradeStep {
  version: string;
  /** The content schema of that version. */
  schema: JsonObject;
  /** The migration of that version, when it has one. */
  migrate?: Migration;
}

/** An UnmigratedEntry is content an upgrade could not carry over. */
export interface UnmigratedEntry {
  /** The version whose step set the value aside. */
  version: string;
  /**
   * JSON Pointer (RFC 6901) to the value in the content that step validated. It is empty for what
   * the migration of that step returned as unmigrated.
   */
  path: string;
  value: Json;
}

/** An UpgradeResult is the outcome of {@link upgrade}: the upgraded content, or the step that stopped it. */
export type UpgradeResult =
  | {
      ok: true;
      /** The content, valid against the schema of the last step. */
      content: Json;
      /** Everything the steps set aside, in order. */
      unmigrated: UnmigratedEntry[];
    }
  | {
      ok: false;
      /** The version of the step whose schema the content cannot satisfy. */
      version: string;
      reason: string;
    };

/**
 * Carries `content` through `steps`, ordered from the oldest version to the newest. Each step runs
 * its migration when it has one, then validates the content against its schema and moves what fails
 * aside, as {@link salvage} does.
 *
 * The upgrade stops at the first step whose content cannot be made valid, and returns nothing of
 * the steps before it. `content` is never modified: a migration works on a copy.
 *
 * @throws What a migration throws, and what {@link salvage} throws.
 */
export async function upgrade(content: Json, steps: UpgradeStep[]): Promise<UpgradeResult> {
  const unmigrated: UnmigratedEntry[] = [];

  for (const { version, schema, migrate } of steps) {
    if (migrate) {
      const result = await migrate(structuredClone(content));
      content = result.migrated;
      if (result.unmigrated !== undefined) unmigrated.push({ version, path: "", value: result.unmigrated });
    }

    const salvaged = salvage(schema, content);
    if (!salvaged.ok) return { ok: false, version, reason: salvaged.reason };

    content = salvaged.content;
    for (const { path, value } of salvaged.unmigrated) unmigrated.push({ version, path, value });
  }

  return { ok: true, content, unmigrated };
}
