// The acceptance of the kit: the sample plugin, built by `kit/test/setup.ts`, in the test host.
import type { Plugin } from "../src/index.js";
import { type TestMount, mountPlugin } from "../src/test.js";

import { describe, expect, inject, it, onTestFinished } from "vitest";
import { page } from "vitest/browser";

const sample = inject("sample");

/** Loads a built UI module as a browser does from a registry: one file, with nothing to import from. */
async function load(source: string): Promise<Plugin> {
  const url = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
  onTestFinished(() => URL.revokeObjectURL(url));

  return ((await import(/* @vite-ignore */ url)) as { default: Plugin }).default;
}

/** Mounts a build of the sample in the test host, in a language of the plugin. */
async function mount(source = sample.ui, locale = "en"): Promise<TestMount> {
  const { manifest, content, languages } = sample;
  const mounted = mountPlugin(await load(source), { manifest, content, locale, messages: languages[locale]!.messages });
  onTestFinished(() => mounted.destroy());

  return mounted;
}

/** Reads every computed style of every element of a mounted plugin, its tokens included. */
function styles({ target }: TestMount): string[] {
  return [...target.querySelectorAll("*")].map((element) => {
    const style = getComputedStyle(element);

    return [...style].map((property) => `${property}: ${style.getPropertyValue(property)}`).join("; ");
  });
}

/** Lists the classes that scope the styles of a mounted plugin to its components. */
function scopedClasses({ target }: TestMount): string[] {
  const classes = [...target.querySelectorAll("*")].flatMap((element) => [...element.classList]);

  return [...new Set(classes.filter((name) => name.startsWith("svelte-")))];
}

describe("the sample plugin", () => {
  it("builds to one module, which mounts in the test host with the content the host holds", async () => {
    const view = page.elementLocator((await mount()).target);

    await expect.element(view.getByRole("heading", { name: "Beats" })).toBeVisible();
    await expect.element(view.getByRole("listitem")).toHaveLength(2);
    await expect.element(view.getByRole("listitem").first()).toHaveTextContent("Opening");
  });

  it("round-trips its content through the host", async () => {
    const mounted = await mount();
    const view = page.elementLocator(mounted.target);

    await view.getByRole("textbox", { name: "Title of the next beat" }).fill("Climax");
    await view.getByRole("button", { name: "Add the beat" }).click();

    await expect.element(view.getByRole("listitem").last()).toHaveTextContent("Climax");
    expect(mounted.content()).toEqual({
      beats: [
        { id: "opening", title: "Opening" },
        { id: "midpoint", title: "Midpoint" },
        { id: expect.any(String), title: "Climax" },
      ],
    });
  });

  it("renders in the language of the host", async () => {
    const view = page.elementLocator((await mount(sample.ui, "fr")).target);

    await expect.element(view.getByRole("button", { name: "Ajouter le temps fort" })).toBeVisible();
  });

  it("styles its components inside its shadow root, with the tokens it bundles", async () => {
    const { target } = await mount();
    const root = target.getRootNode() as ShadowRoot;

    // Four tokens of spacing, which the plugin's own tokens define as 0.1875rem each.
    await expect.poll(() => getComputedStyle(target.querySelector("form")!).rowGap).toBe("12px");
    expect(root.adoptedStyleSheets).toHaveLength(1);
    expect(root.querySelectorAll("style").length).toBeGreaterThan(0);
    expect(document.head.querySelector("style[id^=svelte-]")).toBeNull();
  });

  it("renders as built, whatever tokens the document carries", async () => {
    const mounted = await mount();
    await expect.element(page.elementLocator(mounted.target).getByRole("listitem")).toHaveLength(2);

    // The lamp and the insets of the page stay the host's. This host writes both with its own
    // tokens, which are about to leave, so it keeps their values.
    const root = document.documentElement;
    const lamp = root.style.getPropertyValue("--color-lamp");
    root.style.setProperty("--color-lamp", getComputedStyle(root).getPropertyValue("--color-lamp"));
    const insets = (mounted.target.getRootNode() as ShadowRoot).host.parentElement!;
    insets.style.padding = getComputedStyle(insets).padding;
    const built = styles(mounted);

    // The document loses its tokens, as under a host whose UI kit has since dropped or renamed them.
    const tokens = [...document.styleSheets].filter((sheet) =>
      [...sheet.cssRules].some((rule) => rule.cssText.includes("--space-base"))
    );
    for (const sheet of tokens) sheet.disabled = true;
    onTestFinished(() => {
      for (const sheet of tokens) sheet.disabled = false;
      root.style.setProperty("--color-lamp", lamp);
    });

    expect(getComputedStyle(root).getPropertyValue("--space-base")).toBe("");
    expect(styles(mounted)).toEqual(built);
  });

  it("leaves the lamp to its host", async () => {
    const { target } = await mount();

    // The tokens name the lamps and read the one the document chose: the plugin sets none.
    expect(getComputedStyle(target).getPropertyValue("--lamp-color")).toBe(
      getComputedStyle(document.documentElement).getPropertyValue("--color-lamp")
    );
  });

  it("draws the field of its card as an island draws one", async () => {
    const { target } = await mount();

    // On the canvas a field takes a ring. The card of the plugin is an island, where it is a bare
    // well: the rule that says so comes with the tokens the plugin bundles.
    const field = getComputedStyle(target.querySelector("input")!);
    expect(field.getPropertyValue("--color-field-border")).toBe("transparent");
  });

  it("mounts two versions on one page without sharing a class name", async () => {
    const [current, prerelease] = [await mount(sample.ui), await mount(sample.prerelease)];
    await expect.element(page.elementLocator(prerelease.target).getByRole("button")).toBeVisible();

    const [classes, others] = [scopedClasses(current), scopedClasses(prerelease)];
    expect(classes.length).toBeGreaterThan(1);
    expect(others).toHaveLength(classes.length);
    expect(classes.filter((name) => others.includes(name))).toEqual([]);

    // Each version keeps its own styles.
    for (const { target } of [current, prerelease]) {
      expect(getComputedStyle(target.querySelector("form")!).display).toBe("grid");
    }
  });
});
