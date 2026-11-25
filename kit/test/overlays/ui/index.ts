import Overlays from "./Overlays.svelte";

import { mount, unmount } from "svelte";

import type { Plugin } from "@a-novel/plugins-narrative-engine-kit";

// The component asks nothing of its host.
const plugin: Plugin = {
  mount(target) {
    const app = mount(Overlays, { target });

    return { destroy: () => void unmount(app) };
  },
};

export default plugin;
