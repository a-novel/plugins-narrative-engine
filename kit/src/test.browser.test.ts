import type { Host, Link, Manifest, Plugin } from "./index.js";
import { TEST_INSTANCE, mountPlugin } from "./test.js";

import { describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";

const manifest: Manifest = {
  manifest: 1,
  schema: {
    type: "object",
    required: ["beats"],
    properties: { beats: { type: "array", items: { type: "object", required: ["id"] } } },
    default: { beats: [] },
  },
  exports: { beats: { name: "exports.beats", select: "$.beats[*]", id: "/id", label: "/title" } },
};

const here = { id: TEST_INSTANCE.id, target: "beats/opening" };
const elsewhere = { id: "characters", target: "people/mara" };
const links: Link[] = [
  { source: here, destination: elsewhere, relationship: "follows" },
  { source: elsewhere, destination: here, relationship: "appears in" },
  { source: elsewhere, destination: elsewhere, relationship: "knows" },
];

/** Mounts a plugin that renders one line, and returns the host it received. */
function mount(options?: Parameters<typeof mountPlugin>[1]) {
  let host!: Host;
  const destroy = vi.fn();
  const plugin: Plugin = {
    mount(target, received) {
      host = received;
      target.textContent = "A plugin";

      return { destroy };
    },
  };

  return { mounted: mountPlugin(plugin, options), host, destroy };
}

describe("mountPlugin", () => {
  it("mounts the plugin in a shadow root of the document, and removes it when destroyed", () => {
    const { mounted, destroy } = mount();
    const root = mounted.target.getRootNode() as ShadowRoot;

    expect(root).toBeInstanceOf(ShadowRoot);
    expect(document.body.contains(root.host)).toBe(true);
    expect(mounted.target.textContent).toBe("A plugin");

    mounted.destroy();
    expect(destroy).toHaveBeenCalledOnce();
    expect(document.body.contains(root.host)).toBe(false);
  });

  it("carries the tokens, the fonts and the canvas of the UI kit on the document, under Studio's lamp", async () => {
    const { mounted } = mount();
    await document.fonts.ready;
    const root = getComputedStyle(document.documentElement);

    // Custom properties cross the shadow root, so a plugin reads the tokens of its host.
    expect(getComputedStyle(mounted.target).getPropertyValue("--space-base")).toBe("0.1875rem");
    expect([...document.fonts].map((face) => face.family)).toContain("TeX Gyre Heros");
    expect(root.colorScheme).toBe("dark");
    expect(root.getPropertyValue("--color-lamp")).toBe(root.getPropertyValue("--color-lamp-magenta"));
  });

  it("holds the plugin in the insets of a page, in the text style of the canvas", () => {
    const { mounted } = mount();
    const { host } = mounted.target.getRootNode() as ShadowRoot;
    const insets = getComputedStyle(host.parentElement!);

    // The top and the foot of a page, six and twelve steps of spacing, around the plugin's own element.
    expect([insets.paddingTop, insets.paddingBottom]).toEqual(["18px", "36px"]);
    expect(getComputedStyle(host).padding).toBe("0px");
    expect(getComputedStyle(mounted.target).fontSize).toBe("16px");
  });

  it("names the target, so a locator stays on the plugin whatever it renders", async () => {
    const { mounted } = mount();
    const view = page.elementLocator(mounted.target);

    mounted.target.textContent = "Another text";

    await expect.element(view).toHaveTextContent("Another text");
  });

  it("describes the host: its interface version, its locale, the messages and the one instance", async () => {
    const { host } = mount({ locale: "fr", messages: { heading: "Temps forts" } });

    expect(host).toMatchObject({
      api: 1,
      instance: TEST_INSTANCE.id,
      locale: "fr",
      messages: { heading: "Temps forts" },
    });
    expect(mount().host).toMatchObject({ locale: "en", messages: {} });
    expect(await host.instances.list()).toEqual([TEST_INSTANCE]);
  });

  describe("the content", () => {
    it("starts from the default of the manifest's schema, or from the content it is given", async () => {
      expect(await mount({ manifest }).host.content.get()).toEqual({ beats: [] });
      expect(await mount({ manifest, content: { beats: [{ id: "a" }] } }).host.content.get()).toEqual({
        beats: [{ id: "a" }],
      });
      expect(await mount().host.content.get()).toBeNull();
    });

    it("keeps what the plugin sets, for the plugin and for the test", async () => {
      const { mounted, host } = mount({ manifest });
      const next = { beats: [{ id: "opening" }] };

      await host.content.set(next);
      next.beats.pop();

      expect(await host.content.get()).toEqual({ beats: [{ id: "opening" }] });
      expect(mounted.content()).toEqual({ beats: [{ id: "opening" }] });
    });

    it("refuses a content that is invalid against the manifest's schema", async () => {
      const { mounted, host } = mount({ manifest });

      await expect(host.content.set({ beats: [{}] })).rejects.toThrow(
        new Error('The schema refuses the content. /beats/0: Missing required property "id".')
      );
      expect(mounted.content()).toEqual({ beats: [] });
    });

    it("refuses a value that cannot cross a message boundary, as the proxy of a reactive state", async () => {
      const { mounted, host } = mount({ manifest });

      await expect(host.content.set(new Proxy({ beats: [] }, {}))).rejects.toThrow(DOMException);
      await expect(host.content.set({ beats: [{ id: "a", read: () => "a" }] } as never)).rejects.toThrow(DOMException);
      expect(mounted.content()).toEqual({ beats: [] });
    });
  });

  describe("the links", () => {
    it("lists the links of the project, filtered by the instance at either end", async () => {
      const { host } = mount({ links });

      expect(await host.links.list()).toEqual(links);
      expect(await host.links.list({ source: TEST_INSTANCE.id })).toEqual([links[0]]);
      expect(await host.links.list({ destination: TEST_INSTANCE.id })).toEqual([links[1]]);
      expect(await host.links.list({ source: "characters", destination: "characters" })).toEqual([links[2]]);
    });

    it("replaces the links the instance is the source of, and no other", async () => {
      const { mounted, host } = mount({ links });
      const mine = { source: { ...here, target: "beats/midpoint" }, destination: elsewhere, relationship: "precedes" };

      await host.links.replace([mine]);

      expect(mounted.links()).toEqual([links[1], links[2], mine]);
    });

    it("answers a picker with the test's choice, and dismisses it without one", async () => {
      const pick = vi.fn(() => elsewhere);

      expect(await mount({ pick }).host.links.pick(["people"])).toEqual(elsewhere);
      expect(pick).toHaveBeenCalledWith(["people"]);
      expect(await mount().host.links.pick(["people"])).toBeNull();
    });
  });

  it("lists the items the content exports through the manifest", async () => {
    const { host } = mount({ manifest });
    await host.content.set({ beats: [{ id: "opening", title: "Opening" }, { id: "untitled" }] });

    const items = [
      { instance: TEST_INSTANCE.id, export: "beats", id: "opening", label: "Opening" },
      { instance: TEST_INSTANCE.id, export: "beats", id: "untitled", label: "" },
    ];
    expect(await host.exports.list()).toEqual(items);
    expect(await host.exports.list(TEST_INSTANCE.id)).toEqual(items);
    expect(await host.exports.list("characters")).toEqual([]);
    expect(await mount().host.exports.list()).toEqual([]);
  });

  it("records the identifiers the plugin opens", async () => {
    const { mounted, host } = mount();

    await host.open(elsewhere);
    await host.open(here);

    expect(mounted.opened).toEqual([elsewhere, here]);
  });
});
