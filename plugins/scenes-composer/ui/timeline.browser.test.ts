// The acceptance of the timeline: the composer as `plugin-kit build` writes it, in the test host.
import english from "../i18n/en.json" with { type: "json" };
import french from "../i18n/fr.json" with { type: "json" };
import { countingIds, largeContent } from "./content.fixture.ts";
import type { Cell, Content, Layer } from "./content.ts";
import { DEFAULT_WIDTH, LIMITS } from "./edits.ts";
import { preset } from "./presets.ts";

import { describe, expect, inject, it, onTestFinished, vi } from "vitest";
import { type Locator, page, userEvent } from "vitest/browser";

import type { Host, Plugin } from "@a-novel/plugins-narrative-engine-kit";
import { type TestMount, mountPlugin } from "@a-novel/plugins-narrative-engine-kit/test";

const { manifest, ui } = inject("composer");
const LANGUAGES = { en: english.messages, fr: french.messages };

// The UI module as a browser loads it from a registry: one file, with nothing to import from.
const address = URL.createObjectURL(new Blob([ui], { type: "text/javascript" }));
const { default: composer } = (await import(/* @vite-ignore */ address)) as { default: Plugin };

// The page Vitest gives a test is a phone's, where the timeline shows one scene at a time.
const PHONE = [window.innerWidth, window.innerHeight] as const;

const UNDO = "{Control>}z{/Control}";
const REDO = "{Control>}y{/Control}";

/**
 * A story of two beats and three scenes, under a layer of each kind. One beat and one scene are
 * described, and one layer carries a color.
 */
function story(): Content {
  const id = countingIds();
  const [loglines, script, notes, links] = [id(), id(), id(), id()];

  return {
    beats: [
      {
        id: id(),
        title: "Setup",
        description: "The ordinary world.",
        scenes: [
          {
            id: id(),
            title: "The last ferry",
            description: "The harbor, at night.",
            cells: [
              { kind: "logline", layer: loglines, text: "Mara waits for a passenger." },
              {
                kind: "script",
                layer: script,
                blocks: [
                  { kind: "narration", text: "Rain fell on the harbor." },
                  { kind: "dialogue", speaker: "Mara", text: "You came." },
                ],
              },
              { kind: "notes", layer: notes, text: "Mara, the keeper." },
            ],
          },
          { id: id(), title: "", description: "", cells: [] },
        ],
      },
      {
        id: id(),
        title: "",
        description: "",
        scenes: [
          {
            id: id(),
            title: "The storm",
            description: "",
            cells: [{ kind: "script", layer: script, blocks: [{ kind: "narration", text: "Dawn." }] }],
          },
        ],
      },
    ],
    layers: [
      { id: loglines, kind: "logline", name: "Scenes" },
      { id: script, kind: "script", name: "Enriched scenes" },
      { id: notes, kind: "notes", name: "Characters", color: "#0ea5e9" },
      { id: links, kind: "link", name: "", accepts: ["scenes"] },
    ],
  };
}

interface Options {
  locale?: "en" | "fr";
  /** Keeps the page of a phone, for the timeline of a narrow box. */
  narrow?: boolean;
  /** Stands between the composer and the test host, to record, delay or fail what the host answers. */
  wrap?: (host: Host) => Host;
}

/**
 * Mounts the composer in the test host for the time of a test, on a content or on a new instance.
 * The page is wide for that time, unless the test asks for a narrow box.
 */
async function mount(content?: Content, { locale = "en", narrow = false, wrap }: Options = {}) {
  if (!narrow) {
    onTestFinished(() => page.viewport(...PHONE));
    await page.viewport(1280, 800);
  }

  const plugin: Plugin = wrap ? { mount: (target, host) => composer.mount(target, wrap(host)) } : composer;
  const mounted = mountPlugin(plugin, { manifest, content, locale, messages: LANGUAGES[locale] });
  onTestFinished(() => mounted.destroy());

  return { mounted, view: page.elementLocator(mounted.target), saved: () => mounted.content() as Content };
}

/** Records every content the composer sends its host. */
const recording =
  (sets: unknown[]) =>
  (host: Host): Host => ({
    ...host,
    content: { get: host.content.get, set: (next) => (sets.push(next), host.content.set(next)) },
  });

/** Finds the place a layer keeps for a scene, both by their position among what the timeline shows. */
const cell = (view: Locator, layer: number, scene: number) =>
  view
    .getByRole("row")
    .nth(layer + 2)
    .getByRole("gridcell")
    .nth(scene);

/** Finds what scrolls the timeline, both ways. */
const scroller = (view: Locator) => view.getByRole("grid").element().parentElement!;

/** Reads what holds the focus inside the plugin: the name of a field or of a header, its text otherwise. */
function focused({ target }: TestMount): string | undefined {
  const element = (target.getRootNode() as ShadowRoot).activeElement as Partial<HTMLInputElement> | null;
  const name = element?.getAttribute?.("aria-label") ?? element?.labels?.[0]?.textContent ?? element?.textContent;

  return name?.trim().replace(/\s+/g, " ");
}

/** Opens the menu of a header or of a card with the second button of a pointer, and chooses one of its actions. */
async function choose(view: Locator, from: Locator, action: string) {
  await from.click({ button: "right" });
  await view.getByRole("menuitem", { name: action, exact: true }).click();
}

/** Lists the names a locator finds, in order: the actions of an open menu, or the buttons of a dialog. */
const names = (found: Locator) => found.elements().map((element) => element.textContent?.trim());

/** Selects the card of a place with a click on its band, which ends at the top of the place. */
const select = (place: Locator) => place.click({ position: { x: 24, y: 8 } });

/** Takes the pointer to the corner of the timeline, where it lights nothing. */
const away = (view: Locator) => view.getByRole("grid").hover({ position: { x: 4, y: 4 } });

/** Finds the field of the card edited in place. A dialog keeps its own fields while it fades out. */
const field = (view: Locator) => view.getByRole("grid").getByRole("textbox");

/** Writes in the field of the card being edited, and ends the edit with a key. */
async function write(view: Locator, text: string, key = "{Enter}") {
  await field(view).fill(text);
  await userEvent.keyboard(key);
}

/** Fills fields of the open dialog, each under its label, and saves the dialog. */
async function submit(view: Locator, fields: Record<string, string>) {
  // The color of a layer is a textbox too, so a field goes by its name.
  for (const [label, text] of Object.entries(fields)) await view.getByRole("textbox", { name: label }).fill(text);
  await view.getByRole("button", { name: "Save" }).click();
}

const scenes = (content: Content) => content.beats.map((beat) => beat.scenes.map((scene) => scene.title));
const box = (locator: Locator) => locator.element().getBoundingClientRect();
// A size counts quarters of the base text size of the page.
const quarter = () => parseFloat(getComputedStyle(document.documentElement).fontSize) / 4;

describe("a new composer", () => {
  it.each([
    ["en", "Choose a structure to start from", ["Blank", "Hollywood beats", "15 beats"]],
    ["fr", "Choisissez une structure de départ", ["Vierge", "Temps forts hollywoodiens", "15 temps forts"]],
  ] as const)("offers the structures a story starts from, in %s", async (locale, title, structures) => {
    const { view } = await mount(undefined, { locale });

    await expect.element(view.getByRole("heading", { name: title })).toBeVisible();
    for (const structure of structures) {
      await expect.element(view.getByRole("button", { name: structure, exact: true })).toBeVisible();
    }
    await expect.element(view.getByRole("grid")).not.toBeInTheDocument();
  });

  it("starts from the structure chosen, and saves it", async () => {
    const { view, saved } = await mount();

    await view.getByRole("button", { name: "Hollywood beats" }).click();

    await expect.element(view.getByRole("grid", { name: "Timeline" })).toBeVisible();
    // Nine beats, each with one scene.
    await expect.element(view.getByRole("columnheader")).toHaveLength(18);
    expect(saved().beats.map((beat) => beat.title)).toEqual(
      preset("hollywoodBeats", english.messages).beats.map((beat) => beat.title)
    );
    expect(saved().layers.map((layer) => [layer.kind, layer.name])).toEqual([
      ["logline", "Scenes"],
      ["script", "Enriched scenes"],
    ]);
  });

  it("starts in the language of the host", async () => {
    const { view, saved } = await mount(undefined, { locale: "fr" });

    await view.getByRole("button", { name: "Vierge" }).click();

    await expect.element(view.getByRole("grid", { name: "Chronologie" })).toBeVisible();
    await expect.element(view.getByRole("columnheader", { name: "Temps fort 1" })).toBeVisible();
    await expect.element(view.getByRole("rowheader", { name: "Scènes enrichies" })).toBeVisible();
    expect(saved().layers.map((layer) => layer.name)).toEqual(["Scènes", "Scènes enrichies"]);
  });

  it("keeps a story built from a structure across a reload", async () => {
    const first = await mount();
    await first.view.getByRole("button", { name: "15 beats" }).click();
    await first.view.getByRole("columnheader", { name: "Scene 1", exact: true }).dblClick();
    await submit(first.view, { Title: "The last ferry", Description: "The harbor, at night." });
    await cell(first.view, 0, 0).click();
    await write(first.view, "Mara waits for a passenger.");
    await expect.poll(() => first.saved().beats[0]!.scenes[0]!.cells).toHaveLength(1);

    // A host mounts the plugin again on what it saved.
    first.mounted.destroy();
    const { view } = await mount(first.saved());

    await expect.element(view.getByRole("columnheader")).toHaveLength(30);
    await expect.element(view.getByRole("columnheader", { name: "The last ferry" })).toBeVisible();
    await expect.element(view.getByText("The harbor, at night.")).toBeVisible();
    await expect.element(cell(view, 0, 0)).toHaveTextContent("Mara waits for a passenger.");
    await expect.element(view.getByRole("heading")).not.toBeInTheDocument();
  });

  it("offers a structure once: a composer keeps its last beat", async () => {
    const { view } = await mount(preset("blank", english.messages));

    await view.getByRole("columnheader", { name: "Beat 1" }).click({ button: "right" });

    await expect.element(view.getByRole("menuitem", { name: "Delete" })).toBeDisabled();
    await expect.element(view.getByRole("menuitem", { name: "Edit" })).toBeEnabled();
  });
});

