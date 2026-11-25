/// <reference types="vite/client" preserve="true" />
import { validateJson } from "@a-novel-kit/nodelib-json";
// What a host document gives every plugin: the font faces and the page canvas, which the tokens of
// the host's own UI kit paint. A plugin reads none of them: its build bundles its own.
import "@a-novel-kit/uikit-fonts/fonts.css";
import "@a-novel-kit/uikit-tokens/canvas.css";
import "@a-novel-kit/uikit-tokens/tokens.css";
import {
  HOST_API,
  type Host,
  type Identifier,
  type InstanceDescriptor,
  type Json,
  type JsonObject,
  type Link,
  type LinkFilter,
  type Manifest,
  type Plugin,
  listExports,
} from "@a-novel/plugins-narrative-engine-contract";

// Studio's lamp, which lights the canvas a plugin renders on.
document.documentElement.style.setProperty("--color-lamp", "var(--color-lamp-magenta)");

/** The instance a test host mounts a plugin for, and the only one of its project. */
export const TEST_INSTANCE: InstanceDescriptor = {
  id: "instance",
  plugin: "plugin",
  version: "0.0.0",
  name: "Instance",
};

/** MountOptions set what the test host holds when it mounts a plugin. */
export interface MountOptions {
  /**
   * The manifest of the version under test. Its schema default is the first content, its schema
   * refuses an invalid content, and its exports are the items the host lists.
   */
  manifest?: Manifest;
  /** The content of the instance, in place of the schema default. */
  content?: Json;
  /** The locale the host renders in, English when omitted. */
  locale?: string;
  /** The plugin's translations for that locale: the `messages` of a language file. */
  messages?: JsonObject;
  /** The links of the project. */
  links?: Link[];
  /** Picks an item in place of the writer. Without it, every picker is dismissed. */
  pick?: (accepts: string[]) => Identifier | null;
}

/** A TestMount is a plugin mounted in the test host, with what the host holds for it. */
export interface TestMount {
  /** The element the plugin renders in, inside a shadow root. */
  target: HTMLElement;
  /** Reads the content the host holds. */
  content(): Json;
  /** Reads the links the host holds. */
  links(): Link[];
  /** The identifiers the plugin opened, in order. */
  opened: Identifier[];
  /** Destroys the plugin and removes its shadow root from the document. */
  destroy(): void;
}

/** Tells whether a link touches the instances a filter names. */
function touches(link: Link, { source, destination }: LinkFilter): boolean {
  return (
    (source === undefined || link.source.id === source) &&
    (destination === undefined || link.destination.id === destination)
  );
}

/**
 * Mounts a plugin as a host application does: in a shadow root, on a document that carries the
 * fonts and the canvas of the UI kit under Studio's lamp. The host keeps everything in memory.
 *
 * Every value that crosses the host is copied, so a value that cannot cross a `postMessage`
 * boundary, such as a reactive proxy, is refused.
 */
export function mountPlugin(plugin: Plugin, options: MountOptions = {}): TestMount {
  const { manifest } = options;
  let content = structuredClone(options.content ?? manifest?.schema.default ?? null);
  let links = structuredClone(options.links ?? []);
  const opened: Identifier[] = [];

  const host: Host = {
    api: HOST_API,
    instance: TEST_INSTANCE.id,
    locale: options.locale ?? "en",
    messages: options.messages ?? {},

    content: {
      get: async () => structuredClone(content),
      set: async (next) => {
        const problems = manifest ? validateJson(manifest.schema, next) : [];
        if (problems.length > 0) {
          const listed = problems.map(({ path, message }) => `${path || "/"}: ${message}`).join(" ");
          throw new Error(`The schema refuses the content. ${listed}`);
        }

        content = structuredClone(next);
      },
    },

    links: {
      list: async (filter = {}) => structuredClone(links.filter((link) => touches(link, filter))),
      replace: async (mine) => {
        links = [...links.filter((link) => link.source.id !== TEST_INSTANCE.id), ...structuredClone(mine)];
      },
      pick: async (accepts) => options.pick?.(accepts) ?? null,
    },

    exports: {
      list: async (instance = TEST_INSTANCE.id) => {
        const items = manifest && instance === TEST_INSTANCE.id ? listExports(manifest.exports, content) : [];

        return items.map((item) => ({ instance, ...item }));
      },
    },
    instances: { list: async () => [{ ...TEST_INSTANCE }] },

    open: async (identifier) => void opened.push(structuredClone(identifier)),
  };

  // The insets of a page, which holds a plugin on its canvas. They sit around the element that holds
  // the shadow root, which is the plugin's: a plugin sets its own tokens on it.
  const element = document.body.appendChild(document.createElement("div"));
  element.style.padding = "var(--space-6) var(--layout-gutter) var(--space-12)";
  const holder = element.appendChild(document.createElement("div"));
  const target = holder.attachShadow({ mode: "open" }).appendChild(document.createElement("div"));
  // Vitest derives the locator of an element from its text when nothing names it, and the text of a
  // plugin changes. This name keeps `page.elementLocator(target)` on the plugin.
  target.dataset.testid = crypto.randomUUID();
  const mounted = plugin.mount(target, host);

  return {
    target,
    content: () => structuredClone(content),
    links: () => structuredClone(links),
    opened,
    destroy() {
      mounted.destroy();
      element.remove();
    },
  };
}
