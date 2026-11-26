// The page of `plugin-kit preview`: the test host in a browser tab, for a developer to look at a
// plugin. It mounts the UI module as `plugin-kit build` writes it, and keeps what the plugin saves
// in the storage of the browser, so a reload finds it again.
//
// The page shows the plugin and nothing else. The address holds every choice, so a link opens the
// same preview: `locale` is a language of the plugin, `content` names the fixture to start from,
// and `reset` forgets what the plugin saved for that start.
import { type MountOptions, mountPlugin } from "./test.js";

import type { Json, Manifest, Messages, Plugin } from "@a-novel/plugins-narrative-engine-contract";

/** A Previewed plugin is what the preview server tells its page of the plugin it serves. */
export interface Previewed {
  name: string;
  /** The current version. */
  version: string;
  /** The manifest of the current version. */
  manifest: Manifest;
  languages: Record<string, Messages>;
  /** The sample contents of the current version, by the name of their file without its extension. */
  fixtures: Record<string, Json>;
}

const { name, version, manifest, languages, fixtures } = (await (await fetch("/plugin.json")).json()) as Previewed;

const address = new URL(location.href);
const locale = address.searchParams.get("locale") ?? "en";
const start = address.searchParams.get("content") ?? "";

document.title = `${name}@${version} | Plugin preview`;
document.documentElement.lang = locale;

// Each start keeps its own saved copy, which the plugin's version names: another version may refuse it.
const key = `plugin-kit:${name}@${version}:${start}`;

if (address.searchParams.has("reset")) {
  localStorage.removeItem(key);
  // A reload of the page then keeps what the plugin saves from here on.
  address.searchParams.delete("reset");
  history.replaceState(null, "", address);
}

const saved = JSON.parse(localStorage.getItem(key) ?? "{}") as Pick<MountOptions, "content" | "links">;

// The address changes with each build, so the browser never serves an earlier one.
const { default: ui } = (await import(/* @vite-ignore */ `/ui.js?${Date.now()}`)) as { default: Plugin };

// The plugin as built, on a host that saves what it is given once the test host has accepted it.
const saving: Plugin = {
  mount(target, host) {
    const save = () =>
      localStorage.setItem(key, JSON.stringify({ content: mounted.content(), links: mounted.links() }));

    return ui.mount(target, {
      ...host,
      content: { get: host.content.get, set: (next) => host.content.set(next).then(save) },
      links: { ...host.links, replace: (mine) => host.links.replace(mine).then(save) },
    });
  },
};

const mounted = mountPlugin(saving, {
  manifest,
  content: saved.content ?? fixtures[start],
  links: saved.links,
  locale,
  messages: languages[locale]?.messages,
});