describe("the timeline", () => {
  /** The story, with tracks too tall for the box: the timeline scrolls down. */
  function tall(): Content {
    const content = story();
    for (const layer of content.layers) layer.height = LIMITS.height[1];

    return content;
  }

  /** Scrolls the timeline down, and waits for it to have seen the scroll. */
  const scrollTo = (view: Locator, top: number) =>
    new Promise<void>((seen) => {
      scroller(view).addEventListener("scroll", () => seen(), { once: true });
      scroller(view).scrollTo(0, top);
    });

  it("shows scenes under their beat, layers as tracks, and a card where a layer holds something", async () => {
    const { view } = await mount(story());

    // The names of the beats, those of the scenes, the four tracks, and the row that adds one.
    await expect.element(view.getByRole("row")).toHaveLength(7);
    await expect.element(view.getByRole("columnheader", { name: "Setup" })).toHaveAttribute("aria-colspan", "2");
    await expect.element(view.getByRole("columnheader", { name: "The last ferry" })).toBeVisible();
    await expect.element(view.getByRole("rowheader", { name: "Characters" })).toHaveTextContent("Characters Notes");
    await expect.element(cell(view, 0, 0)).toHaveTextContent("Mara waits for a passenger.");
    await expect.element(cell(view, 2, 0)).toHaveTextContent("Mara, the keeper.");
    await expect.element(cell(view, 0, 1)).toBeEmptyDOMElement();
  });

  it("names what has no title by its place, and a layer without a name by its kind", async () => {
    const { view } = await mount(story());

    await expect.element(view.getByRole("columnheader", { name: "Beat 2" })).toBeVisible();
    await expect.element(view.getByRole("columnheader", { name: "Scene 2" })).toBeVisible();
    await expect.element(view.getByRole("rowheader", { name: "Links" })).toBeVisible();
  });

  it("shows a script as its first lines and its count of words, and does not edit it", async () => {
    const { view } = await mount(story());

    await expect.element(cell(view, 1, 0)).toHaveTextContent("Rain fell on the harbor. Mara: You came. 7 words");
    await expect.element(cell(view, 1, 2)).toHaveTextContent("Dawn. 1 word");

    await cell(view, 1, 0).click();
    await userEvent.keyboard("{Enter}");
    await cell(view, 3, 0).click();
    await userEvent.keyboard("{F2}");

    await expect.element(field(view)).not.toBeInTheDocument();
  });

  it.each([
    ["a beat", (content: Content) => content.beats[0]!],
    ["a scene", (content: Content) => content.beats[0]!.scenes[0]!],
  ] as const)("shows what describes %s whole, over the lines it takes", async (_, described) => {
    const content = story();
    described(content).description = `${"The ordinary world, and what is missing from it. ".repeat(6)}\nThen a letter.`;
    const { view } = await mount(content);

    const description = view.getByText(/Then a letter\./);
    await expect.element(description).toBeVisible();
    const { scrollWidth, clientWidth, scrollHeight, clientHeight } = description.element();

    // Nothing of it is cut, across or down, to the pixel a line's height rounds by, and it stands on
    // several lines.
    expect(scrollWidth - clientWidth).toBeLessThan(2);
    expect(scrollHeight - clientHeight).toBeLessThan(2);
    expect(clientHeight).toBeGreaterThan(3 * parseFloat(getComputedStyle(description.element()).lineHeight));
  });

  it("keeps the names of beats and scenes in view while what describes them scrolls away", async () => {
    const { view } = await mount(tall());
    const beat = view.getByRole("columnheader", { name: "Setup" });
    const scene = view.getByRole("columnheader", { name: "The last ferry" });
    await expect.element(view.getByText("The ordinary world.")).toBeVisible();
    await expect.element(view.getByText("The harbor, at night.")).toBeVisible();

    await scrollTo(view, 400);

    const edge = scroller(view).getBoundingClientRect();
    expect(box(beat).top).toBeCloseTo(edge.top, 0);
    expect(box(scene).top).toBeCloseTo(box(beat).bottom, 0);
    expect(box(view.getByText("The ordinary world.")).bottom).toBeLessThan(edge.top);
    expect(box(view.getByText("The harbor, at night.")).bottom).toBeLessThan(edge.top);
  });

  it("tells what describes a name under the pointer, while its description is out of view", async () => {
    const { view } = await mount(tall());
    await away(view);
    await scrollTo(view, 400);

    await view.getByRole("columnheader", { name: "The last ferry" }).hover();
    await expect.element(view.getByRole("tooltip", { name: "The harbor, at night." })).toBeVisible();

    await view.getByRole("columnheader", { name: "Setup" }).hover();
    await expect.element(view.getByRole("tooltip", { name: "The ordinary world." })).toBeVisible();
    await expect.element(view.getByRole("tooltip", { name: "The harbor, at night." })).not.toBeInTheDocument();

    // Back in view, a description is not told twice. The name of a beat stays under the pointer.
    await scrollTo(view, 0);
    await expect.element(view.getByRole("tooltip")).not.toBeInTheDocument();
  });

  it("tells what describes a name with the focus, while its description is out of view", async () => {
    const { mounted, view } = await mount(tall());
    await away(view);
    await scrollTo(view, 400);

    await userEvent.tab();
    expect(focused(mounted)).toBe("Setup");
    await expect.element(view.getByRole("tooltip", { name: "The ordinary world." })).toBeVisible();

    await userEvent.keyboard("{ArrowDown}");
    await expect.element(view.getByRole("tooltip", { name: "The harbor, at night." })).toBeVisible();
    await expect.element(view.getByRole("tooltip", { name: "The ordinary world." })).not.toBeInTheDocument();
  });
});

