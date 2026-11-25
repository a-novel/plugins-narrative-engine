import type { Plugin } from "@a-novel/plugins-narrative-engine-kit";

// TODO: mounts nothing. The composer has no interface yet.
const plugin: Plugin = {
  mount: () => ({ destroy() {} }),
};

export default plugin;
