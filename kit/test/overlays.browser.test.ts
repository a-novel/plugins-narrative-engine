// What a plugin opens above its own content, from inside the shadow root of the test host: the
// plugin of `kit/test/overlays`, built by `kit/test/setup.ts`.
import type { Plugin } from "../src/index.js";
import { mountPlugin } from "../src/test.js";

import { describe, expect, inject, it, onTestFinished } from "vitest";
import { type Locator, page } from "vitest/browser";

/** Mounts the plugin in the test host, and returns what a test finds it by. */
async function mount(): Promise<Locator> {
  const url = URL.createObjectURL(new Blob([inject("overlays")], { type: "text/javascript" }));
  const mounted = mountPlugin(((await import(/* @vite-ignore */ url)) as { default: Plugin }).default);
  onTestFinished(() => {
    mounted.destroy();
    URL.revokeObjectURL(url);
  });

  return page.elementLocator(mounted.target);
}

/**
 * Tells whether `lower` sits against the bottom edge of `upper`, once its entry has played. A
 * surface that lost its source lands in a corner of the screen or in its middle, far from it.
 */
function sitsUnder(upper: Locator, lower: Locator): boolean {
  const space = lower.element().getBoundingClientRect().top - upper.element().getBoundingClientRect().bottom;

  return space >= 0 && space <= 24;
}

describe("what a plugin opens in a shadow root", () => {
  it("opens the list of a select under its field, and takes the option picked", async () => {
    const view = await mount();
    const select = view.getByRole("combobox", { name: "Kind" });

    await select.click();
    await expect.element(view.getByRole("option", { name: "Conflict" })).toBeVisible();
    await expect.poll(() => sitsUnder(select, view.getByRole("listbox"))).toBe(true);

    await view.getByRole("option", { name: "Conflict" }).click();
    await expect.element(select).toHaveTextContent("Conflict");
  });

  it("opens the list of a combobox under its field, and takes the option picked", async () => {
    const view = await mount();
    const combobox = view.getByRole("combobox", { name: "Place" });

    await combobox.fill("pay");
    await expect.element(view.getByRole("option")).toHaveLength(1);
    await expect.poll(() => sitsUnder(combobox, view.getByRole("listbox"))).toBe(true);

    await view.getByRole("option", { name: "Payoff" }).click();
    await expect.element(combobox).toHaveValue("Payoff");
  });

  it("opens a menu under its trigger, and closes it on the action picked", async () => {
    const view = await mount();
    const trigger = view.getByRole("button", { name: "Beat actions" });

    await trigger.click();
    await expect.element(view.getByRole("menuitem", { name: "Rename" })).toBeVisible();
    await expect.poll(() => sitsUnder(trigger, view.getByRole("menu"))).toBe(true);

    await view.getByRole("menuitem", { name: "Rename" }).click();
    await expect.element(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("shows a tooltip over its trigger", async () => {
    const view = await mount();
    const trigger = view.getByRole("button", { name: "Help" });

    await trigger.hover();
    await expect.element(view.getByRole("tooltip")).toHaveTextContent("Explains the beat");
    await expect.poll(() => sitsUnder(view.getByRole("tooltip"), trigger)).toBe(true);
  });

  // The page blurs and holds behind the dialog from uikit 0.29.1 on, so this test leaves the page
  // out until the repository depends on that version (a-novel/plugins-narrative-engine#28).
  it("opens a modal dialog, and closes it on its action", async () => {
    const view = await mount();

    await view.getByRole("button", { name: "Open the dialog" }).click();
    await expect.element(view.getByRole("button", { name: "Keep it" })).toBeVisible();

    const dialog = view.getByRole("dialog").element() as HTMLDialogElement;
    expect(dialog.matches(":modal")).toBe(true);

    await view.getByRole("button", { name: "Keep it" }).click();
    await expect.poll(() => dialog.open).toBe(false);
  });
});