describe("colors", () => {
  const BARE = "rgba(0, 0, 0, 0)";
  // The color of the one colored layer of the story, as the browser computes it.
  const EXACT = "rgb(14, 165, 233)";

  // Hues all around the circle, then a gray, which has no hue, and no color at all.
  const HUES = "ff0000 ff8000 ffff00 80ff00 00ff00 00ff80 00ffff 0080ff 0000ff 8000ff ff00ff ff0080".split(" ");
  const COLORS = [...HUES.map((hue) => `#${hue}`), "#808080", undefined];

  /** A scene under a notes layer and a script layer of each color: every text a track draws, on every fill. */
  function palette(): Content {
    const id = countingIds();
    const layers: Layer[] = COLORS.flatMap((color) =>
      (["notes", "script"] as const).map((kind) => ({ id: id(), kind, name: "", ...(color && { color }) }))
    );
    const cells = layers.map((layer): Cell =>
      layer.kind === "notes"
        ? { kind: "notes", layer: layer.id, text: "Mara, the keeper." }
        : { kind: "script", layer: layer.id, blocks: [{ kind: "narration", text: "Dawn." }] }
    );

    return {
      beats: [{ id: id(), title: "", description: "", scenes: [{ id: id(), title: "", description: "", cells }] }],
      layers,
    };
  }

  /** Mounts a content with the pointer on the corner, which lights nothing. */
  async function still(content = story()) {
    const mounted = await mount(content);
    await away(mounted.view);

    return mounted;
  }

  /** Lists what an element and each of its parts paint behind their content, as the browser computes it. */
  const paints = (locator: Locator) =>
    [locator.element(), ...locator.element().querySelectorAll("*")].map((part) => {
      const { backgroundImage, backgroundColor } = getComputedStyle(part);

      return `${backgroundImage} ${backgroundColor}`;
    });

  /** Lists the fills behind a text, from the nearest one to the edge of the plugin. */
  function behind(text: Element): string[] {
    const fills: string[] = [];
    for (let part: Element | null = text; part; part = part.parentElement) {
      const fill = getComputedStyle(part).backgroundColor;
      if (fill !== BARE) fills.push(fill);
    }

    return fills;
  }

  const pixel = document.createElement("canvas").getContext("2d", { willReadFrequently: true })!;

  /** Paints colors one over the other, as the browser blends them, and reads how light the result is. */
  function luminance(...colors: string[]): number {
    pixel.clearRect(0, 0, 1, 1);
    for (const color of colors) {
      pixel.fillStyle = color;
      pixel.fillRect(0, 0, 1, 1);
    }

    const [red, green, blue] = Array.from(pixel.getImageData(0, 0, 1, 1).data, (channel) => channel / 255).map(
      (channel) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
    );

    return 0.2126 * red! + 0.7152 * green! + 0.0722 * blue!;
  }

  /** Measures a text against everything painted behind it, down to the canvas, as WCAG counts contrast. */
  function contrast(text: Element): number {
    const probe = text.appendChild(document.createElement("span"));
    probe.style.background = "var(--color-surface-canvas)";
    const fills = [getComputedStyle(probe).backgroundColor, ...behind(text).reverse()];
    probe.remove();

    const [dark, light] = [luminance(...fills), luminance(...fills, getComputedStyle(text).color)].sort(
      (one, other) => one - other
    );

    return (light! + 0.05) / (dark! + 0.05);
  }

  /** Lists the parts of an element that hold a text of their own. */
  const texts = (element: Element) =>
    Array.from(element.querySelectorAll("*")).filter((part) =>
      Array.from(part.childNodes).some((node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim())
    );

  it("shows the exact color of a layer in the band of each of its cards, and nowhere else", async () => {
    const { view } = await still();

    expect(paints(cell(view, 2, 0)).join()).toContain(EXACT);
    expect(paints(view.getByRole("rowheader", { name: "Characters" })).join()).not.toContain(EXACT);

    // A place without a card paints nothing, and the track of a layer without a color shows none.
    expect(paints(cell(view, 2, 1)).every((paint) => paint === `none ${BARE}`)).toBe(true);
    expect(paints(view.getByRole("row").nth(2)).join()).not.toContain(EXACT);
  });

  it("stands the name of a track on one fill of the color of its layer, apart from the veil of its cards", async () => {
    const { view } = await still();
    const under = (layer: string) =>
      behind(view.getByRole("rowheader", { name: layer }).getByText(layer, { exact: true }).element())[0];

    expect(under("Characters")).toBeDefined();
    expect(under("Characters")).not.toBe(under("Scenes"));
    expect(under("Characters")).not.toBe(behind(cell(view, 2, 0).getByText("Mara, the keeper.").element())[0]);
  });

  it("fills a card with a veil of the color of its layer, which lights under the pointer", async () => {
    const { view } = await still();
    const colored = cell(view, 2, 0).getByText("Mara, the keeper.");
    const neutral = cell(view, 0, 0).getByText("Mara waits for a passenger.");
    const fill = (text: Locator) => behind(text.element())[0];
    const rest = fill(colored);

    // The full color stays in the band: a card fills with something quieter, which follows its layer.
    expect(rest).not.toBe(EXACT);
    expect(rest).not.toBe(fill(neutral));
    expect(fill(neutral)).toBeDefined();

    await colored.hover();

    await expect.poll(() => fill(colored)).not.toBe(rest);
  });

  it("keeps every text of a track readable, whatever its color", async () => {
    const { view } = await still(palette());
    const tracks = view.getByRole("row").elements().slice(2, -1);

    for (const [index, track] of tracks.entries()) {
      for (const text of texts(track)) {
        expect(contrast(text), `${text.textContent} on ${COLORS[index >> 1]}`).toBeGreaterThanOrEqual(4.5);
      }
    }

    // A card that takes a text lights under the pointer: the notes, on every other track.
    for (const index of COLORS.keys()) {
      const written = cell(view, index * 2, 0).getByText("Mara, the keeper.");
      const rest = behind(written.element())[0];
      await written.hover();

      await expect.poll(() => behind(written.element())[0]).not.toBe(rest);
      expect(contrast(written.element()), `lit, on ${COLORS[index]}`).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe("editing a card in place", () => {
  it("edits a card on a click, and Tab saves it and edits the next one", async () => {
    const { mounted, view, saved } = await mount(story());

    await cell(view, 0, 1).click();
    await expect.poll(() => focused(mounted)).toBe("Scenes, Scene 2");
    await write(view, "A letter arrives.", "{Tab}");

    await expect.poll(() => focused(mounted)).toBe("Scenes, The storm");
    await write(view, "The sea rises.", "{Shift>}{Tab}{/Shift}");

    await expect.poll(() => focused(mounted)).toBe("Scenes, Scene 2");
    await expect.element(field(view)).toHaveValue("A letter arrives.");
    const [, letter] = saved().beats[0]!.scenes;
    expect(letter!.cells).toEqual([{ kind: "logline", layer: saved().layers[0]!.id, text: "A letter arrives." }]);
    expect(saved().beats[1]!.scenes[0]!.cells).toContainEqual({
      kind: "logline",
      layer: saved().layers[0]!.id,
      text: "The sea rises.",
    });
  });

  it.each(["{Enter}", "{F2}"])("edits the card in focus with %s", async (key) => {
    const { mounted, view, saved } = await mount(story());

    await userEvent.tab();
    await userEvent.keyboard(`{ArrowDown}{ArrowDown}{ArrowRight}${key}`);
    await expect.poll(() => focused(mounted)).toBe("Scenes, Scene 2");
    await write(view, "A letter arrives.");

    await expect.poll(() => focused(mounted)).toBe("A letter arrives.");
    expect(saved().beats[0]!.scenes[1]!.cells).toHaveLength(1);
  });

  it("keeps the text when Escape leaves a card, and gives the focus back to it", async () => {
    const { mounted, view, saved } = await mount(story());

    await cell(view, 0, 0).click();
    await write(view, "Mara waits alone.", "{Escape}");

    await expect.element(field(view)).not.toBeInTheDocument();
    await expect.poll(() => focused(mounted)).toBe("Mara waits alone.");
    expect(saved().beats[0]!.scenes[0]!.cells).toContainEqual(expect.objectContaining({ text: "Mara waits alone." }));
  });

  it("keeps the text when the focus goes elsewhere", async () => {
    const { view, saved } = await mount(story());

    await cell(view, 0, 1).click();
    await field(view).fill("A letter arrives.");
    await view.getByRole("rowheader", { name: "Characters" }).click();

    await expect.element(field(view)).not.toBeInTheDocument();
    await expect.poll(() => saved().beats[0]!.scenes[1]!.cells).toHaveLength(1);
  });

  it("breaks a line of notes on Enter, and ends the edit with Control and Enter", async () => {
    const { view, saved } = await mount(story());

    await cell(view, 2, 1).click();
    await userEvent.keyboard("Night.{Enter}Rain.{Control>}{Enter}{/Control}");

    await expect.element(field(view)).not.toBeInTheDocument();
    expect(saved().beats[0]!.scenes[1]!.cells).toEqual([
      { kind: "notes", layer: saved().layers[2]!.id, text: "Night.\nRain." },
    ]);
  });

  it("keeps a logline on one line, whatever is pasted in it", async () => {
    const { view, saved } = await mount(story());

    await cell(view, 0, 1).click();
    await write(view, "A letter arrives.\n  It is from her mother.");

    await expect
      .poll(() => saved().beats[0]!.scenes[1]!.cells[0])
      .toMatchObject({
        text: "A letter arrives. It is from her mother.",
      });
  });

  it("takes the card of a text that is emptied away", async () => {
    const { view, saved } = await mount(story());

    await cell(view, 2, 0).click();
    await write(view, "", "{Control>}{Enter}{/Control}");

    await expect.poll(() => saved().beats[0]!.scenes[0]!.cells.map((held) => held.kind)).toEqual(["logline", "script"]);
    await expect.element(cell(view, 2, 0)).toBeEmptyDOMElement();
  });

  it("saves nothing for an edit that changes nothing", async () => {
    const sets: unknown[] = [];
    const { view } = await mount(story(), { wrap: recording(sets) });

    await cell(view, 0, 0).click();
    await userEvent.keyboard("{Escape}");
    await cell(view, 0, 1).click();
    await userEvent.keyboard("{Enter}");

    await expect.element(field(view)).not.toBeInTheDocument();
    expect(sets).toEqual([]);
  });
});

describe("a card", () => {
  /** Reads what a card fills with. The card is all its place holds. */
  const fill = (place: Locator) => getComputedStyle(place.element().firstElementChild!).backgroundColor;

  /** Tells whether a place draws the focus ring, which is a shadow inside what holds the focus. */
  const ringed = (place: Locator) =>
    [place.element(), ...place.element().querySelectorAll("*")].some(
      (part) => getComputedStyle(part, "::after").boxShadow !== "none"
    );

  it.each(["{Delete}", "{Backspace}"])("is selected by its band, and %s removes it until Undo", async (key) => {
    const before = story();
    const { mounted, view, saved } = await mount(before);

    await select(cell(view, 0, 0));
    await expect.poll(() => focused(mounted)).toBe("Mara waits for a passenger.");
    await expect.element(field(view)).not.toBeInTheDocument();

    await userEvent.keyboard(key);

    await expect.element(view.getByText("You deleted what “Scenes” held for “The last ferry”.")).toBeVisible();
    await expect.element(cell(view, 0, 0)).toBeEmptyDOMElement();
    await expect.poll(() => saved().beats[0]!.scenes[0]!.cells.map((held) => held.kind)).toEqual(["script", "notes"]);
    // The focus stays on the place the card left, from where the arrows go on.
    await userEvent.keyboard("{ArrowLeft}");
    expect(focused(mounted)).toBe("Scenes");

    await view.getByRole("button", { name: "Undo" }).click();

    await expect.poll(saved).toEqual(before);
  });

  it("takes the fill it has under the pointer once selected, and keeps it when the pointer leaves", async () => {
    const { view } = await mount(story());
    const place = cell(view, 2, 0);

    await away(view);
    const rest = fill(place);
    await place.hover();
    await expect.poll(() => fill(place)).not.toBe(rest);
    const lit = fill(place);
    await away(view);
    await expect.poll(() => fill(place)).toBe(rest);

    await select(place);
    await away(view);

    await expect.poll(() => fill(place)).toBe(lit);
  });

  it("shows the focus ring for the keyboard, and none for a pointer", async () => {
    const { mounted, view } = await mount(story());
    const place = cell(view, 0, 0);

    await select(place);
    await expect.poll(() => focused(mounted)).toBe("Mara waits for a passenger.");
    expect(ringed(place)).toBe(false);

    await userEvent.keyboard("{ArrowDown}{ArrowUp}");

    expect(focused(mounted)).toBe("Mara waits for a passenger.");
    expect(ringed(place)).toBe(true);
  });

  it("opens a menu of its own under the second button, which edits it or deletes it", async () => {
    const { mounted, view, saved } = await mount(story());

    await cell(view, 2, 0).click({ button: "right" });
    await expect.element(view.getByRole("menu", { name: "Actions on this card" })).toBeVisible();
    await expect.poll(() => names(view.getByRole("menuitem"))).toEqual(["Edit", "Delete"]);
    await view.getByRole("menuitem", { name: "Edit" }).click();
    await expect.poll(() => focused(mounted)).toBe("Characters, The last ferry");
    await write(view, "Mara, alone.", "{Escape}");

    await choose(view, cell(view, 2, 0), "Delete");

    await expect.element(view.getByText("You deleted what “Characters” held for “The last ferry”.")).toBeVisible();
    await expect.poll(() => saved().beats[0]!.scenes[0]!.cells.map((held) => held.kind)).toEqual(["logline", "script"]);
  });

  it.each(["{ContextMenu}", "{Shift>}{F10}{/Shift}"])(
    "opens its menu with %s, and takes the focus back when the menu closes",
    async (keys) => {
      const { mounted, view } = await mount(story());

      await select(cell(view, 0, 0));
      await userEvent.keyboard(keys);
      await expect.element(view.getByRole("menu", { name: "Actions on this card" })).toBeVisible();
      await expect.poll(() => focused(mounted)).toBe("Edit");

      await userEvent.keyboard("{Escape}");
      await expect.element(view.getByRole("menu")).not.toBeInTheDocument();
      await expect.poll(() => focused(mounted)).toBe("Mara waits for a passenger.");
      await userEvent.keyboard("{ArrowDown}");
      expect(focused(mounted)).toContain("Rain fell on the harbor.");
    }
  );

  it("leaves the card of a script alone, and a place without a card", async () => {
    const sets: unknown[] = [];
    const { view } = await mount(story(), { wrap: recording(sets) });

    // Another view writes a script, so its card takes no key and no menu here.
    await select(cell(view, 1, 0));
    await userEvent.keyboard("{Delete}");
    await cell(view, 1, 0).click({ button: "right" });
    await cell(view, 0, 1).click({ button: "right" });
    await userEvent.keyboard("{Backspace}");

    await expect.element(view.getByRole("menu")).not.toBeInTheDocument();
    await expect.element(field(view)).not.toBeInTheDocument();
    expect(sets).toEqual([]);
  });
});

describe("the menu of a header", () => {
  it.each([
    ["a beat", "columnheader", "Setup", ["Edit", "Add a scene", "Add a beat before", "Add a beat after", "Delete"]],
    [
      "a scene",
      "columnheader",
      "The last ferry",
      ["Edit", "Add a scene before", "Add a scene after", "Default width", "Delete"],
    ],
    ["a layer", "rowheader", "Characters", ["Edit", "Default height", "Delete"]],
  ] as const)("opens under the second button of a pointer, for %s", async (_, role, name, actions) => {
    const { view } = await mount(story());

    await view.getByRole(role, { name }).click({ button: "right" });

    await expect.element(view.getByRole("menu", { name: `Actions on ${name}` })).toBeVisible();
    await expect.poll(() => names(view.getByRole("menuitem"))).toEqual(actions);
  });

  it("stays closed under the first button, which gives a header the focus", async () => {
    const { mounted, view } = await mount(story());

    for (const [role, name] of [
      ["columnheader", "Setup"],
      ["columnheader", "The last ferry"],
      ["rowheader", "Characters"],
    ] as const) {
      await view.getByRole(role, { name }).getByText(name, { exact: true }).click();

      await expect.poll(() => focused(mounted)).toBe(name);
      await expect.element(view.getByRole("menu")).not.toBeInTheDocument();
      await expect.element(view.getByRole("dialog")).not.toBeInTheDocument();
    }
  });

  // The point a menu opens from is no control. The header itself says it has a menu.
  it("leaves no button for a menu where a screen reader finds one", async () => {
    const { view } = await mount(story());
    await away(view);

    // The buttons the timeline shows at rest add a beat and a layer.
    expect(view.getByRole("button").elements()).toHaveLength(2);
    await expect.element(view.getByRole("columnheader", { name: "Setup" })).toHaveAttribute("aria-haspopup", "menu");
    await expect.element(view.getByRole("rowheader", { name: "Characters" })).toHaveAttribute("aria-haspopup", "menu");
  });
});

describe("the dialog of a beat or a scene", () => {
  const HEADERS = [
    {
      what: "a beat",
      name: "Setup",
      heading: "Edit the beat",
      described: "The ordinary world.",
      read: (content: Content) => content.beats[0]!,
    },
    {
      what: "a scene",
      name: "The last ferry",
      heading: "Edit the scene",
      described: "The harbor, at night.",
      read: (content: Content) => content.beats[0]!.scenes[0]!,
    },
  ];

  const title = (view: Locator) => view.getByRole("textbox", { name: "Title" });
  const description = (view: Locator) => view.getByRole("textbox", { name: "Description" });
  /** Finds the name a header shows. Two clicks there miss the button a beat shows under the pointer. */
  const shown = (view: Locator, name: string) => view.getByRole("columnheader", { name }).getByText(name);

  it.each(HEADERS)(
    "opens for $what on two clicks, from its menu, with Enter and with F2",
    async ({ name, heading, described }) => {
      const { mounted, view } = await mount(story());

      const ways = [
        () => shown(view, name).dblClick(),
        () => choose(view, view.getByRole("columnheader", { name }), "Edit"),
        () => userEvent.keyboard("{Enter}"),
        () => userEvent.keyboard("{F2}"),
      ];

      for (const open of ways) {
        await open();
        await expect.element(view.getByRole("dialog", { name: heading })).toBeVisible();
        await expect.element(title(view)).toHaveValue(name);
        await expect.element(description(view)).toHaveValue(described);
        await expect.poll(() => focused(mounted)).toBe("Title");

        // The header takes the focus back, so a key opens the dialog again.
        await userEvent.keyboard("{Escape}");
        await expect.element(view.getByRole("dialog")).not.toBeInTheDocument();
        await expect.poll(() => focused(mounted)).toBe(name);
      }
    }
  );

  it.each(HEADERS)(
    "saves the title of $what and what describes it in one save, and gives the focus back to its header",
    async ({ name, read }) => {
      const sets: unknown[] = [];
      const { mounted, view, saved } = await mount(story(), { wrap: recording(sets) });

      await shown(view, name).dblClick();
      await submit(view, { Title: " The crossing ", Description: "Mara leaves.\nNobody waves." });

      await expect.element(view.getByRole("dialog")).not.toBeInTheDocument();
      await expect
        .poll(() => read(saved()))
        .toMatchObject({ title: "The crossing", description: "Mara leaves.\nNobody waves." });
      expect(sets).toHaveLength(1);
      await expect.element(view.getByText("Mara leaves. Nobody waves.")).toBeVisible();
      await expect.poll(() => focused(mounted)).toBe("The crossing");
    }
  );

  it.each(HEADERS)("saves nothing on Cancel, on Escape, and for $what left as it was", async ({ name }) => {
    const sets: unknown[] = [];
    const { view } = await mount(story(), { wrap: recording(sets) });

    await shown(view, name).dblClick();
    await title(view).fill("The crossing");
    await view.getByRole("button", { name: "Cancel" }).click();
    await expect.element(view.getByRole("dialog")).not.toBeInTheDocument();

    // A dialog opens on what the header holds, not on what the last one left.
    await shown(view, name).dblClick();
    await expect.element(title(view)).toHaveValue(name);
    await description(view).fill("Mara leaves.");
    await userEvent.keyboard("{Escape}");
    await expect.element(view.getByRole("dialog")).not.toBeInTheDocument();

    await shown(view, name).dblClick();
    await view.getByRole("button", { name: "Save" }).click();
    await expect.element(view.getByRole("dialog")).not.toBeInTheDocument();

    await expect.element(view.getByRole("columnheader", { name })).toBeVisible();
    expect(sets).toEqual([]);
  });

  it("breaks a line of a description on Enter, and saves with Control and Enter", async () => {
    const { mounted, view, saved } = await mount(story());

    await shown(view, "Setup").dblClick();
    await description(view).fill("The ordinary world.");
    await userEvent.keyboard("{Enter}Nothing moves.{Control>}{Enter}{/Control}");

    await expect.poll(() => saved().beats[0]!.description).toBe("The ordinary world.\nNothing moves.");
    expect(saved().beats[0]!.title).toBe("Setup");
    await expect.poll(() => focused(mounted)).toBe("Setup");
  });

  it("opens on an empty title for what has none, under the name of its place", async () => {
    const { view, saved } = await mount(story());

    await choose(view, view.getByRole("columnheader", { name: "Beat 2" }), "Edit");
    await expect.element(title(view)).toHaveValue("");
    await expect.element(title(view)).toHaveAttribute("placeholder", "Beat 2");
    await submit(view, { Description: "Everything is lost." });

    await expect.poll(() => saved().beats[1]).toMatchObject({ title: "", description: "Everything is lost." });
    await expect.element(view.getByText("Everything is lost.")).toBeVisible();
  });

  it("takes a title and a description away once emptied", async () => {
    const { view, saved } = await mount(story());

    await shown(view, "Setup").dblClick();
    await submit(view, { Title: "", Description: "" });

    await expect.poll(() => saved().beats[0]).toMatchObject({ title: "", description: "" });
    await expect.element(view.getByRole("columnheader", { name: "Beat 1" })).toBeVisible();
    await expect.element(view.getByText("The ordinary world.")).not.toBeInTheDocument();
  });
});

describe("the dialog of a layer", () => {
  const dialog = (view: Locator) => view.getByRole("dialog", { name: "Edit the layer" });
  const name = (view: Locator) => view.getByRole("textbox", { name: "Name" });
  const type = (view: Locator) => view.getByRole("textbox", { name: "Type" });

  it("opens on two clicks, from the menu of the layer, with Enter and with F2", async () => {
    const { mounted, view } = await mount(story());
    const header = view.getByRole("rowheader", { name: "Characters" });

    const ways = [
      () => header.dblClick(),
      () => choose(view, header, "Edit"),
      () => userEvent.keyboard("{Enter}"),
      () => userEvent.keyboard("{F2}"),
    ];

    for (const open of ways) {
      await open();
      await expect.element(dialog(view)).toBeVisible();
      await expect.element(name(view)).toHaveValue("Characters");
      await expect.element(type(view)).toHaveValue("");
      await expect.poll(() => focused(mounted)).toBe("Name");

      // The header takes the focus back, so a key opens the dialog again.
      await userEvent.keyboard("{Escape}");
      await expect.element(dialog(view)).not.toBeInTheDocument();
      await expect.poll(() => focused(mounted)).toBe("Characters");
    }
  });

  it("saves the name, type and color of a layer in one save, and gives the focus back to its header", async () => {
    const sets: unknown[] = [];
    const { mounted, view, saved } = await mount(story(), { wrap: recording(sets) });

    await view.getByRole("rowheader", { name: "Scenes" }).dblClick();
    await expect.element(view.getByRole("radio")).toHaveLength(13);
    await expect.element(view.getByRole("radio", { name: "No color" })).toBeChecked();
    await view.getByRole("radio", { name: "Violet" }).click({ force: true });
    await submit(view, { Name: "Plot", Type: "Storyline" });

    await expect.element(dialog(view)).not.toBeInTheDocument();
    await expect
      .poll(() => saved().layers[0])
      .toMatchObject({ name: "Plot", label: "Storyline", color: expect.stringMatching(/^#[0-9a-f]{6}$/) });
    expect(sets).toHaveLength(1);
    await expect.poll(() => focused(mounted)).toBe("Plot");
  });

  it("shows the type of a layer under its name in place of its kind, until the type is emptied", async () => {
    const content = story();
    content.layers[2]!.label = "People";
    const { view, saved } = await mount(content);
    const header = view.getByRole("rowheader", { name: "Characters" });

    await expect.element(header).toHaveTextContent("Characters People");

    await header.dblClick();
    await expect.element(type(view)).toHaveValue("People");
    await submit(view, { Type: "" });

    await expect.poll(() => Object.hasOwn(saved().layers[2]!, "label")).toBe(false);
    await expect.element(header).toHaveTextContent("Characters Notes");
  });

  it("takes any other color, as the browser's own field gives it", async () => {
    const { view, saved } = await mount(story());

    await view.getByRole("rowheader", { name: "Scenes" }).dblClick();
    await view.getByLabelText("Another color").fill("#123456");
    await view.getByRole("button", { name: "Save" }).click();

    await expect.poll(() => saved().layers[0]!.color).toBe("#123456");
  });

  it("takes the color of a layer away, and keeps its name", async () => {
    const { view, saved } = await mount(story());

    await view.getByRole("rowheader", { name: "Characters" }).dblClick();
    await view.getByRole("radio", { name: "No color" }).click({ force: true });
    await view.getByRole("button", { name: "Save" }).click();

    await expect.poll(() => Object.hasOwn(saved().layers[2]!, "color")).toBe(false);
    expect(saved().layers[2]!.name).toBe("Characters");
  });

  it("saves nothing on Cancel, on Escape, and for a layer left as it was", async () => {
    const sets: unknown[] = [];
    const { view } = await mount(story(), { wrap: recording(sets) });
    const header = view.getByRole("rowheader", { name: "Characters" });

    await header.dblClick();
    await name(view).fill("People");
    await view.getByRole("button", { name: "Cancel" }).click();
    await expect.element(dialog(view)).not.toBeInTheDocument();

    // A dialog opens on what the layer holds, not on what the last one left.
    await header.dblClick();
    await expect.element(name(view)).toHaveValue("Characters");
    await type(view).fill("People");
    await userEvent.keyboard("{Escape}");
    await expect.element(dialog(view)).not.toBeInTheDocument();

    await header.dblClick();
    await view.getByRole("button", { name: "Save" }).click();
    await expect.element(dialog(view)).not.toBeInTheDocument();

    await expect.element(header).toBeVisible();
    expect(sets).toEqual([]);
  });
});

describe("creating and deleting", () => {
  it("adds a scene to a beat from its header, and opens its dialog at once", async () => {
    const { mounted, view, saved } = await mount(story());
    const setup = view.getByRole("columnheader", { name: "Setup" });

    await setup.hover();
    await setup.getByRole("button", { name: "Add a scene" }).click();
    await expect.element(view.getByRole("dialog", { name: "Edit the scene" })).toBeVisible();
    await expect.poll(() => focused(mounted)).toBe("Title");
    // Enter in the title saves the dialog, as in any short form.
    await view.getByRole("textbox", { name: "Title" }).fill("The letter");
    await userEvent.keyboard("{Enter}");

    await expect.poll(() => scenes(saved())).toEqual([["The last ferry", "", "The letter"], ["The storm"]]);
    await expect.poll(() => focused(mounted)).toBe("The letter");
  });

  it("adds a scene before and after another, and at the end of its beat, from their menus", async () => {
    const { view, saved } = await mount(story());

    await choose(view, view.getByRole("columnheader", { name: "The last ferry" }), "Add a scene before");
    await submit(view, { Title: "Before" });
    await choose(view, view.getByRole("columnheader", { name: "The last ferry" }), "Add a scene after");
    await submit(view, { Title: "After" });
    await choose(view, view.getByRole("columnheader", { name: "Setup" }), "Add a scene");
    await submit(view, { Title: "Last" });

    await expect
      .poll(() => scenes(saved()))
      .toEqual([["Before", "The last ferry", "After", "", "Last"], ["The storm"]]);
  });

  it("adds a beat before and after another, and at the end of the story", async () => {
    const { view, saved } = await mount(story());

    await choose(view, view.getByRole("columnheader", { name: "Setup" }), "Add a beat before");
    await expect.element(view.getByRole("dialog", { name: "Edit the beat" })).toBeVisible();
    await submit(view, { Title: "Prologue" });
    await choose(view, view.getByRole("columnheader", { name: "Setup" }), "Add a beat after");
    await submit(view, { Title: "Trouble" });
    await view.getByRole("button", { name: "Add a beat" }).click();
    await submit(view, { Title: "Epilogue" });

    await expect
      .poll(() => saved().beats.map((beat) => beat.title))
      .toEqual(["Prologue", "Setup", "Trouble", "", "Epilogue"]);
    // A new beat comes with a scene.
    expect(saved().beats.map((beat) => beat.scenes.length)).toEqual([1, 2, 1, 1, 1]);
  });

  it("adds a layer of a kind under the others, and names it in its dialog", async () => {
    const { view, saved } = await mount(story());

    await view.getByRole("button", { name: "Add a layer" }).click();
    await expect.poll(() => names(view.getByRole("menuitem"))).toEqual(["Logline", "Notes"]);
    await view.getByRole("menuitem", { name: "Notes" }).click();
    await expect.element(view.getByRole("dialog", { name: "Edit the layer" })).toBeVisible();
    // Enter in the name saves the dialog, as in any short form.
    await view.getByRole("textbox", { name: "Name" }).fill("Stakes");
    await userEvent.keyboard("{Enter}");

    await expect.poll(() => saved().layers.at(-1)).toMatchObject({ kind: "notes", name: "Stakes" });
    await expect.element(view.getByRole("dialog")).not.toBeInTheDocument();
    await cell(view, 4, 0).click();
    await write(view, "Her job.", "{Escape}");
    await expect
      .poll(() => saved().beats[0]!.scenes[0]!.cells.at(-1))
      .toMatchObject({ kind: "notes", text: "Her job." });
  });

  it("keeps what was just added when its dialog is cancelled", async () => {
    const { mounted, view, saved } = await mount(story());

    await view.getByRole("button", { name: "Add a beat" }).click();
    await expect.element(view.getByRole("dialog", { name: "Edit the beat" })).toBeVisible();
    await userEvent.keyboard("{Escape}");

    await expect.element(view.getByRole("dialog")).not.toBeInTheDocument();
    await expect.poll(() => focused(mounted)).toBe("Beat 3");
    expect(saved().beats.map((beat) => beat.title)).toEqual(["Setup", "", ""]);
  });

  it("deletes a scene at once, and takes it back", async () => {
    const before = story();
    const { mounted, view, saved } = await mount(before);

    await choose(view, view.getByRole("columnheader", { name: "The last ferry" }), "Delete");

    await expect.element(view.getByText("You deleted the scene “The last ferry”.")).toBeVisible();
    expect(scenes(saved())).toEqual([[""], ["The storm"]]);
    // The focus goes to the scene that takes its place.
    await expect.poll(() => focused(mounted)).toBe("Scene 1");

    await view.getByRole("button", { name: "Undo" }).click();

    await expect.element(view.getByText(/You deleted/)).not.toBeInTheDocument();
    await expect.poll(saved).toEqual(before);
  });

  it("deletes a layer with what every scene holds for it, and takes it back", async () => {
    const before = story();
    const { view, saved } = await mount(before);

    await choose(view, view.getByRole("rowheader", { name: "Characters" }), "Delete");

    await expect.element(view.getByText("You deleted the layer “Characters”.")).toBeVisible();
    expect(saved().layers.map((layer) => layer.name)).toEqual(["Scenes", "Enriched scenes", ""]);
    expect(saved().beats[0]!.scenes[0]!.cells.map((held) => held.kind)).toEqual(["logline", "script"]);

    await view.getByRole("button", { name: "Undo" }).click();

    await expect.poll(saved).toEqual(before);
  });

  it("deletes a beat with its scenes, and forgets it at the next edit", async () => {
    const { view, saved } = await mount(story());

    await choose(view, view.getByRole("columnheader", { name: "Setup" }), "Delete");

    await expect.element(view.getByText("You deleted the beat “Setup”.")).toBeVisible();
    expect(scenes(saved())).toEqual([["The storm"]]);

    await view.getByRole("columnheader", { name: "The storm" }).dblClick();
    await submit(view, { Title: "The flood" });

    await expect.element(view.getByText(/You deleted/)).not.toBeInTheDocument();
    await expect.poll(() => scenes(saved())).toEqual([["The flood"]]);
  });

  it("keeps the column of a beat without a scene, which offers the first one", async () => {
    const { view, saved } = await mount(story());

    await choose(view, view.getByRole("columnheader", { name: "The storm" }), "Delete");
    await expect.element(view.getByRole("columnheader", { name: "Beat 2" })).toBeVisible();
    await view.getByRole("row").nth(1).getByRole("button", { name: "Add a scene" }).click();
    await submit(view, { Title: "The flood" });

    await expect.poll(() => scenes(saved())).toEqual([["The last ferry", ""], ["The flood"]]);
  });

  it("keeps a layer: the last one cannot be deleted", async () => {
    const { view, saved } = await mount(story());

    for (const name of ["Links", "Characters", "Enriched scenes"]) {
      await choose(view, view.getByRole("rowheader", { name }), "Delete");
    }
    await expect.poll(() => saved().layers.map((layer) => layer.name)).toEqual(["Scenes"]);

    await view.getByRole("rowheader", { name: "Scenes" }).click({ button: "right" });

    await expect.element(view.getByRole("menuitem", { name: "Delete" })).toBeDisabled();
    await expect.element(view.getByRole("menuitem", { name: "Edit" })).toBeEnabled();
  });
});

describe("sizes", () => {
  /** The story, with a column and a track a writer stretched. */
  function stretched(): Content {
    const content = story();
    content.beats[0]!.scenes[0]!.width = 72;
    content.layers[2]!.height = 40;

    return content;
  }

  const ferry = (view: Locator) => view.getByRole("columnheader", { name: "The last ferry" });
  const characters = (view: Locator) => view.getByRole("rowheader", { name: "Characters" });
  const width = (content: Content) => content.beats[0]!.scenes[0]!.width;

  it("gives a column the width its scene keeps, and a track the height its layer keeps", async () => {
    const { view } = await mount(stretched());

    await expect.poll(() => box(ferry(view)).width).toBeCloseTo(72 * quarter(), 0);
    expect(box(view.getByRole("columnheader", { name: "Scene 2" })).width).toBeCloseTo(DEFAULT_WIDTH * quarter(), 0);
    expect(box(characters(view)).height).toBeCloseTo(40 * quarter(), 0);
  });

  it("keeps a track as tall as what it holds, whatever height its layer keeps", async () => {
    const short = story();
    short.layers[2]!.height = LIMITS.height[0];
    const { view } = await mount(short);

    await expect.element(cell(view, 2, 0)).toHaveTextContent("Mara, the keeper.");
    expect(box(characters(view)).height).toBeGreaterThan(LIMITS.height[0] * quarter());
    expect(box(cell(view, 2, 0)).height).toBe(box(characters(view)).height);
  });

  it("stretches a column and a track with Alt and an arrow, within their limits", async () => {
    const { mounted, view, saved } = await mount(story());

    await userEvent.tab();
    await userEvent.keyboard("{ArrowDown}{Alt>}{ArrowRight}{/Alt}");
    await expect.poll(() => width(saved())).toBe(DEFAULT_WIDTH + 8);
    expect(focused(mounted)).toBe("The last ferry");

    // Four steps back would pass the least width.
    await userEvent.keyboard("{Alt>}{ArrowLeft}{ArrowLeft}{ArrowLeft}{ArrowLeft}{/Alt}");
    await expect.poll(() => width(saved())).toBe(LIMITS.width[0]);

    // A track grows from the height it shows.
    await userEvent.keyboard("{ArrowDown}{ArrowLeft}");
    const header = view.getByRole("rowheader", { name: "Scenes" });
    const shown = Math.round(box(header).height / quarter());
    await userEvent.keyboard("{Alt>}{ArrowDown}{/Alt}");

    await expect.poll(() => saved().layers[0]!.height).toBe(shown + 8);
    await expect.poll(() => box(header).height).toBeCloseTo((shown + 8) * quarter(), 0);
    expect(focused(mounted)).toBe("Scenes");
  });

  it("gives the default size back from the menu of a scene and of a layer that keep one", async () => {
    const { view, saved } = await mount(stretched());

    await choose(view, ferry(view), "Default width");
    await expect.poll(() => Object.hasOwn(saved().beats[0]!.scenes[0]!, "width")).toBe(false);
    await ferry(view).click({ button: "right" });
    await expect.element(view.getByRole("menuitem", { name: "Default width" })).toBeDisabled();
    await userEvent.keyboard("{Escape}");

    await choose(view, characters(view), "Default height");
    await expect.poll(() => Object.hasOwn(saved().layers[2]!, "height")).toBe(false);
    await characters(view).click({ button: "right" });
    await expect.element(view.getByRole("menuitem", { name: "Default height" })).toBeDisabled();
  });

  it("stretches a column and a track under the pointer, and two clicks on a grip give the default back", async () => {
    const { view, saved } = await mount(stretched());
    await expect.poll(() => box(ferry(view)).width).toBeCloseTo(72 * quarter(), 0);

    // A grip ends its header. The pointer takes it there, and lets go 16 quarters before.
    const column = box(ferry(view));
    const end = { x: column.width - 3, y: column.height / 2 };
    await userEvent.dragAndDrop(ferry(view), ferry(view), {
      sourcePosition: end,
      targetPosition: { ...end, x: end.x - 16 * quarter() },
    });
    await expect.poll(() => width(saved())).toBe(72 - 16);

    const track = box(characters(view));
    const foot = { x: track.width / 2, y: track.height - 3 };
    await userEvent.dragAndDrop(characters(view), characters(view), {
      sourcePosition: foot,
      targetPosition: { ...foot, y: foot.y - 10 * quarter() },
    });
    await expect.poll(() => saved().layers[2]!.height).toBe(40 - 10);

    await ferry(view).dblClick({ position: { x: box(ferry(view)).width - 3, y: column.height / 2 } });
    await expect.poll(() => Object.hasOwn(saved().beats[0]!.scenes[0]!, "width")).toBe(false);
    await characters(view).dblClick({ position: { x: track.width / 2, y: box(characters(view)).height - 3 } });
    await expect.poll(() => Object.hasOwn(saved().layers[2]!, "height")).toBe(false);
    await expect.element(view.getByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("the keyboard", () => {
  it("reaches the timeline through one header, and moves across headers and cards with the arrows", async () => {
    const { mounted } = await mount(story());
    const press = async (key: string) => (await userEvent.keyboard(`{${key}}`), focused(mounted));

    await userEvent.tab();
    expect(focused(mounted)).toBe("Setup");

    expect(await press("ArrowDown")).toBe("The last ferry");
    expect(await press("ArrowRight")).toBe("Scene 2");
    expect(await press("ArrowDown")).toBe("");
    expect(await press("ArrowLeft")).toBe("Mara waits for a passenger.");
    expect(await press("ArrowLeft")).toBe("Scenes");
    expect(await press("ArrowDown")).toBe("Enriched scenes");
    expect(await press("End")).toContain("Dawn.");
    expect(await press("Home")).toBe("Enriched scenes");

    // A beat stands over each of its scenes: the way down leads back to the column it was reached from.
    await userEvent.keyboard("{ArrowUp}{ArrowRight}{ArrowRight}{ArrowUp}");
    expect(focused(mounted)).toBe("Scene 2");
    expect(await press("ArrowUp")).toBe("Setup");
    expect(await press("ArrowDown")).toBe("Scene 2");
    await userEvent.keyboard("{ArrowUp}");
    expect(await press("ArrowRight")).toBe("Beat 2");
    expect(await press("End")).toBe("Add a beat");

    // The Tab key leaves the timeline for what follows it, and comes back to where the focus was.
    const after = document.body.appendChild(document.createElement("button"));
    onTestFinished(() => after.remove());
    await userEvent.tab();
    expect(document.activeElement).toBe(after);
    await userEvent.tab({ shift: true });
    expect(focused(mounted)).toBe("Add a beat");
  });

  it.each(["{ContextMenu}", "{Shift>}{F10}{/Shift}"])("opens the menu of the header in focus with %s", async (keys) => {
    const { mounted, view, saved } = await mount(story());

    await userEvent.tab();
    await userEvent.keyboard(`{ArrowDown}${keys}`);
    await expect.element(view.getByRole("menu", { name: "Actions on The last ferry" })).toBeVisible();
    await expect.poll(() => focused(mounted)).toBe("Edit");

    // Escape gives the focus back to the header, from where the arrows still move.
    await userEvent.keyboard("{Escape}");
    await expect.element(view.getByRole("menu")).not.toBeInTheDocument();
    await expect.poll(() => focused(mounted)).toBe("The last ferry");
    await userEvent.keyboard(`{ArrowRight}${keys}{ArrowDown}{ArrowDown}{Enter}`);
    await submit(view, { Title: "The letter" });

    await expect.poll(() => scenes(saved())).toEqual([["The last ferry", "", "The letter"], ["The storm"]]);
  });

  it("shows the one button of a beat with the focus, as under the pointer", async () => {
    const { view } = await mount(story());
    const setup = view.getByRole("columnheader", { name: "Setup" });

    await away(view);
    await expect.element(setup.getByRole("button")).not.toBeInTheDocument();

    await setup.hover();
    await expect.element(setup.getByRole("button", { name: "Add a scene" })).toBeVisible();
    await expect.element(setup.getByRole("button")).toHaveLength(1);

    await away(view);
    await expect.element(setup.getByRole("button")).not.toBeInTheDocument();

    await userEvent.tab();
    await expect.element(setup.getByRole("button", { name: "Add a scene" })).toBeVisible();

    // A scene shows none: its menu holds everything.
    await userEvent.keyboard("{ArrowDown}");
    await expect.element(setup.getByRole("button")).not.toBeInTheDocument();
    await expect
      .element(view.getByRole("columnheader", { name: "The last ferry" }).getByRole("button"))
      .not.toBeInTheDocument();
  });
});

describe("history", () => {
  const width = (content: Content, scene: number) => content.beats[0]!.scenes[scene]!.width;
  const STEP = "{Alt>}{ArrowRight}{/Alt}";

  it.each([
    [UNDO, REDO],
    ["{Meta>}z{/Meta}", "{Control>}{Shift>}z{/Shift}{/Control}"],
  ])("takes the edits of a writer back with %s, one at a time, and gives them again with %s", async (undo, redo) => {
    const before = story();
    const { mounted, view, saved } = await mount(before);

    await view.getByRole("columnheader", { name: "The storm" }).dblClick();
    await submit(view, { Title: "The flood" });
    await cell(view, 0, 1).click();
    await write(view, "A letter arrives.");
    await expect.poll(() => focused(mounted)).toBe("A letter arrives.");
    const after = saved();

    await userEvent.keyboard(undo);
    await expect.poll(() => saved().beats[0]!.scenes[1]!.cells).toEqual([]);
    expect(scenes(saved())).toEqual([["The last ferry", ""], ["The flood"]]);
    await userEvent.keyboard(undo);
    await expect.poll(saved).toEqual(before);

    await userEvent.keyboard(redo);
    await expect.poll(() => scenes(saved())).toEqual([["The last ferry", ""], ["The flood"]]);
    expect(saved().beats[0]!.scenes[1]!.cells).toEqual([]);
    await userEvent.keyboard(redo);
    await expect.poll(saved).toEqual(after);
  });

  it("has nothing to take back before the first edit, and nothing to give again after the last", async () => {
    const sets: unknown[] = [];
    const { mounted, view } = await mount(story(), { wrap: recording(sets) });

    await view.getByRole("rowheader", { name: "Scenes" }).click();
    await expect.poll(() => focused(mounted)).toBe("Scenes");
    await userEvent.keyboard(UNDO + REDO);
    expect(sets).toEqual([]);

    await userEvent.keyboard(`{Alt>}{ArrowDown}{/Alt}${REDO}${UNDO}${UNDO}`);

    // The edit, and the one undo that had something to take back.
    await expect.poll(() => sets).toHaveLength(2);
    expect(sets[1]).toEqual(story());
  });

  it("goes back to the structure a story started from, never to the choice of one", async () => {
    const { mounted, view, saved } = await mount();

    await view.getByRole("button", { name: "Blank" }).click();
    await view.getByRole("columnheader", { name: "Scene 1" }).dblClick();
    await submit(view, { Title: "The last ferry" });
    await expect.poll(() => focused(mounted)).toBe("The last ferry");

    await userEvent.keyboard(UNDO + UNDO);

    await expect.element(view.getByRole("columnheader", { name: "Scene 1" })).toBeVisible();
    await expect.element(view.getByRole("heading")).not.toBeInTheDocument();
    expect(saved().beats).toHaveLength(1);
  });

  it("gives nothing again once a writer has made another edit", async () => {
    const { mounted, view, saved } = await mount(story());

    await view.getByRole("columnheader", { name: "The storm" }).dblClick();
    await submit(view, { Title: "The flood" });
    await expect.poll(() => focused(mounted)).toBe("The flood");
    await userEvent.keyboard(UNDO);
    await expect.poll(() => focused(mounted)).toBe("The storm");

    await userEvent.keyboard(`{Enter}`);
    await submit(view, { Title: "The tide" });
    await expect.poll(() => focused(mounted)).toBe("The tide");
    await userEvent.keyboard(REDO);

    await expect.element(view.getByRole("columnheader", { name: "The tide" })).toBeVisible();
    expect(scenes(saved())).toEqual([["The last ferry", ""], ["The tide"]]);
  });

  it("takes a deletion back with the keys, as the button of its message does, and gives it again", async () => {
    const before = story();
    const { mounted, view, saved } = await mount(before);

    await select(cell(view, 0, 0));
    await userEvent.keyboard("{Delete}");
    await expect.element(view.getByText(/You deleted/)).toBeVisible();
    await userEvent.keyboard(UNDO);

    await expect.element(view.getByText(/You deleted/)).not.toBeInTheDocument();
    await expect.poll(saved).toEqual(before);

    // The button of the message is the same undo: redo gives its deletion again, and tells nothing.
    await userEvent.keyboard("{Delete}");
    await view.getByRole("button", { name: "Undo" }).click();
    await expect.poll(saved).toEqual(before);
    await view.getByRole("rowheader", { name: "Scenes" }).click();
    await expect.poll(() => focused(mounted)).toBe("Scenes");
    await userEvent.keyboard(REDO);

    await expect.poll(() => saved().beats[0]!.scenes[0]!.cells.map((held) => held.kind)).toEqual(["script", "notes"]);
    await expect.element(view.getByText(/You deleted/)).not.toBeInTheDocument();
  });

  // The button of a message leaves with it. The timeline takes the focus it held, so a key goes on
  // from there without a click.
  it("keeps the focus in the composer once the button of a message took a deletion back", async () => {
    const { mounted, view, saved } = await mount(story());

    await choose(view, view.getByRole("columnheader", { name: "The last ferry" }), "Delete");
    await view.getByRole("button", { name: "Undo" }).click();
    await expect.element(view.getByText(/You deleted/)).not.toBeInTheDocument();

    await expect.poll(() => focused(mounted)).toBeDefined();
    await userEvent.keyboard("{Control>}y{/Control}");
    await expect.poll(() => scenes(saved())).toEqual([[""], ["The storm"]]);
  });

  it("takes the typing of a card back a word at a time, then ends the edit and undoes the edit before it", async () => {
    const before = story();
    const { view, saved } = await mount(before);

    await cell(view, 0, 1).click();
    await write(view, "A letter arrives.");
    await expect.poll(() => saved().beats[0]!.scenes[1]!.cells).toHaveLength(1);

    await cell(view, 2, 1).click();
    await userEvent.keyboard("Night falls");
    await userEvent.keyboard(UNDO);
    await expect.element(field(view)).toHaveValue("Night");
    await userEvent.keyboard(REDO);
    await expect.element(field(view)).toHaveValue("Night falls");
    await userEvent.keyboard(UNDO + UNDO);
    await expect.element(field(view)).toHaveValue("");

    // Nothing of this edit is left to take back: one more ends it, and takes the first card away.
    await userEvent.keyboard(UNDO);

    await expect.element(field(view)).not.toBeInTheDocument();
    await expect.poll(saved).toEqual(before);
  });

  it("leaves undo to the browser in the fields of a dialog", async () => {
    const before = story();
    const { mounted, view, saved } = await mount(before);

    await select(cell(view, 0, 0));
    await userEvent.keyboard("{Delete}");
    await expect.poll(() => saved().beats[0]!.scenes[0]!.cells).toHaveLength(2);

    await view.getByRole("columnheader", { name: "The storm" }).dblClick();
    await expect.poll(() => focused(mounted)).toBe("Title");
    await userEvent.keyboard("{End}!");
    await expect.element(view.getByRole("textbox", { name: "Title" })).toHaveValue("The storm!");
    await userEvent.keyboard(UNDO);

    // The field takes its own typing back, and the deletion stays until the dialog is gone.
    await expect.element(view.getByRole("textbox", { name: "Title" })).toHaveValue("The storm");
    expect(saved().beats[0]!.scenes[0]!.cells).toHaveLength(2);

    await userEvent.keyboard("{Escape}");
    await expect.poll(() => focused(mounted)).toBe("The storm");
    await userEvent.keyboard(UNDO);
    await expect.poll(saved).toEqual(before);
  });

  it("counts the sizes one item takes within a second as one edit", async () => {
    // The clock of the composer stands still, and moves by hand.
    const start = Date.now();
    const clock = vi.spyOn(Date, "now").mockReturnValue(start);
    onTestFinished(() => clock.mockRestore());
    const { mounted, saved } = await mount(story());

    await userEvent.tab();
    await userEvent.keyboard(`{ArrowDown}${STEP}${STEP}`);
    clock.mockReturnValue(start + 1000);
    await userEvent.keyboard(`${STEP}{ArrowRight}${STEP}`);
    await expect.poll(() => width(saved(), 1)).toBe(DEFAULT_WIDTH + 8);
    expect(width(saved(), 0)).toBe(DEFAULT_WIDTH + 24);
    expect(focused(mounted)).toBe("Scene 2");

    // The size of another scene, the size given a second later, then the two sizes given in a row.
    await userEvent.keyboard(UNDO);
    await expect.poll(() => width(saved(), 1)).toBeUndefined();
    await userEvent.keyboard(UNDO);
    await expect.poll(() => width(saved(), 0)).toBe(DEFAULT_WIDTH + 16);
    await userEvent.keyboard(UNDO);
    await expect.poll(saved).toEqual(story());
  });

  it("keeps no entry for a size already at its limit, and saves nothing for it", async () => {
    const widest = story();
    widest.beats[0]!.scenes[0]!.width = LIMITS.width[1];
    const sets: unknown[] = [];
    const { mounted, view, saved } = await mount(widest, { wrap: recording(sets) });

    await view.getByRole("columnheader", { name: "The last ferry" }).click();
    await expect.poll(() => focused(mounted)).toBe("The last ferry");
    await userEvent.keyboard(`${STEP}${STEP}`);
    expect(sets).toEqual([]);

    // One real edit, then two undos: the second finds nothing, where a step at the limit would
    // have left an entry that takes nothing back.
    await userEvent.keyboard(`{Alt>}{ArrowLeft}{/Alt}${UNDO}${UNDO}`);

    await expect.poll(() => sets).toHaveLength(2);
    expect(saved()).toEqual(widest);
  });

  it("keeps the last hundred edits, and goes back no further", async () => {
    const { saved } = await mount(story());
    const widths = () => [width(saved(), 0), width(saved(), 1)];

    // 101 edits: a step for the first scene, then a hundred on each scene in turn, wider and
    // narrower by turns. Steps in a row on one scene would count as one edit, and a step past a
    // limit as none.
    const NARROWER = "{Alt>}{ArrowLeft}{/Alt}";
    const turns = Array.from({ length: 50 }, (_, turn) => (turn % 2 === 0 ? STEP : NARROWER))
      .map((step) => `{ArrowRight}${step}{ArrowLeft}${step}`)
      .join("");
    await userEvent.tab();
    await userEvent.keyboard(`{ArrowDown}${STEP}${turns}`);
    await expect.poll(widths).toEqual([DEFAULT_WIDTH + 8, DEFAULT_WIDTH]);

    await userEvent.keyboard(`{Control>}${"z".repeat(101)}{/Control}`);

    // A hundred edits come back. The first one, made before them, stays.
    await expect.poll(widths).toEqual([DEFAULT_WIDTH + 8, undefined]);
  });
});

describe("saving through the host", () => {
  it("saves one content at a time, and the last save holds every edit", async () => {
    const sets: Content[] = [];
    let release = () => {};
    const wrap = (host: Host): Host => ({
      ...host,
      content: {
        get: host.content.get,
        async set(next) {
          sets.push(next as Content);
          await new Promise<void>((done) => (release = done));
          await host.content.set(next);
        },
      },
    });
    const { view, saved } = await mount(story(), { wrap });

    await cell(view, 0, 1).click();
    await write(view, "First.", "{Tab}");
    await write(view, "Second.", "{Escape}");

    // The host still holds the first save: the second edit waits for its answer.
    expect(sets).toHaveLength(1);
    release();
    await expect.poll(() => sets).toHaveLength(2);
    release();

    await expect
      .poll(() => saved().beats[1]!.scenes[0]!.cells)
      .toContainEqual(expect.objectContaining({ text: "Second." }));
    expect(saved().beats[0]!.scenes[1]!.cells).toContainEqual(expect.objectContaining({ text: "First." }));
    expect(sets).toHaveLength(2);
  });

  it.each([
    ["en", "We could not save your last changes.", "Try again"],
    ["fr", "Nous n'avons pas pu enregistrer vos dernières modifications.", "Réessayer"],
  ] as const)(
    "tells when the host refuses a save, keeps the edit, and saves it again, in %s",
    async (locale, message, retry) => {
      let refuses = true;
      const wrap = (host: Host): Host => ({
        ...host,
        content: {
          get: host.content.get,
          set: (next) => (refuses ? Promise.reject(new Error("The host is away.")) : host.content.set(next)),
        },
      });
      const before = story();
      const { view, saved } = await mount(before, { locale, wrap });

      await cell(view, 0, 1).click();
      await write(view, "A letter arrives.", "{Escape}");

      await expect.element(view.getByText(message)).toBeVisible();
      await expect.element(cell(view, 0, 1)).toHaveTextContent("A letter arrives.");
      expect(saved()).toEqual(before);

      refuses = false;
      await view.getByRole("button", { name: retry }).click();

      await expect.element(view.getByText(message)).not.toBeInTheDocument();
      expect(saved().beats[0]!.scenes[1]!.cells).toHaveLength(1);
    }
  );

  it("tells when the host cannot give the content, and asks for it again", async () => {
    let away = true;
    const wrap = (host: Host): Host => ({
      ...host,
      content: {
        get: () => (away ? Promise.reject(new Error("The host is away.")) : host.content.get()),
        set: host.content.set,
      },
    });
    const { view } = await mount(story(), { wrap });

    await expect.element(view.getByText("We could not load this composer.")).toBeVisible();
    await expect.element(view.getByRole("grid")).not.toBeInTheDocument();

    away = false;
    await view.getByRole("button", { name: "Try again" }).click();

    await expect.element(view.getByRole("grid")).toBeVisible();
    await expect.element(view.getByText("We could not load this composer.")).not.toBeInTheDocument();
  });
});

describe("in French", () => {
  it("names its actions and tells a deletion in the language of the host", async () => {
    const { view } = await mount(story(), { locale: "fr" });

    await expect.element(view.getByRole("columnheader", { name: "Temps fort 2" })).toBeVisible();
    await expect.element(view.getByRole("rowheader", { name: "Liens" })).toBeVisible();
    await expect.element(cell(view, 1, 0)).toHaveTextContent("Rain fell on the harbor. Mara: You came. 7 mots");

    await view.getByRole("columnheader", { name: "The last ferry" }).click({ button: "right" });
    await expect.element(view.getByRole("menu", { name: "Actions sur The last ferry" })).toBeVisible();
    await expect
      .poll(() => names(view.getByRole("menuitem")))
      .toEqual(["Modifier", "Ajouter une scène avant", "Ajouter une scène après", "Largeur par défaut", "Supprimer"]);
    await view.getByRole("menuitem", { name: "Supprimer" }).click();

    await expect.element(view.getByText("Vous avez supprimé la scène « The last ferry ».")).toBeVisible();
    await expect.element(view.getByRole("button", { name: "Annuler" })).toBeVisible();
  });

  it("names the menu of a card, and tells what its deletion took", async () => {
    const { view } = await mount(story(), { locale: "fr" });

    await cell(view, 2, 0).click({ button: "right" });
    await expect.element(view.getByRole("menu", { name: "Actions sur cette carte" })).toBeVisible();
    await expect.element(view.getByRole("menuitem", { name: "Modifier" })).toBeVisible();
    await view.getByRole("menuitem", { name: "Supprimer" }).click();

    await expect
      .element(view.getByText("Vous avez supprimé le contenu de « Characters » pour « The last ferry »."))
      .toBeVisible();
  });

  it.each([
    ["a beat", "Setup", "Modifier le temps fort"],
    ["a scene", "The last ferry", "Modifier la scène"],
  ])("names the dialog of %s and its fields", async (_, name, heading) => {
    const { view } = await mount(story(), { locale: "fr" });

    await view.getByRole("columnheader", { name }).getByText(name).dblClick();

    await expect.element(view.getByRole("dialog", { name: heading })).toBeVisible();
    await expect.element(view.getByRole("textbox", { name: "Titre" })).toHaveValue(name);
    await expect.element(view.getByRole("textbox", { name: "Description" })).toBeVisible();
    await expect.element(view.getByRole("button", { name: "Annuler" })).toBeVisible();
    await expect.element(view.getByRole("button", { name: "Enregistrer" })).toBeVisible();
  });

  it("names the dialog of a layer, its fields and its colors", async () => {
    const { view } = await mount(story(), { locale: "fr" });

    await view.getByRole("rowheader", { name: "Characters" }).dblClick();

    await expect.element(view.getByRole("dialog", { name: "Modifier le calque" })).toBeVisible();
    await expect.element(view.getByRole("textbox", { name: "Nom" })).toHaveValue("Characters");
    await expect.element(view.getByRole("textbox", { name: "Type" })).toHaveValue("");
    await expect.element(view.getByRole("group", { name: "Couleur" })).toBeVisible();
    await expect.element(view.getByRole("radio", { name: "Aucune couleur" })).toBeInTheDocument();
    await expect.element(view.getByRole("radio", { name: "Bleu ciel" })).toBeInTheDocument();
    await expect.element(view.getByLabelText("Autre couleur")).toBeInTheDocument();
    await expect.element(view.getByRole("button", { name: "Annuler" })).toBeVisible();
    await expect.element(view.getByRole("button", { name: "Enregistrer" })).toBeVisible();
  });

  it("names what a narrow box adds: its buttons, and what a dialog offers there", async () => {
    const { view } = await mount(story(), { locale: "fr", narrow: true });

    await expect.element(view.getByRole("button", { name: "Scène précédente" })).toBeVisible();
    await expect.element(view.getByRole("button", { name: "Scène suivante" })).toBeVisible();
    await expect.element(view.getByRole("button", { name: "Noms des calques" })).toBeVisible();

    await view.getByRole("columnheader", { name: "The last ferry" }).click();

    const dialog = view.getByRole("dialog", { name: "Modifier la scène" });
    await expect.element(dialog).toBeVisible();
    await expect
      .poll(() => names(dialog.getByRole("button")))
      .toEqual(["Ajouter une scène avant", "Ajouter une scène après", "Supprimer", "Annuler", "Enregistrer"]);
  });
});

describe("a large story", () => {
  it("shows 200 scenes under 10 layers, fills the box of its host and scrolls inside it", async () => {
    const start = performance.now();
    const { mounted, view } = await mount(largeContent());
    await expect.element(view.getByRole("grid")).toBeVisible();
    // A laptop mounts it in a tenth of a second: the bound only catches a cost that grows with the square.
    expect(performance.now() - start).toBeLessThan(5000);

    // Twenty beats and two hundred scenes. Each track keeps a place per scene, two rows end with an
    // action, and the row of the scenes holds the buttons of a narrow box.
    expect(mounted.target.querySelectorAll("[role=columnheader]")).toHaveLength(220);
    expect(mounted.target.querySelectorAll("[role=rowheader]")).toHaveLength(10);
    expect(mounted.target.querySelectorAll("[role=gridcell]")).toHaveLength(2003);

    const edges = mounted.target.getBoundingClientRect();
    expect(scroller(view).getBoundingClientRect().bottom).toBeLessThanOrEqual(edges.bottom);
    expect(scroller(view).scrollWidth).toBeGreaterThan(scroller(view).clientWidth * 10);
    expect(document.documentElement.scrollHeight).toBe(window.innerHeight);

    // The headers stay in view while the grid scrolls both ways.
    scroller(view).scrollTo(4000, 200);
    const edge = scroller(view).getBoundingClientRect();
    await expect.poll(() => box(view.getByRole("rowheader").first()).left).toBeCloseTo(edge.left, 0);
    expect(box(view.getByRole("row").first()).top).toBeCloseTo(edge.top, 0);
  });

  it("edits a card of a large story", async () => {
    const { view, saved } = await mount(largeContent());
    const written = view.getByRole("row").nth(5).getByRole("gridcell").nth(1);

    await written.click();
    await write(view, "A new note.", "{Escape}");

    await expect
      .poll(() => saved().beats[0]!.scenes[1]!.cells)
      .toContainEqual(expect.objectContaining({ kind: "notes", text: "A new note." }));
    await expect.element(written).toHaveTextContent("A new note.");
  });
});

describe("a narrow box", () => {
  /** Mounts a content in the page of a phone. */
  const phone = (content = story()) => mount(content, { narrow: true });

  const previous = (view: Locator) => view.getByRole("button", { name: "Previous scene" });
  const next = (view: Locator) => view.getByRole("button", { name: "Next scene" });
  const header = (view: Locator, name: string) => view.getByRole("columnheader", { name });

  /** Takes a finger across the timeline from the middle of a place, and lifts it. */
  function swipe(from: Locator, across: number, down = 0) {
    const { left, top, width, height } = box(from);
    const [clientX, clientY] = [left + width / 2, top + height / 2];
    const finger = { pointerType: "touch", bubbles: true, composed: true };
    const lifted = { ...finger, clientX: clientX + across, clientY: clientY + down };

    from.element().dispatchEvent(new PointerEvent("pointerdown", { ...finger, clientX, clientY }));
    from.element().dispatchEvent(new PointerEvent("pointerup", lifted));
  }

  it("shows one scene at a time at the width of the box, whatever size a writer gave it", async () => {
    const content = story();
    content.beats[0]!.scenes[0]!.width = LIMITS.width[1];
    content.layers[2]!.height = LIMITS.height[1];
    const { view } = await phone(content);

    // The beat of the scene, and the scene.
    await expect.element(header(view, "The last ferry")).toBeVisible();
    await expect.element(header(view, "Setup")).toBeVisible();
    await expect.element(view.getByRole("columnheader")).toHaveLength(2);
    await expect.element(view.getByText("The harbor, at night.")).toBeVisible();
    // Each track keeps the one place of that scene.
    await expect.element(view.getByRole("row").nth(2).getByRole("gridcell")).toHaveLength(1);
    await expect.element(cell(view, 2, 0)).toHaveTextContent("Mara, the keeper.");

    const { scrollWidth, clientWidth } = scroller(view);
    expect(scrollWidth).toBe(clientWidth);
    expect(box(cell(view, 2, 0)).width).toBeCloseTo(clientWidth, 0);
    expect(box(cell(view, 2, 0)).height).toBeLessThan(LIMITS.height[1] * quarter());
  });

  it("follows the width of its own box, whatever the page", async () => {
    const { mounted, view } = await mount(story());
    await expect.element(header(view, "Scene 2")).toBeVisible();
    await expect.element(next(view)).not.toBeInTheDocument();

    // A host narrows the box it gives the plugin, on a wide page.
    mounted.target.style.inlineSize = "40rem";

    await expect.element(next(view)).toBeVisible();
    await expect.element(header(view, "Scene 2")).not.toBeInTheDocument();
    await expect.element(header(view, "The last ferry")).toBeVisible();
  });

  it("moves from scene to scene with its buttons, up to the ends of the story", async () => {
    const { view } = await phone();

    await expect.element(header(view, "The last ferry")).toBeVisible();
    await expect.element(previous(view)).toBeDisabled();

    await next(view).click();
    await expect.element(header(view, "Scene 2")).toBeVisible();
    await expect.element(header(view, "Setup")).toBeVisible();
    await expect.element(header(view, "The last ferry")).not.toBeInTheDocument();

    await next(view).click();
    await expect.element(header(view, "The storm")).toBeVisible();
    await expect.element(header(view, "Beat 2")).toBeVisible();
    await expect.element(cell(view, 1, 0)).toHaveTextContent("Dawn. 1 word");
    await expect.element(next(view)).toBeDisabled();

    await previous(view).click();
    await expect.element(header(view, "Scene 2")).toBeVisible();
  });

  it("moves from scene to scene on a swipe", async () => {
    const { view } = await phone();
    await expect.element(header(view, "The last ferry")).toBeVisible();

    swipe(cell(view, 0, 0), -100);
    await expect.element(header(view, "Scene 2")).toBeVisible();

    swipe(cell(view, 0, 0), 100);
    await expect.element(header(view, "The last ferry")).toBeVisible();
  });

  it("takes a finger that goes down, or not far across, for no swipe", async () => {
    const { view } = await phone();
    await expect.element(header(view, "The last ferry")).toBeVisible();

    // Under 48 pixels across, then less than twice as far across as down. One swipe follows: it
    // shows the second scene, where three would have shown the third.
    swipe(cell(view, 0, 0), -40);
    swipe(cell(view, 0, 0), -100, 60);
    swipe(cell(view, 0, 0), -100, 40);

    await expect.element(header(view, "Scene 2")).toBeVisible();
  });

  it("opens a card in a dialog on a tap, with what else a writer can do, and edits nothing in place", async () => {
    const { view, saved } = await phone();

    await cell(view, 0, 0).click();
    const dialog = view.getByRole("dialog", { name: "Scenes, The last ferry" });
    await expect.element(dialog.getByRole("textbox")).toHaveValue("Mara waits for a passenger.");
    await expect.poll(() => names(dialog.getByRole("button"))).toEqual(["Delete", "Cancel", "Save"]);
    await expect.element(field(view)).not.toBeInTheDocument();

    await dialog.getByRole("textbox").fill("Mara waits alone.");
    await userEvent.keyboard("{Enter}");

    await expect.element(dialog).not.toBeInTheDocument();
    await expect.element(cell(view, 0, 0)).toHaveTextContent("Mara waits alone.");
    expect(saved().beats[0]!.scenes[0]!.cells).toContainEqual(expect.objectContaining({ text: "Mara waits alone." }));
  });

  it("writes a card from the dialog of a place without one, over the lines of its notes", async () => {
    const { view, saved } = await phone();

    await next(view).click();
    await cell(view, 2, 0).click();
    const dialog = view.getByRole("dialog", { name: "Characters, Scene 2" });
    await expect.element(dialog.getByRole("textbox")).toHaveValue("");
    await userEvent.keyboard("Night.{Enter}Rain.{Control>}{Enter}{/Control}");

    await expect.element(dialog).not.toBeInTheDocument();
    expect(saved().beats[0]!.scenes[1]!.cells).toEqual([
      { kind: "notes", layer: saved().layers[2]!.id, text: "Night.\nRain." },
    ]);
  });

  // A place without a card has nothing to delete, as it has no menu and no key in a wide box.
  it("offers no deletion for a place without a card", async () => {
    const { view } = await phone();

    await next(view).click();
    await cell(view, 0, 0).click();
    const dialog = view.getByRole("dialog", { name: "Scenes, Scene 2" });
    await expect.element(dialog).toBeVisible();

    expect(names(dialog.getByRole("button"))).toEqual(["Cancel", "Save"]);
  });

  it.each([
    ["a beat", "Setup", "Edit the beat", ["Add a scene", "Add a beat before", "Add a beat after", "Delete"]],
    ["a scene", "The last ferry", "Edit the scene", ["Add a scene before", "Add a scene after", "Delete"]],
  ] as const)("opens %s in its dialog on a tap, with what else a writer can do", async (_, name, heading, others) => {
    const { view } = await phone();

    await header(view, name).click();
    const dialog = view.getByRole("dialog", { name: heading });
    await expect.element(dialog.getByRole("textbox", { name: "Title" })).toHaveValue(name);
    await expect.poll(() => names(dialog.getByRole("button"))).toEqual([...others, "Cancel", "Save"]);

    await submit(view, { Title: "The crossing" });

    await expect.element(header(view, "The crossing")).toBeVisible();
  });

  it("shows the names of the layers over the cards when asked, and opens a layer on a tap", async () => {
    const { view } = await phone();
    const shows = view.getByRole("button", { name: "Names of the layers" });

    await expect.element(shows).toHaveAttribute("aria-pressed", "false");
    await expect.element(view.getByRole("rowheader")).not.toBeInTheDocument();

    await shows.click();
    await expect.element(shows).toHaveAttribute("aria-pressed", "true");
    await expect.element(view.getByRole("rowheader")).toHaveLength(4);
    // A name stands over the start of the card of its track.
    const [name, card] = [box(view.getByRole("rowheader", { name: "Scenes" })), box(cell(view, 0, 0))];
    expect(name.left).toBeCloseTo(card.left, 0);
    expect(name.top).toBeCloseTo(card.top, 0);

    await view.getByRole("rowheader", { name: "Characters" }).click();
    const dialog = view.getByRole("dialog", { name: "Edit the layer" });
    await expect.element(dialog.getByRole("textbox", { name: "Name" })).toHaveValue("Characters");
    await expect.poll(() => names(dialog.getByRole("button"))).toEqual(["Delete", "Cancel", "Save"]);
    await userEvent.keyboard("{Escape}");

    await shows.click();
    await expect.element(view.getByRole("rowheader")).not.toBeInTheDocument();
  });

  it("adds a scene from the dialog of another, opens the dialog of the new one, and shows it", async () => {
    const { view, saved } = await phone();

    await header(view, "The last ferry").click();
    await view.getByRole("button", { name: "Add a scene after" }).click();
    await expect.element(view.getByRole("textbox", { name: "Title" })).toHaveValue("");
    await submit(view, { Title: "The letter" });

    // The box moved to the scene it was given: nothing else is in view.
    await expect.poll(() => scenes(saved())).toEqual([["The last ferry", "The letter", ""], ["The storm"]]);
    await expect.element(header(view, "The letter")).toBeVisible();
    await expect.element(header(view, "The last ferry")).not.toBeInTheDocument();
  });

  it("deletes from a dialog, and takes the deletion back", async () => {
    const before = story();
    const { view, saved } = await phone(before);

    await header(view, "The last ferry").click();
    await view.getByRole("button", { name: "Delete" }).click();

    await expect.element(view.getByText("You deleted the scene “The last ferry”.")).toBeVisible();
    await expect.element(header(view, "Scene 1")).toBeVisible();

    await view.getByRole("button", { name: "Undo" }).click();

    await expect.poll(saved).toEqual(before);
    await expect.element(header(view, "The last ferry")).toBeVisible();
  });

  it("keeps the column of a beat without a scene, which offers the first one", async () => {
    const content = story();
    content.beats[1]!.scenes = [];
    const { view, saved } = await phone(content);

    await next(view).click();
    await next(view).click();
    await expect.element(header(view, "Beat 2")).toBeVisible();
    await view.getByRole("button", { name: "Add a scene" }).click();
    await submit(view, { Title: "The flood" });

    await expect.poll(() => scenes(saved())).toEqual([["The last ferry", ""], ["The flood"]]);
    await expect.element(header(view, "The flood")).toBeVisible();
  });

  it("moves across the scenes with the arrows, and opens what holds the focus with Enter", async () => {
    const { mounted, view } = await phone();
    await expect.element(header(view, "The last ferry")).toBeVisible();

    await userEvent.tab();
    expect(focused(mounted)).toBe("Setup");
    await userEvent.keyboard("{ArrowDown}{ArrowRight}");
    await expect.poll(() => focused(mounted)).toBe("Scene 2");
    await expect.element(header(view, "The last ferry")).not.toBeInTheDocument();

    await userEvent.keyboard("{ArrowDown}{Enter}");

    await expect.element(view.getByRole("dialog", { name: "Scenes, Scene 2" })).toBeVisible();
    await expect.element(field(view)).not.toBeInTheDocument();
  });
});
