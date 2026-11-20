import type { Json, JsonObject } from "./json.js";

/** The version of the {@link Host} interface this package describes. */
export const HOST_API = 1;

/** An Identifier addresses one item of a project. */
export interface Identifier {
  /** The ID of the instance that holds the item. */
  id: string;
  /**
   * The address of the item inside that instance. A link's destination is `<export>/<id>`, which
   * the host resolves in any plugin. A link's source is free text, read by the plugin that wrote it.
   */
  target: string;
}

/** A Link relates two items of one project. */
export interface Link {
  source: Identifier;
  destination: Identifier;
  /** What the source is to the destination, in the words of the plugin that wrote the link. */
  relationship: string;
}

/** A LinkFilter narrows a list of links to those that touch the given instances. */
export interface LinkFilter {
  /** The ID of the instance the links start from. */
  source?: string;
  /** The ID of the instance the links point to. */
  destination?: string;
}

/** An ExportedItem is one linkable item an instance exposes through an export of its manifest. */
export interface ExportedItem {
  /** The ID of the instance that holds the item. */
  instance: string;
  /** The name of the export that lists the item. */
  export: string;
  /** The identifier of the item, stable across reorders. */
  id: string;
  /** The text a picker shows for the item. */
  label: string;
}

/** An InstanceDescriptor is what a project knows of an instance without reading its content. */
export interface InstanceDescriptor {
  id: string;
  /** The name of the plugin the instance uses. */
  plugin: string;
  /** The exact plugin version the instance pins. */
  version: string;
  /** The display name the writer gave the instance. */
  name: string;
}

/**
 * The Host is everything a plugin can ask of the application that mounts it. Every argument and
 * result is plain JSON and every call is asynchronous, so the same interface can cross a
 * `postMessage` boundary.
 */
export interface Host {
  /** The version of this interface the host implements. */
  api: typeof HOST_API;
  /** The ID of the instance the plugin edits, which the links it writes name as their source. */
  instance: string;
  /** The locale the host renders in. */
  locale: string;
  /** The plugin's translations for that locale. */
  messages: JsonObject;

  /** The content of the instance the plugin edits. */
  content: {
    get(): Promise<Json>;
    /** Replaces the content. The host validates it against the schema, then saves it. */
    set(next: Json): Promise<void>;
  };

  /** The links of the project. */
  links: {
    list(filter?: LinkFilter): Promise<Link[]>;
    /** Replaces the links this instance is the source of. */
    replace(mine: Link[]): Promise<void>;
    /**
     * Lets the writer pick an item among the exports named in `accepts`. Resolves to null when the
     * writer dismisses the picker.
     */
    pick(accepts: string[]): Promise<Identifier | null>;
  };

  /** The exported items of one instance, or of every instance of the project. */
  exports: { list(instance?: string): Promise<ExportedItem[]> };
  /** The instances of the project. */
  instances: { list(): Promise<InstanceDescriptor[]> };

  /** Follows a link into another instance. */
  open(identifier: Identifier): Promise<void>;
}

/** Mounted is the handle a host keeps on a plugin it mounted. */
export interface Mounted {
  /** Removes the plugin from its target and releases what it holds. */
  destroy(): void;
  /** Brings the item at `target` into view, when the host follows a link into the instance. */
  focus?(target: string): void;
}

/** A Plugin is the default export of a plugin version's UI module. */
export interface Plugin {
  /** Renders the plugin inside `target`. */
  mount(target: HTMLElement, host: Host): Mounted;
}
