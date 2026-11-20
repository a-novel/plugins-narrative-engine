/** A JSON value. Content, links and every value that crosses the plugin contract are JSON. */
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

/** A JSON object, such as a schema or a set of translations. */
export type JsonObject = { [key: string]: Json };
