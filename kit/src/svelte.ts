import { type Component, mount, unmount } from "svelte";

import type { Host, Plugin } from "@a-novel/plugins-narrative-engine-contract";

/**
 * Makes a plugin of a Svelte component, which receives the host as its `host` prop. The result is
 * the default export of a UI module:
 *
 * ```ts
 * export default definePlugin(App);
 * ```
 *
 * The host is the same for the life of a mount: a new locale or a new instance is a new mount.
 */
export function definePlugin(root: Component<{ host: Host }>): Plugin {
  return {
    mount(target, host) {
      const app = mount(root, { target, props: { host } });

      return { destroy: () => void unmount(app) };
    },
  };
}
