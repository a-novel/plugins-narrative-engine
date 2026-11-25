import type { Migration } from "@a-novel/plugins-narrative-engine-kit";

// Version 1.0.0 held the list of beats alone.
const migrate: Migration = (content) => ({ migrated: { beats: content } });

export default migrate;
