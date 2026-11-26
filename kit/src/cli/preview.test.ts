import { build } from "./build.js";
import { readPlugin } from "./folder.js";
import { preview } from "./preview.js";
import { copySample } from "./sample.fixture.js";

import { writeFileSync } from "node:fs";
import { join } from "node:path";

import { beforeEach, describe, expect, it, onTestFinished, vi } from "vitest";

import { type Page, chromium } from "playwright";

// A UI without a framework: a button that counts the beats of the content, and adds one.
const counter = (label: string) => `export default {
  mount(target, host) {
    const add = target.appendChild(document.createElement("button"));
    const show = (content) => (add.textContent = \`\${host.messages.${label}}: \${content.beats.length}\`);
    void host.content.get().then(show);

    add.addEventListener("click", async () => {
      const content = await host.content.get();
      const next = { beats: [...content.beats, { id: crypto.randomUUID(), title: "A beat" }] };
      await host.content.set(next);
      show(next);
    });

    return { destroy: () => add.remove() };
  },
};
`;

/** Serves the preview of a plugin for the time of a test, and returns its address. */
async function serve(folder: string): Promise<string> {
  const server = await preview(folder, { port: 0, host: "127.0.0.1" });
  onTestFinished(() => server.close());

  return server.resolvedUrls!.local[0]!;
}

/** Opens a page of a browser for the time of a test, with the list of what the server refuses it. */
async function open(): Promise<{ page: Page; refused: string[] }> {
  const browser = await chromium.launch();
  onTestFinished(() => browser.close());

  const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
  const refused: string[] = [];
  page.on("response", (response) => {
    if (response.status() >= 400) refused.push(response.url());
  });

  return { page, refused };
}

describe("preview", () => {
  beforeEach(() => {
    // The command builds what a registry serves, whatever the test runner sets.
    vi.stubEnv("NODE_ENV", "production");

    return () => vi.unstubAllEnvs();
  });

  it("describes the current version of the plugin, as its folder holds it now", async () => {
    const folder = copySample();
    const address = await serve(folder);
    const describe = async () => (await fetch(`${address}plugin.json`)).json();

    expect(await describe()).toMatchObject({
      name: "sample",
      version: "1.1.0",
      manifest: { manifest: 1, exports: { beats: { select: "$.beats[*]" } } },
      languages: { en: { title: "Sample" }, fr: { messages: { add: "Ajouter le temps fort" } } },
      fixtures: { outline: { beats: [{ id: "opening" }, { id: "midpoint" }] } },
    });

    writeFileSync(join(folder, "fixtures/1.1.0/empty.json"), '{ "beats": [] }');

    expect(await describe()).toMatchObject({ fixtures: { outline: {}, empty: { beats: [] } } });
  });

  it("serves the UI module as build writes it, and builds it again when a file of the plugin changes", async () => {
    const folder = copySample();
    const address = await serve(folder);
    const module = async () => (await fetch(`${address}ui.js`)).text();

    const response = await fetch(`${address}ui.js`);
    expect(response.headers.get("content-type")).toBe("text/javascript");
    expect(await response.text()).toBe((await build(readPlugin(folder))).ui);

    writeFileSync(
      join(folder, "ui/index.ts"),
      'export default { mount: () => ({ destroy() {}, focus: () => "again" }) };'
    );

    await expect.poll(module, { timeout: 10_000 }).toContain("again");
  });

  it("shows the plugin alone, in the box of a host, and keeps what it saves across a reload", async () => {
    // The copy sits outside the workspace of the kit, as the plugin of another repository does.
    const address = await serve(copySample({ "ui/index.ts": counter("add") }));
    const { page, refused } = await open();
    const count = (beats: number) => page.getByRole("button", { name: `Add the beat: ${beats}` });

    await page.goto(address);
    // A new instance starts from the default of the schema.
    await count(0).click();
    await count(1).click();
    await count(2).waitFor();

    expect(await page.title()).toBe("sample@1.1.0 | Plugin preview");
    // The page holds its script and the plugin, whose box is the screen inside the insets of a page.
    const shown = await page.evaluate(() => {
      const holder = document.querySelector("body > div > div")!;
      const { height } = holder.shadowRoot!.firstElementChild!.getBoundingClientRect();
      const insets = getComputedStyle(holder.parentElement!);

      return {
        elements: Array.from(document.body.children, (element) => element.tagName),
        box: height + parseFloat(insets.paddingTop) + parseFloat(insets.paddingBottom),
        scrolls: document.documentElement.scrollHeight > window.innerHeight,
      };
    });
    expect(shown).toEqual({ elements: ["SCRIPT", "DIV"], box: 600, scrolls: false });
    // The page finds every module, sheet and font it asks for.
    await page.evaluate(() => document.fonts.ready);
    expect(refused).toEqual([]);

    await page.reload();
    await count(2).waitFor();

    // The address forgets what the plugin saved, once.
    await page.goto(`${address}?reset`);
    await count(0).click();
    expect(page.url()).toBe(address);
    await page.reload();
    await count(1).waitFor();
  });

  it("takes the language and the start of the plugin from the address", async () => {
    const address = await serve(copySample({ "ui/index.ts": counter("add") }));
    const { page } = await open();

    await page.goto(`${address}?locale=fr&content=outline`);
    await page.getByRole("button", { name: "Ajouter le temps fort: 2" }).click();
    await page.getByRole("button", { name: "Ajouter le temps fort: 3" }).waitFor();
    expect(await page.evaluate(() => document.documentElement.lang)).toBe("fr");

    // Each start keeps a copy of its own.
    await page.goto(address);
    await page.getByRole("button", { name: "Add the beat: 0" }).waitFor();
    await page.goto(`${address}?content=outline`);
    await page.getByRole("button", { name: "Add the beat: 3" }).waitFor();
  });

  it("reloads the page on a new build when a file of the plugin changes", async () => {
    const folder = copySample({ "ui/index.ts": counter("add") });
    const { page } = await open();

    await page.goto(await serve(folder));
    await page.getByRole("button", { name: "Add the beat: 0" }).waitFor();

    writeFileSync(join(folder, "ui/index.ts"), counter("heading"));

    await page.getByRole("button", { name: "Beats: 0" }).waitFor();
  });
});
